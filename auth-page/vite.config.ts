import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Funnel path-routes /oauth to this app (everything else goes to the MCP
// server), so the built assets MUST live under /oauth/ — with base '/', the
// browser would request /assets/... which routes to the MCP listener and the
// page never loads. serve.mjs strips the /oauth prefix back off when resolving
// files in dist/. The consent flow is at /oauth/authorize.
export default defineConfig({
  plugins: [react()],
  base: '/oauth/',
});
