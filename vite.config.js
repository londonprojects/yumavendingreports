import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

// The HAHA OpenAPI hosts do not send CORS headers, so a browser cannot call
// them directly. In dev we proxy through Vite: the app talks to relative
// prefixes (/haha-test, /haha-prod) which are forwarded to the real hosts.
// For production, put an equivalent reverse proxy in front of the static build.
const HAHA_TEST = 'https://thor-openapi-test.hahavending.com';
const HAHA_PROD = 'https://thor-openapi.hahavending.com';

// In production the /api/* AI-insights endpoint is handled by the same Worker
// that serves this static build (see wrangler.jsonc). In dev, Vite proxies it
// to a local `wrangler dev` instance (see README) so the Kimi API key never
// has to live in this app's own JS.
const WORKER_DEV = 'http://127.0.0.1:8787';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    proxy: {
      '/haha-test': {
        target: HAHA_TEST,
        changeOrigin: true,
        secure: true,
        rewrite: path => path.replace(/^\/haha-test/, ''),
      },
      '/haha-prod': {
        target: HAHA_PROD,
        changeOrigin: true,
        secure: true,
        rewrite: path => path.replace(/^\/haha-prod/, ''),
      },
      '/api': {
        target: WORKER_DEV,
        changeOrigin: true,
      },
    },
  },
});
