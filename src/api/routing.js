// Route ordering for restock visits. There's no directions/routing API in
// play here (no key, no backend for it) — distances are great-circle
// straight-line (Haversine), not real driving distance or time. Treat the
// resulting order and distances as a reasonable starting plan, not turn-by-
// turn navigation.

const toRad = deg => (deg * Math.PI) / 180;

// Great-circle distance in km between two {lat, lng} points.
export const haversineKm = (a, b) => {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

// Greedy nearest-neighbor ordering: keeps the given first stop (assumed to be
// the highest-priority one) fixed, then repeatedly jumps to whichever
// remaining stop is physically closest. This is a simple, explainable
// heuristic that blends urgency (the fixed start) with geographic efficiency
// (each subsequent hop) — it is not an optimal TSP solve, just a reasonable
// starting plan for a handful of stops. Every item needs a `coords: {lat,lng}`
// field. Returns the same items, in visiting order, each stamped with
// `legKm` — the distance from the previous stop (0 for the first).
export const nearestNeighborRoute = stops => {
  if (stops.length === 0) return [];
  const remaining = stops.slice(1);
  const route = [{...stops[0], legKm: 0}];

  while (remaining.length) {
    const last = route[route.length - 1];
    let bestIdx = 0;
    let bestDist = Infinity;
    remaining.forEach((s, i) => {
      const d = haversineKm(last.coords, s.coords);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    });
    const [next] = remaining.splice(bestIdx, 1);
    route.push({...next, legKm: bestDist});
  }

  return route;
};
