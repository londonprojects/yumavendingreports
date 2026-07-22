import {MEDIA_BASE_URL} from './config';

// API image fields are relative paths; make them absolute when the media host
// is configured, otherwise drop them so UI placeholders take over.
export const resolveMediaUrl = value => {
  if (!value || typeof value !== 'string' || !value.trim()) {
    return undefined;
  }
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (!MEDIA_BASE_URL) {
    return undefined;
  }
  return `${MEDIA_BASE_URL}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
};

const parseAmount = value => {
  if (value == null || value === '') {
    return 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatApiDate = value => {
  if (!value) {
    return '';
  }
  const normalized = value.replace('T', ' ').replace(/\+\d{2}:\d{2}$/, '').replace(/Z$/, '');
  return normalized.slice(0, 16);
};

const extractConsumerName = sale =>
  sale?.consumerName || sale?.consumer?.name || sale?.memberName || null;

export const mapMarketToDevice = (market, planogram = null) => ({
  id: market.marketId,
  name: market.marketName,
  location: market.marketLocation,
  address: market.marketLocation,
  serial: market.marketId,
  status: market.isOnline ? 'online' : 'offline',
  apiStatus: market.status,
  temperature: null,
  volume: 70,
  preauthorizedAmount: parseAmount(market.preAuthAmount) || 5,
  frozen: market.status === 'FROZEN',
  freezeTimer: null,
  restocker: '',
  deviceType: market.deviceType,
  numberOfLayers: market.numberOfLayers ?? 0,
  numberOfDoors: market.numberOfDoors ?? 1,
  timeZone: market.timeZone,
  layers: planogram ? mapPlanogramToLayers(planogram) : [],
});

// The planogram API's exact field names vary, so resolve each value from a list
// of known aliases and fall back to scanning for a name-matching numeric key.
const firstNumber = (obj, fields, keyPattern) => {
  for (const field of fields) {
    const value = obj?.[field];
    if (value != null && value !== '' && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }
  if (keyPattern && obj) {
    for (const [key, value] of Object.entries(obj)) {
      if (keyPattern.test(key) && value != null && value !== '' && Number.isFinite(Number(value))) {
        return Number(value);
      }
    }
  }
  return 0;
};

const firstString = (obj, fields) => {
  for (const field of fields) {
    const value = obj?.[field];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
};

const CAPACITY_FIELDS = [
  'productsCapacity', 'productCapacity', 'capacity', 'maxCapacity', 'fullCapacity',
  'slotCapacity', 'standardCapacity', 'parLevel', 'maxQuantity', 'capacityQuantity',
];
const INVENTORY_FIELDS = [
  'productsInventory', 'productInventory', 'inventory', 'currentInventory', 'stock',
  'currentStock', 'quantity', 'currentQuantity', 'productsCount', 'count', 'remaining',
  'filledQuantity', 'currentFilling', 'current',
];
const CELL_IMAGE_FIELDS = [
  'productImage', 'productImageUrl', 'productImg', 'image', 'imageUrl', 'imgUrl', 'img', 'picUrl',
];
const CELL_PRICE_FIELDS = ['price', 'productPrice', 'salePrice', 'unitPrice'];

export const mapPlanogramToLayers = planogram => {
  const racks = planogram?.racks ?? [];
  const rowMap = new Map();

  racks.forEach(rack => {
    (rack.cells ?? []).forEach(cell => {
      const rowIndex = cell.rowIndex ?? 0;
      if (!rowMap.has(rowIndex)) {
        rowMap.set(rowIndex, []);
      }
      rowMap.get(rowIndex).push(cell);
    });
  });

  return Array.from(rowMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([rowIndex, cells]) => ({
      id: `L${rowIndex + 1}`,
      name: `Layer ${rowIndex + 1}`,
      slots: cells
        .sort((a, b) => (a.columnIndex ?? 0) - (b.columnIndex ?? 0))
        .map((cell, index) => ({
          slot: (cell.columnIndex ?? index) + 1,
          product: cell.productName || cell.product || '',
          productId: cell.productId,
          image: resolveMediaUrl(firstString(cell, CELL_IMAGE_FIELDS)),
          capacity: firstNumber(cell, CAPACITY_FIELDS, /capacity|parlevel|maxqty|maxquantity/i),
          current: firstNumber(cell, INVENTORY_FIELDS, /inventory|stock|remaining|filled|quantity|count/i),
          price: firstNumber(cell, CELL_PRICE_FIELDS),
        })),
    }));
};

export const mapProduct = product => ({
  id: product.productId,
  name: product.productName,
  gtin: product.productCode || '',
  price: parseAmount(product.price),
  cost: parseAmount(product.cost),
  priceUnit: product.priceUnit,
  standardized: Boolean(product.productCode),
  category: 'Other',
  image: resolveMediaUrl(product.productImage || product.image || product.imgUrl || product.img),
  onSale: product.onSale,
  alias: product.alias,
});

const CARD_NUMBER_FIELDS = ['cardNumber', 'cardNo', 'maskedPan', 'pan', 'accountNumber'];

const extractCardNumber = sale => {
  const sources = [...(sale.saleTenders ?? []), sale];
  for (const source of sources) {
    for (const field of CARD_NUMBER_FIELDS) {
      const value = source?.[field];
      if (value != null && String(value).trim()) {
        return String(value).trim();
      }
    }
  }
  return null;
};

export const mapSaleToOrder = (sale, deviceNameById = {}) => {
  const items = sale.saleItems ?? [];
  const firstItem = items[0];
  const status =
    sale.status === 'PAID'
      ? 'Paid'
      : sale.status === 'UNPAID'
        ? 'Unpaid'
        : sale.status;

  return {
    id: sale.saleId,
    deviceId: sale.marketId,
    deviceName: deviceNameById[sale.marketId] || sale.marketId,
    product:
      items.length > 1
        ? `${items.length} items`
        : firstItem?.productName || '—',
    productId: firstItem?.productId,
    amount: parseAmount(sale.saleGrossTotal || sale.saleTotal),
    status,
    date: formatApiDate(sale.saleDtm),
    refund: sale.isRefund
      ? {
          amount: parseAmount(sale.saleGrossTotal || sale.saleTotal),
          status: 'Approved',
          date: formatApiDate(sale.saleDtm),
        }
      : null,
    tax: parseAmount(sale.saleTaxes?.taxesTotal),
    consumerId: sale.consumerId,
    consumerName: extractConsumerName(sale),
    cardNumber: extractCardNumber(sale),
    paymentType: sale.saleTenders?.[0]?.type,
    items,
    raw: sale,
  };
};

export const mapSaleToTransaction = sale => {
  const amount = parseAmount(sale.saleGrossTotal || sale.saleTotal);
  return {
    id: `TXN-${sale.saleId}`,
    date: sale.saleDtm?.split('T')[0] || '',
    type: sale.isRefund ? 'Refund' : 'Sale',
    orderId: sale.saleId,
    amount: sale.isRefund ? -Math.abs(amount) : amount,
  };
};

export const mapRestockRecord = record => {
  const typeByOperation = {
    1: 'Restock',
    2: 'Restock',
    3: 'Restock',
    4: 'Sale',
    5: 'Adjustment',
    6: 'Adjustment',
    7: 'Adjustment',
    8: 'Adjustment',
  };

  return {
    id: record.restockOpLogId || `${record.marketId}-${record.createdAt}`,
    date: formatApiDate(record.createdAt),
    deviceName: record.marketName,
    deviceId: record.marketId,
    product: record.operationTypeLabel || '—',
    type: typeByOperation[record.operationType] || record.operationTypeLabel || 'Adjustment',
    quantity: 0,
    by: record.operatorUserName || 'System',
    raw: record,
  };
};

export const buildDeviceNameMap = devices =>
  devices.reduce((acc, device) => {
    acc[device.id] = device.name;
    return acc;
  }, {});

export const mapInventoryProduct = product => ({
  id: product.productId,
  name: product.productName,
  gtin: product.productCode || '',
  price: parseAmount(product.price),
  cost: parseAmount(product.cost),
  image: resolveMediaUrl(product.productImage || product.image || product.imgUrl || product.img),
  onSale: product.onSale,
  alias: product.alias,
  totalStock: product.totalStock ?? 0,
  totalCapacity: product.totalCapacity ?? 0,
  marketCount: product.marketCount ?? 0,
  markets: (product.markets ?? []).map(market => ({
    marketId: market.marketId,
    marketName: market.marketName,
    stock: market.stock ?? 0,
    racks: market.racks ?? [],
  })),
});

const CURRENCY_SYMBOLS = {
  '109001': '¥',
  '109005': '$',
  '109006': '€',
  '109007': '£',
};

export const getCurrencySymbol = code => CURRENCY_SYMBOLS[code] || '$';
