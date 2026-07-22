import {buildLowStockAlert, getStockSeverity} from './stockInsights';

const parseAmount = value => {
  if (value == null || value === '') {
    return 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseRecordDate = value => {
  if (!value) {
    return null;
  }
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const toLocalDateString = date => {
  const pad = n => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export const getDateRangeForPeriod = period => {
  const end = new Date();
  const start = new Date();

  switch (period) {
    case 'Today':
      start.setHours(0, 0, 0, 0);
      break;
    case 'Week':
      start.setDate(end.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      break;
    case 'Month':
      start.setDate(end.getDate() - 29);
      start.setHours(0, 0, 0, 0);
      break;
    default:
      start.setDate(end.getDate() - 6);
      start.setHours(0, 0, 0, 0);
  }

  return {
    start_time: toLocalDateString(start),
    end_time: toLocalDateString(end),
  };
};

export const filterRecordsByPeriod = (records, period) => {
  const end = new Date();
  const start = new Date();

  switch (period) {
    case 'Today':
      start.setHours(0, 0, 0, 0);
      break;
    case 'Week':
      start.setDate(end.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      break;
    case 'Month':
      start.setDate(end.getDate() - 29);
      start.setHours(0, 0, 0, 0);
      break;
    default:
      return records;
  }

  return records.filter(record => {
    const date = parseRecordDate(record.date);
    return date && date >= start && date <= end;
  });
};

const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const buildSalesStats = (orders, period = 'week') => {
  const days = period === 'month' ? 30 : 7;
  const buckets = Array.from({length: days}, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (days - 1 - index));
    date.setHours(0, 0, 0, 0);
    return {
      date,
      key: toLocalDateString(date),
      day: period === 'month'
        ? `${date.getMonth() + 1}/${date.getDate()}`
        : dayLabels[date.getDay()],
      revenue: 0,
      orders: 0,
    };
  });

  const bucketByKey = buckets.reduce((acc, bucket) => {
    acc[bucket.key] = bucket;
    return acc;
  }, {});

  orders.forEach(order => {
    const key = order.date?.slice(0, 10);
    if (!key || !bucketByKey[key]) return;

    bucketByKey[key].orders += 1;
    const status = String(order.status || '').toLowerCase();
    if (status !== 'unpaid' && status !== 'refunded') {
      bucketByKey[key].revenue += parseAmount(order.amount);
    }
  });

  return buckets;
};

export const computeFinancialSummary = transactions => {
  const salesTotal = transactions
    .filter(transaction => transaction.type === 'Sale')
    .reduce((sum, transaction) => sum + parseAmount(transaction.amount), 0);

  const refundTotal = transactions
    .filter(transaction => transaction.type === 'Refund')
    .reduce((sum, transaction) => sum + Math.abs(parseAmount(transaction.amount)), 0);

  const netTotal = transactions.reduce(
    (sum, transaction) => sum + parseAmount(transaction.amount),
    0,
  );

  return {
    totalBalance: netTotal,
    pendingWithdrawal: 0,
    salesTotal,
    refundTotal,
  };
};

// Per-product sales velocity, derived from the sales window (last ~30 days).
// Returns a map keyed by productId with: units sold, number of sale events,
// first/last sold timestamps, and the average time between units selling.
export const buildProductSalesMetrics = (orders = []) => {
  const isCounted = order => {
    const status = String(order.status || '').toLowerCase();
    if (status === 'unpaid' || status === 'refunded') return false;
    if (order.refund) return false;
    return true;
  };

  const byProduct = new Map();

  orders.forEach(order => {
    if (!isCounted(order)) return;
    const ts = parseRecordDate(order.date);
    if (!ts) return;

    const items =
      order.items && order.items.length
        ? order.items
        : order.productId
          ? [{productId: order.productId, quantity: 1}]
          : [];

    items.forEach(item => {
      const pid = item.productId;
      if (pid == null) return;
      const qty = Number(item.quantity) || 1;

      let entry = byProduct.get(pid);
      if (!entry) {
        entry = {units: 0, events: 0, first: ts, last: ts};
        byProduct.set(pid, entry);
      }
      entry.units += qty;
      entry.events += 1;
      if (ts < entry.first) entry.first = ts;
      if (ts > entry.last) entry.last = ts;
    });
  });

  const result = {};
  byProduct.forEach((entry, pid) => {
    const spanMs = entry.last.getTime() - entry.first.getTime();
    // Average time for one unit to sell across the observed span.
    const avgTimeToSellMs = entry.units >= 2 ? spanMs / (entry.units - 1) : null;
    // Daily rate over the days observed so far (min 1 day to avoid spikes).
    const daysObserved = Math.max(spanMs / 86400000, 1);
    const unitsPerDay = entry.units / daysObserved;

    result[pid] = {
      unitsSold: entry.units,
      salesEvents: entry.events,
      firstSold: entry.first,
      lastSold: entry.last,
      avgTimeToSellMs,
      unitsPerDay,
    };
  });

  return result;
};

export const buildLowStockAlerts = (inventoryProducts, deviceNameById = {}, threshold = 3) => {
  const alerts = [];

  inventoryProducts.forEach(product => {
    (product.markets ?? []).forEach(market => {
      const stock = market.stock ?? 0;
      const capacity = product.totalCapacity ?? market.capacity ?? 0;
      const severity = getStockSeverity(stock, capacity, threshold);
      if (!severity) {
        return;
      }

      alerts.push(
        buildLowStockAlert({
          id: `lowstock-${product.id}-${market.marketId}`,
          deviceId: market.marketId,
          deviceName: market.marketName || deviceNameById[market.marketId] || market.marketId,
          productName: product.name,
          productId: product.id,
          stock,
          capacity,
          severity,
        }),
      );
    });
  });

  return alerts;
};
