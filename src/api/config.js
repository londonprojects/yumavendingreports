// In the browser we cannot hit the HAHA hosts directly (no CORS), so requests
// go through the Vite dev proxy prefixes defined in vite.config.js. Behind a
// production reverse proxy, keep the same prefixes pointing at the real hosts.
export const API_ENVIRONMENTS = {
  test: '/haha-test',
  production: '/haha-prod',
};

export const API_PATHS = {
  token: '/open/auth/token',
  markets: '/open/api/v1/markets',
  products: '/open/api/v1/products',
  sales: '/open/api/v1/sales',
  restockRecords: '/open/api/v1/restock/records',
  inventoryProducts: '/open/api/v1/inventory/products',
};

// Product images from the API are relative paths (e.g. "/img/2025.../x.jpg"),
// served from HAHA's CDN.
export const MEDIA_BASE_URL = 'https://overseas-resource-cdn.hahabianli.com';

export const LOW_STOCK_THRESHOLD = 3;

export const DEFAULT_ENVIRONMENT = 'test';
export const TOKEN_REFRESH_BUFFER_MS = 2 * 24 * 60 * 60 * 1000;
export const ONLINE_STATUS_POLL_INTERVAL_MS = 60 * 1000;
export const BACKGROUND_SYNC_INTERVAL_MS = 5 * 60 * 1000;
