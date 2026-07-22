import {buildRestockPriority} from './insights';
import {nearestNeighborRoute} from './routing';

// Splits machines needing a restock into visit-urgency tiers — "today" (has
// at least one fully out-of-stock item) vs. "this week" (only running-low
// items) — and, within each tier, orders whichever stops have known
// coordinates into a suggested visiting route (see routing.js). Stops
// without coordinates (couldn't be geocoded) are kept in a separate list
// rather than silently dropped, since they still need a visit.
export const buildVisitSchedule = ({devices, alerts, orders, catalog, pinByDevice, daysByDevice}) => {
  const priority = buildRestockPriority({devices, alerts, orders, catalog});

  const withContext = priority.map(p => ({
    ...p,
    coords: pinByDevice.get(p.deviceId) || null,
    daysOut: daysByDevice.get(p.deviceId) || 0,
  }));

  const buildTier = stops => {
    const routable = stops.filter(s => s.coords);
    const unroutable = stops.filter(s => !s.coords);
    const ordered = nearestNeighborRoute(routable);
    return {
      ordered,
      unroutable,
      totalKm: ordered.reduce((sum, s) => sum + (s.legKm || 0), 0),
      profitAtRisk: stops.reduce((sum, s) => sum + s.profitAtRisk, 0),
    };
  };

  return {
    today: buildTier(withContext.filter(m => m.criticalCount > 0)),
    thisWeek: buildTier(withContext.filter(m => m.criticalCount === 0)),
  };
};

// Turns a tier's stops into a concrete "what to bring, where" plan:
//  - packingList: one row per product, quantity totaled across every stop in
//    the tier — what to load up before heading out, ranked by how much daily
//    profit restocking it recovers (not just alphabetically or by quantity),
//    so the highest-value items get priority if you can't carry everything.
//  - priorityActions: a flat, per-(stop, product) list — literally which
//    machine to put each item in — ranked the same way, so if time runs short
//    partway through the route, whatever's done first is whatever recovers
//    the most profit.
// Quantity to bring assumes topping back up to each slot's own capacity.
export const buildRestockList = tier => {
  const stops = [...tier.ordered, ...tier.unroutable];

  const priorityActions = [];
  const byProduct = new Map();

  stops.forEach(stop => {
    const stopNumber = tier.ordered.includes(stop) ? tier.ordered.indexOf(stop) + 1 : null;
    (stop.items || []).forEach(it => {
      const qtyToBring = Math.max((it.capacity || 0) - (it.stock || 0), 1);
      priorityActions.push({
        deviceId: stop.deviceId,
        deviceName: stop.deviceName,
        stopNumber,
        productName: it.productName,
        image: it.image,
        severity: it.severity,
        qtyToBring,
        dailyProfitAtRisk: it.dailyProfitAtRisk,
      });

      let e = byProduct.get(it.productName);
      if (!e) {
        e = {productName: it.productName, image: it.image, qty: 0, profitAtRisk: 0, deviceCount: 0};
        byProduct.set(it.productName, e);
      }
      e.qty += qtyToBring;
      e.profitAtRisk += it.dailyProfitAtRisk;
      e.deviceCount += 1;
    });
  });

  priorityActions.sort((a, b) => b.dailyProfitAtRisk - a.dailyProfitAtRisk);
  const packingList = Array.from(byProduct.values()).sort((a, b) => b.profitAtRisk - a.profitAtRisk);

  return {packingList, priorityActions};
};
