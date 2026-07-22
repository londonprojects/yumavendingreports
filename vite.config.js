import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

// The HAHA OpenAPI hosts do not send CORS headers, so a browser cannot call
// them directly. In dev we proxy through Vite: the app talks to relative
// prefixes (/haha-test, /haha-prod) which are forwarded to the real hosts.
// For production, put an equivalent reverse proxy in front of the static build.
const HAHA_TEST = 'https://thor-openapi-test.hahavending.com';
const HAHA_PROD = 'https://thor-openapi.hahavending.com';

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
    },
  },
});
