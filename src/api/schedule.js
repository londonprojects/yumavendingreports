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
