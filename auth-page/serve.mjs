// Tiny dependency-free static server for the built auth page (auth-page/dist/).
//
// On the Pi this runs behind Tailscale Funnel: `/oauth` is path-routed here and
// the SPA renders the Stytch consent screen at /oauth/authorize. It only needs
// to serve a handful of static files and fall back to index.html for client-side
// routes — so it stays a single file with no dependencies.

import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

function contentType(filePath) {
  return CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

async function sendFile(res, filePath, status = 200) {
  const body = await readFile(filePath);
  res.writeHead(status, {
    'content-type': contentType(filePath),
    'content-length': body.length,
  });
  res.end(body);
}

/**
 * A static file server rooted at `root` (the built `dist/`).
 *  - existing file  → served with its content type
 *  - unknown path with NO extension → index.html (SPA client-side route)
 *  - unknown path WITH an extension → 404 (a real missing asset, not a route)
 *  - anything resolving outside `root` → 403 (path-traversal guard)
 *
 * `basePath` (e.g. `/oauth`) is stripped from the front of each request path
 * before resolving. Funnel path-routes `/oauth` here and the built assets are
 * emitted under `/oauth/` (Vite `base`); stripping it lets serve.mjs find them
 * in `dist/` whether or not Funnel itself strips the prefix — a request that
 * arrives already-stripped simply has no prefix to remove.
 */
export function createServer(root, { basePath = '' } = {}) {
  const rootDir = path.resolve(root);
  const indexFile = path.join(rootDir, 'index.html');
  const prefix = basePath.replace(/\/+$/, ''); // no trailing slash

  return http.createServer(async (req, res) => {
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { allow: 'GET, HEAD' }).end('Method Not Allowed');
        return;
      }

      // Decode the raw path ourselves rather than via `new URL()`, whose parser
      // normalizes `%2e%2e` away before we can see it — leaving the traversal
      // guard below as the actual, testable defense instead of dead code.
      const rawPath = (req.url ?? '/').split(/[?#]/, 1)[0];
      let pathname;
      try {
        pathname = decodeURIComponent(rawPath);
      } catch {
        res.writeHead(400).end('Bad Request');
        return;
      }

      // Strip the mount prefix if the request still carries it.
      if (prefix && (pathname === prefix || pathname.startsWith(prefix + '/'))) {
        pathname = pathname.slice(prefix.length) || '/';
      }

      // Resolve the request against the root and confirm it stays inside it.
      const candidate = path.resolve(rootDir, '.' + pathname);
      if (candidate !== rootDir && !candidate.startsWith(rootDir + path.sep)) {
        res.writeHead(403).end('Forbidden');
        return;
      }

      let target = candidate;
      const info = await stat(candidate).catch(() => null);
      if (info?.isDirectory()) {
        target = path.join(candidate, 'index.html');
      }

      const targetInfo =
        target === candidate ? info : await stat(target).catch(() => null);

      if (targetInfo?.isFile()) {
        await sendFile(res, target);
        return;
      }

      // No file: SPA fallback for extension-less paths (client routes); else 404.
      if (path.extname(pathname) === '') {
        await sendFile(res, indexFile);
        return;
      }

      res.writeHead(404).end('Not Found');
    } catch {
      res.writeHead(500).end('Internal Server Error');
    }
  });
}

// When run directly (systemd on the Pi), serve dist/ on 127.0.0.1:8088.
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const root = path.join(dir, 'dist');
  const host = process.env.HOST ?? '127.0.0.1';
  const port = Number(process.env.PORT ?? 8088);
  const basePath = process.env.BASE_PATH ?? '/oauth';
  createServer(root, { basePath }).listen(port, host, () => {
    console.log(
      `auth-page static server: http://${host}:${port} (root: ${root}, basePath: ${basePath || '/'})`,
    );
  });
}
