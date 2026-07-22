import {
  getMarkets,
  getProducts,
  getSales,
  getRestockRecords,
  getInventoryProducts,
  getPlanogram,
  mapMarketToDevice,
  mapPlanogramToLayers,
  mapProduct,
  mapSaleToOrder,
  mapSaleToTransaction,
  mapRestockRecord,
  mapInventoryProduct,
  buildSalesStats,
  computeFinancialSummary,
  buildDeviceNameMap,
  buildLowStockAlerts,
  getDateRangeForPeriod,
  toLocalDateString,
} from './index';

const todayIso = () => toLocalDateString(new Date());

// Most common currency code across the catalog (all products on an account
// usually share one). Falls back to undefined so the symbol helper uses '$'.
const dominantCurrency = products => {
  const counts = {};
  products.forEach(p => {
    if (p.priceUnit) counts[p.priceUnit] = (counts[p.priceUnit] || 0) + 1;
  });
  let best;
  let bestCount = 0;
  Object.entries(counts).forEach(([code, n]) => {
    if (n > bestCount) {
      best = code;
      bestCount = n;
    }
  });
  return best;
};

/**
 * Phase 1 — the fast load. Machines, product catalog, per-machine inventory and
 * restock records all fetch in parallel. Price/cost come from the catalog (the
 * inventory endpoint carries none), joined onto each inventory product by id,
 * falling back to barcode.
 */
export const loadCoreData = async () => {
  const results = await Promise.allSettled([
    getMarkets(),
    getProducts(),
    getInventoryProducts({page_size: 100}),
  ]);

  const [markets, apiProducts, apiInventory] = results.map(result =>
    result.status === 'fulfilled' ? result.value : [],
  );

  const devices = markets.map(market => mapMarketToDevice(market));
  const products = apiProducts.map(mapProduct);
  const currencyCode = dominantCurrency(products);

  const priceById = new Map();
  const priceByCode = new Map();
  products.forEach(p => {
    if (p.id != null) priceById.set(p.id, p);
    if (p.gtin) priceByCode.set(p.gtin, p);
  });

  const inventoryProducts = apiInventory.map(mapInventoryProduct).map(ip => {
    const match = (ip.id != null && priceById.get(ip.id)) || (ip.gtin && priceByCode.get(ip.gtin));
    return match ? {...ip, price: match.price, cost: match.cost} : ip;
  });

  const deviceNameById = buildDeviceNameMap(devices);
  const alerts = buildLowStockAlerts(inventoryProducts, deviceNameById);

  return {devices, products, inventoryProducts, alerts, currencyCode};
};

/**
 * Phase 2 — the slow load. Sales and restock records both page through
 * cursor-by-cursor (thousands of rows), so they run in the background, in
 * parallel, after the core data has already rendered.
 */
export const loadSalesData = async (deviceNameById = {}) => {
  const [salesResult, restockResult] = await Promise.allSettled([
    getSales({...getDateRangeForPeriod('Month'), page_size: 100}).catch(() =>
      getSales({page_size: 100}),
    ),
    getRestockRecords({page_size: 100}),
  ]);

  const apiSales = salesResult.status === 'fulfilled' ? salesResult.value : [];
  const apiRestockRecords = restockResult.status === 'fulfilled' ? restockResult.value : [];

  const orders = apiSales.map(sale => mapSaleToOrder(sale, deviceNameById));
  const transactions = apiSales.map(mapSaleToTransaction);
  const salesStats = buildSalesStats(orders);
  const financialSummary = computeFinancialSummary(transactions);
  const restockRecords = apiRestockRecords.map(mapRestockRecord);

  const today = todayIso();
  const todayOrders = orders.filter(order => (order.date || '').slice(0, 10) === today);
  const todayRevenue = todayOrders
    .filter(order => {
      const status = String(order.status || '').toLowerCase();
      return status !== 'unpaid' && status !== 'refunded';
    })
    .reduce((sum, order) => sum + order.amount, 0);

  return {
    orders,
    transactions,
    salesStats,
    financialSummary,
    restockRecords,
    todayOrders,
    todayRevenue,
  };
};

export const loadDevicePlanogram = async stickerNum => {
  const planogram = await getPlanogram(stickerNum);
  return mapPlanogramToLayers(planogram);
};

// Long sales history for a single machine. The sales endpoint supports a
// `sticker_num` filter, so this stays a small payload even over many months.
export const loadMachineSalesHistory = async (stickerNum, months = 12) => {
  const end = new Date();
  const start = new Date();
  start.setMonth(start.getMonth() - (months - 1));
  start.setDate(1);

  const sales = await getSales({
    sticker_num: stickerNum,
    start_time: toLocalDateString(start),
    end_time: toLocalDateString(end),
    page_size: 100,
  });

  return sales.map(sale => mapSaleToOrder(sale));
};
