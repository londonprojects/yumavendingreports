// Deterministic profit-margin and slot-allocation analysis. The AI layer
// (Kimi, via the /api/insights Worker) only narrates these numbers — it never
// computes them, so the figures stay reproducible and don't depend on model
// output.

import {toLocalDateString} from './analytics';

const isCountedSale = o => {
  const s = String(o.status || '').toLowerCase();
  return s !== 'unpaid' && s !== 'refunded' && !o.refund;
};

// Highest/lowest profit-margin products across the catalog. Products missing
// either a price or a cost are skipped — margin is meaningless without both.
// Cost ≥ price is treated as unreliable catalog data (a vending SKU sold at or
// below cost is essentially never real — it's almost always a missing/placeholder
// cost value) and excluded rather than shown as a nonsensical "-1400% margin".
export const buildMarginLeaderboard = (catalog = [], topN = 5) => {
  const withCost = catalog.filter(p => (p.price || 0) > 0 && (p.cost || 0) > 0);
  const ranked = withCost
    .filter(p => p.price > p.cost)
    .map(p => {
      const margin = p.price - p.cost;
      return {
        id: p.id,
        name: p.name,
        image: p.image,
        price: p.price,
        cost: p.cost,
        margin,
        marginPct: margin / p.price,
      };
    })
    .sort((a, b) => b.marginPct - a.marginPct);

  return {
    ranked,
    top: ranked.slice(0, topN),
    bottom: ranked.slice(-topN).reverse(),
    excludedCount: withCost.length - ranked.length,
  };
};

// A product's per-unit margin, or null when the catalog's cost value can't be
// trusted (missing, or ≥ price — see buildMarginLeaderboard for why that's
// treated as bad data rather than a real loss-making item).
const reliableMargin = info => {
  if (!info || !(info.price > 0) || !(info.cost > 0) || info.cost >= info.price) return null;
  return info.price - info.cost;
};

// Per-machine, per-product sales velocity (units/day) from order history.
export const buildVelocityByDeviceProduct = (orders = []) => {
  const raw = new Map(); // `${deviceId}:${productId}` -> {units, first, last}
  orders.forEach(o => {
    if (!isCountedSale(o)) return;
    const ts = new Date((o.date || '').replace(' ', 'T'));
    if (Number.isNaN(ts.getTime())) return;
    (o.items || []).forEach(it => {
      if (it.productId == null) return;
      const key = `${o.deviceId}:${it.productId}`;
      let e = raw.get(key);
      if (!e) {
        e = {units: 0, first: ts, last: ts};
        raw.set(key, e);
      }
      e.units += Number(it.quantity) || 1;
      if (ts < e.first) e.first = ts;
      if (ts > e.last) e.last = ts;
    });
  });

  const velocity = new Map();
  raw.forEach((e, key) => {
    const days = Math.max((e.last.getTime() - e.first.getTime()) / 86400000, 1);
    velocity.set(key, e.units / days);
  });
  return velocity;
};

// How many slots a product currently occupies in a machine's planogram.
const countSlotsByProduct = layers => {
  const counts = new Map();
  (layers || []).forEach(layer =>
    (layer.slots || []).forEach(slot => {
      if (!slot.product) return;
      const key = slot.productId ?? slot.product;
      counts.set(key, (counts.get(key) || 0) + 1);
    }),
  );
  return counts;
};

// Per-(device, product) audit of current vs. recommended slot count. Ranking
// uses per-slot profit productivity (total profit/day ÷ how many slots it
// currently occupies), not raw total profit, so a product spread across 2
// slots is compared fairly against one cramming the same demand into 1.
// Products with zero recorded sales in the window are flagged for outright
// removal — no evidence they sell at all — rather than merely "keep at 1".
// `profitDelta` estimates the daily profit change if the recommendation is
// followed, assuming a product's own observed per-slot rate holds when its
// slot count changes; that's a simplifying assumption (real shelf elasticity
// may differ), not a guarantee — surfaced to the UI as an estimate.
export const buildSlotAudit = ({devices = [], orders = [], planogramsByDevice = {}, catalog = []}) => {
  const infoById = new Map();
  catalog.forEach(p => {
    if (p.id != null) {
      infoById.set(p.id, {cost: p.cost || 0, price: p.price || 0, name: p.name});
    }
  });

  const velocity = buildVelocityByDeviceProduct(orders);
  const rows = [];

  devices.forEach(device => {
    const layers = planogramsByDevice[device.id];
    if (!layers) return; // not loaded yet
    const slotCounts = countSlotsByProduct(layers);
    if (slotCounts.size === 0) return;

    const entries = Array.from(slotCounts.entries()).map(([productKey, currentSlots]) => {
      const info = infoById.get(productKey);
      const margin = reliableMargin(info);
      const unitsPerDay = velocity.get(`${device.id}:${productKey}`) || 0;
      const score = margin != null ? unitsPerDay * margin : unitsPerDay; // current profit/day estimate
      return {
        deviceId: device.id,
        deviceName: device.name,
        productId: productKey,
        productName: info?.name || String(productKey),
        unitsPerDay,
        margin,
        marginPct: margin != null && info.price > 0 ? margin / info.price : null,
        currentSlots,
        score,
        profitPerSlot: score / currentSlots,
      };
    });

    // Rank sellers only — a dead product's score of 0 would just drag the
    // cutoff down and isn't a meaningful comparison point for "who deserves a
    // 2nd slot" anyway.
    const sellers = entries.filter(e => e.unitsPerDay > 0);
    const sorted = [...sellers].sort((a, b) => b.profitPerSlot - a.profitPerSlot);
    const avgProfitPerSlot = sorted.reduce((s, e) => s + e.profitPerSlot, 0) / (sorted.length || 1);
    const cutoffIndex = Math.max(0, Math.ceil(sorted.length / 3) - 1);
    const rankCutoff = sorted[cutoffIndex]?.profitPerSlot ?? 0;

    entries.forEach(e => {
      let recommendedSlots;
      let direction;
      if (e.unitsPerDay === 0) {
        recommendedSlots = 0;
        direction = 'remove';
      } else {
        const qualifies = e.profitPerSlot >= rankCutoff && e.profitPerSlot > avgProfitPerSlot;
        recommendedSlots = qualifies ? 2 : 1;
        direction =
          recommendedSlots > e.currentSlots ? 'increase' : recommendedSlots < e.currentSlots ? 'decrease' : 'ok';
      }
      const projectedProfitRate = e.profitPerSlot * recommendedSlots;
      rows.push({
        ...e,
        recommendedSlots,
        direction,
        mismatch: recommendedSlots !== e.currentSlots,
        projectedProfitRate,
        profitDelta: projectedProfitRate - e.score,
      });
    });
  });

  return rows;
};

// Rolls per-machine rows up to one recommendation per product across every
// machine it appears in — answers "which drinks should get 2 slots (or get
// removed)" at a catalog level rather than machine-by-machine. `profitDeltaSum`
// is the estimated total daily profit change across every machine if this
// product's recommendation is followed everywhere it's stocked.
export const summarizeSlotAuditByProduct = (rows = []) => {
  const byProduct = new Map();

  rows.forEach(r => {
    let e = byProduct.get(r.productId);
    if (!e) {
      e = {
        productId: r.productId,
        productName: r.productName,
        machines: 0,
        currentSlotsTotal: 0,
        recommendedSlotsTotal: 0,
        increaseCount: 0,
        decreaseCount: 0,
        removeCount: 0,
        unitsPerDaySum: 0,
        marginPctSum: 0,
        marginSamples: 0,
        profitDeltaSum: 0,
      };
      byProduct.set(r.productId, e);
    }
    e.machines += 1;
    e.currentSlotsTotal += r.currentSlots;
    e.recommendedSlotsTotal += r.recommendedSlots;
    if (r.direction === 'increase') e.increaseCount += 1;
    if (r.direction === 'decrease') e.decreaseCount += 1;
    if (r.direction === 'remove') e.removeCount += 1;
    e.unitsPerDaySum += r.unitsPerDay;
    e.profitDeltaSum += r.profitDelta;
    if (r.marginPct != null) {
      e.marginPctSum += r.marginPct;
      e.marginSamples += 1;
    }
  });

  return Array.from(byProduct.values())
    .map(e => ({
      ...e,
      avgUnitsPerDay: e.unitsPerDaySum / e.machines,
      avgMarginPct: e.marginSamples ? e.marginPctSum / e.marginSamples : null,
      opportunity: e.recommendedSlotsTotal - e.currentSlotsTotal,
      // Unanimous across every machine that stocks it → a clean "remove
      // everywhere" call; otherwise it's a mixed bag, not a blanket removal.
      removeEverywhere: e.removeCount === e.machines,
    }))
    .sort((a, b) => b.profitDeltaSum - a.profitDeltaSum);
};

// Groups the raw per-(device, product) rows by machine for the "how are
// machines currently organized" breakdown, ranked highest-opportunity first.
export const groupSlotAuditByMachine = (rows = []) => {
  const byDevice = new Map();
  rows.forEach(r => {
    if (!byDevice.has(r.deviceId)) {
      byDevice.set(r.deviceId, {deviceId: r.deviceId, deviceName: r.deviceName, rows: []});
    }
    byDevice.get(r.deviceId).rows.push(r);
  });
  return Array.from(byDevice.values()).map(g => ({
    ...g,
    rows: [...g.rows].sort((a, b) => b.score - a.score),
  }));
};

// Ranks machines by how much daily profit is at risk from their current
// low/out-of-stock slots — units/day (recent velocity, per machine+product) ×
// margin per unit, summed across every unstocked slot. This is the "at a
// glance, which machine loses us the most money by staying empty" queue; it
// only needs the inventory-endpoint alerts already loaded for every machine
// (data.alerts), not a per-machine planogram fetch, so it's available
// immediately on the machines list.
export const buildRestockPriority = ({devices = [], alerts = [], orders = [], catalog = []}) => {
  const infoById = new Map();
  catalog.forEach(p => {
    if (p.id != null) infoById.set(p.id, {cost: p.cost || 0, price: p.price || 0, name: p.name});
  });
  const velocity = buildVelocityByDeviceProduct(orders);

  const byDevice = new Map();
  devices.forEach(d =>
    byDevice.set(d.id, {
      deviceId: d.id,
      deviceName: d.name,
      status: d.status,
      criticalCount: 0,
      warningCount: 0,
      items: [],
      profitAtRisk: 0,
    }),
  );

  alerts.forEach(a => {
    if (a.resolved || a.type !== 'Low Stock') return;
    const entry = byDevice.get(a.deviceId);
    if (!entry) return;

    const info = infoById.get(a.productId);
    const margin = reliableMargin(info) ?? 0;
    const unitsPerDay = velocity.get(`${a.deviceId}:${a.productId}`) || 0;
    const dailyProfitAtRisk = margin * unitsPerDay;

    entry.items.push({
      productId: a.productId,
      productName: a.productName,
      stock: a.stock,
      capacity: a.capacity,
      severity: a.severity,
      unitsPerDay,
      margin,
      dailyProfitAtRisk,
    });
    entry.profitAtRisk += dailyProfitAtRisk;
    if (a.severity === 'critical') entry.criticalCount += 1;
    else entry.warningCount += 1;
  });

  return Array.from(byDevice.values())
    .filter(e => e.criticalCount > 0 || e.warningCount > 0)
    .map(e => ({...e, items: e.items.sort((a, b) => b.dailyProfitAtRisk - a.dailyProfitAtRisk)}))
    .sort((a, b) => b.profitAtRisk - a.profitAtRisk);
};

const MACHINE_COLORS = ['#3D2EAA', '#10B981', '#F59E0B', '#EF4444', '#06B6D4', '#8B5CF6', '#64748B'];

// Daily profit (revenue − COGS, using only reliable margins) per machine over
// the trailing `days`, for the dashboard's profit-over-time chart. Machines
// are ranked by total profit in the window; only the top `topN` get their own
// line, the rest are folded into one "Other machines" line so a large estate
// doesn't turn into an unreadable tangle of colors.
export const buildProfitOverTime = ({orders = [], devices = [], catalog = [], days = 30, topN = 6}) => {
  const infoById = new Map();
  catalog.forEach(p => {
    if (p.id != null) infoById.set(p.id, {cost: p.cost || 0, price: p.price || 0});
  });
  const deviceNameById = new Map(devices.map(d => [d.id, d.name]));

  const dayKeys = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dayKeys.push(toLocalDateString(d));
  }
  const dayIndex = new Map(dayKeys.map((k, i) => [k, i]));

  const profitByDevice = new Map();
  const totalByDevice = new Map();

  orders.forEach(o => {
    if (!isCountedSale(o)) return;
    const idx = dayIndex.get((o.date || '').slice(0, 10));
    if (idx == null) return;

    let profit = 0;
    (o.items || []).forEach(it => {
      const margin = reliableMargin(infoById.get(it.productId));
      if (margin == null) return;
      profit += margin * (Number(it.quantity) || 1);
    });

    if (!profitByDevice.has(o.deviceId)) profitByDevice.set(o.deviceId, new Array(days).fill(0));
    profitByDevice.get(o.deviceId)[idx] += profit;
    totalByDevice.set(o.deviceId, (totalByDevice.get(o.deviceId) || 0) + profit);
  });

  const ranked = Array.from(totalByDevice.entries()).sort((a, b) => b[1] - a[1]);
  const topIds = ranked.slice(0, topN).map(([id]) => id);
  const otherIds = ranked.slice(topN).map(([id]) => id);

  const series = topIds.map((id, i) => ({
    deviceId: id,
    deviceName: deviceNameById.get(id) || id,
    color: MACHINE_COLORS[i % MACHINE_COLORS.length],
    points: profitByDevice.get(id),
    total: totalByDevice.get(id),
  }));

  if (otherIds.length > 0) {
    const combined = new Array(days).fill(0);
    otherIds.forEach(id => profitByDevice.get(id).forEach((v, i) => (combined[i] += v)));
    series.push({
      deviceId: '__other__',
      deviceName: `Other machines (${otherIds.length})`,
      color: MACHINE_COLORS[topN % MACHINE_COLORS.length],
      points: combined,
      total: otherIds.reduce((s, id) => s + (totalByDevice.get(id) || 0), 0),
    });
  }

  const labels = dayKeys.map(k => {
    const [, m, d] = k.split('-');
    return `${Number(m)}/${Number(d)}`;
  });

  return {labels, series, totalProfit: Array.from(totalByDevice.values()).reduce((s, v) => s + v, 0)};
};
