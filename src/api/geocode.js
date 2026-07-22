// Best-effort geocoding for machine locations. The HAHA API's `marketLocation`
// field is empty on this account, and there's no lat/lng anywhere in the
// response — the only location signal available is whatever site name is
// baked into the machine's display name (e.g. "🇷🇴 - Colville Estate - Kier").
// This resolves that name to coordinates via OpenStreetMap's free Nominatim
// service (no API key required). It's genuinely best-effort: ambiguous
// estate/building names can resolve to the wrong place, and names that aren't
// real addresses at all (demo/showroom units) simply won't resolve.

import {haversineKm} from './routing';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const CACHE_KEY = 'yuma_geocode_cache_v2';
// Nominatim's usage policy caps free use at ~1 request/second.
const RATE_LIMIT_MS = 1100;

// IANA time zone → ISO 3166-1 country code, for single-country zones only
// (multi-zone countries like America/Chicago and America/Denver still map
// cleanly to one country). Used to bias/restrict geocoding to the right
// country — without this, a generic site name like "Hayes" can resolve to a
// same-named place on the wrong continent.
const TIMEZONE_COUNTRY = {
  'Europe/London': 'gb',
  'Europe/Dublin': 'ie',
  'Europe/Paris': 'fr',
  'Europe/Berlin': 'de',
  'Europe/Madrid': 'es',
  'Europe/Rome': 'it',
  'Europe/Amsterdam': 'nl',
  'Europe/Brussels': 'be',
  'Europe/Lisbon': 'pt',
  'Europe/Vienna': 'at',
  'Europe/Zurich': 'ch',
  'Europe/Stockholm': 'se',
  'Europe/Oslo': 'no',
  'Europe/Copenhagen': 'dk',
  'Europe/Helsinki': 'fi',
  'Europe/Warsaw': 'pl',
  'Europe/Prague': 'cz',
  'Europe/Budapest': 'hu',
  'Europe/Bucharest': 'ro',
  'Europe/Athens': 'gr',
  'Europe/Moscow': 'ru',
  'America/New_York': 'us',
  'America/Chicago': 'us',
  'America/Denver': 'us',
  'America/Los_Angeles': 'us',
  'America/Anchorage': 'us',
  'America/Toronto': 'ca',
  'America/Vancouver': 'ca',
  'America/Mexico_City': 'mx',
  'America/Sao_Paulo': 'br',
  'America/Buenos_Aires': 'ar',
  'Asia/Tokyo': 'jp',
  'Asia/Shanghai': 'cn',
  'Asia/Hong_Kong': 'hk',
  'Asia/Singapore': 'sg',
  'Asia/Kolkata': 'in',
  'Asia/Dubai': 'ae',
  'Asia/Seoul': 'kr',
  'Australia/Sydney': 'au',
  'Australia/Melbourne': 'au',
  'Australia/Brisbane': 'au',
  'Australia/Perth': 'au',
  'Pacific/Auckland': 'nz',
  'Africa/Johannesburg': 'za',
};

// Nominatim result classes that mean "this is a real place/address", as
// opposed to an unrelated business that merely happens to share a word with
// the query (e.g. a query for "Showroom Mini" matching an unrelated
// motorbike showroom's shop listing). Preferred over classes like `shop` /
// `amenity` when multiple candidates come back.
const PLACE_CLASSES = new Set(['place', 'boundary', 'highway', 'building', 'landuse', 'railway']);

export const countryCodeFromTimeZone = tz => TIMEZONE_COUNTRY[tz] || null;

const readCache = () => {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY)) || {};
  } catch {
    return {};
  }
};

const writeCache = cache => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* private browsing / quota exceeded — just re-geocodes next time */
  }
};

// Strips a leading flag emoji / icon and separator punctuation from a machine
// name to get a plausible place-name query, e.g.
// "🇷🇴 - Colville Estate - Kier" -> "Colville Estate - Kier".
export const extractPlaceQuery = name => {
  if (!name) return '';
  return name
    .replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}️\s\-–—]+/gu, '')
    .trim();
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const lookup = async (query, countryCode) => {
  let url = `${NOMINATIM_URL}?format=json&limit=3&q=${encodeURIComponent(query)}`;
  if (countryCode) url += `&countrycodes=${countryCode}`;
  const res = await fetch(url, {headers: {Accept: 'application/json'}});
  if (!res.ok) return null;
  const data = await res.json();
  if (!data?.length) return null;
  // Prefer a real place/address over an unrelated business whose name
  // happens to match; fall back to the top hit if nothing else qualifies.
  const hit = data.find(d => PLACE_CLASSES.has(d.class)) || data[0];
  return {lat: Number(hit.lat), lng: Number(hit.lon), displayName: hit.display_name};
};

// Resolves a list of {query, timeZone} pairs to {lat, lng, displayName} (or
// null if nothing matched), caching every result in localStorage so repeat
// visits don't re-hit the service. `timeZone` (the device's own IANA zone, if
// any) biases the search to the right country — without it, generic site
// names can resolve to a same-named place on the wrong continent. Runs
// sequentially with a delay between requests to respect Nominatim's rate
// limit.
export const geocodePlaces = async items => {
  const cache = readCache();
  const byKey = new Map();
  items.forEach(({query, timeZone}) => {
    if (!query) return;
    const countryCode = countryCodeFromTimeZone(timeZone);
    const key = countryCode ? `${query}|${countryCode}` : query;
    if (!byKey.has(key)) byKey.set(key, {query, countryCode});
  });

  const toFetch = Array.from(byKey.entries()).filter(([key]) => !(key in cache));

  for (let i = 0; i < toFetch.length; i++) {
    const [key, {query, countryCode}] = toFetch[i];
    let hit = null;
    try {
      hit = await lookup(query, countryCode);
      // A two-tier attempt: the full cleaned name first (e.g. "Colville Estate
      // - Kier"), then just its first segment ("Colville Estate") if that
      // fails — estate/site names often geocode better without the trailing
      // client/building qualifier.
      if (!hit && query.includes(' - ')) {
        await sleep(RATE_LIMIT_MS);
        hit = await lookup(query.split(' - ')[0].trim(), countryCode);
      }
    } catch {
      hit = null;
    }
    cache[key] = hit;
    if (i < toFetch.length - 1) await sleep(RATE_LIMIT_MS);
  }

  writeCache(cache);

  const results = {};
  items.forEach(({query, timeZone}) => {
    if (!query) return;
    const countryCode = countryCodeFromTimeZone(timeZone);
    const key = countryCode ? `${query}|${countryCode}` : query;
    results[key] = cache[key] ?? null;
  });
  return results;
};

// Country-biasing (see geocodePlaces) fixes most wrong-continent mismatches,
// but a bad/placeholder time zone on the source data can still let one
// through with high apparent confidence (a real hit, just for the wrong
// place — e.g. "Cuba Street" matching a real Cuba Street on another
// continent). This is a sanity backstop: with enough resolved points to
// establish where a fleet actually operates, anything far outside that
// cluster is flagged as an outlier rather than trusted. Needs at least
// `minPoints` entries to bother — with only a couple of pins there's no
// reliable "normal" to compare against.
export const splitGeographicOutliers = (pins, {minPoints = 4, thresholdKm = 150} = {}) => {
  if (pins.length < minPoints) return {trusted: pins, outliers: []};

  const centroid = {
    lat: pins.reduce((s, p) => s + p.lat, 0) / pins.length,
    lng: pins.reduce((s, p) => s + p.lng, 0) / pins.length,
  };
  const distances = pins.map(p => haversineKm(centroid, p));
  const sorted = [...distances].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const cutoff = Math.max(thresholdKm, median * 4);

  const trusted = [];
  const outliers = [];
  pins.forEach((p, i) => (distances[i] > cutoff ? outliers.push(p) : trusted.push(p)));
  return {trusted, outliers};
};

// Same cache-key derivation `geocodePlaces` uses internally — callers need
// this to look a specific device's result back up from the returned map.
export const geocodeKey = (query, timeZone) => {
  const countryCode = countryCodeFromTimeZone(timeZone);
  return countryCode ? `${query}|${countryCode}` : query;
};
