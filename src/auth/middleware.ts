import type { RequestHandler } from "express";
import type { AuthConfig } from "../config.js";
import type { Actor } from "../context.js";
import type { Authorizer } from "./authorize.js";

/** Express `Request.actor`, set by the authenticate middleware on success. */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      actor?: Actor;
    }
  }
}

/** RFC 9728 path served on the public listener, pointing MCP clients at Stytch. */
export const PROTECTED_RESOURCE_PATH = "/.well-known/oauth-protected-resource";

/**
 * Express adapter over an {@link Authorizer}: on success it stamps `req.actor`
 * and continues; otherwise it sends the decided status (with a
 * `WWW-Authenticate` challenge on 401) and stops. All auth logic lives in the
 * authorizer — this only maps its result onto the response.
 */
export function makeAuthenticateMiddleware(authorize: Authorizer): RequestHandler {
  return (req, res, next) => {
    authorize(req.header("authorization"))
      .then((result) => {
        if (result.ok) {
          req.actor = result.actor;
          next();
          return;
        }
        if (result.wwwAuthenticate) {
          res.setHeader("WWW-Authenticate", result.wwwAuthenticate);
        }
        res.status(result.status).json({ error: result.message });
      })
      .catch(next);
  };
}

/**
 * RFC 9728 Protected Resource Metadata: names this resource and the Stytch
 * Authorization Server, so an MCP client can discover where to obtain a token.
 */
export function makeResourceMetadataHandler(auth: AuthConfig): RequestHandler {
  const body = {
    resource: auth.resource,
    authorization_servers: auth.authorizationServers,
    bearer_methods_supported: ["header"],
  };
  return (_req, res) => {
    res.json(body);
  };
}
