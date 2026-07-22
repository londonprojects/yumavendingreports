// The HAHA API only reports current stock levels, not when a slot became low
// or empty, so there's no way to know a stockout's true real-world start time.
// The best this app can do is remember, in localStorage, the first moment it
// personally observed each alert at its current severity, and count forward
// from there. Duration is therefore a floor — "at least this long" — measured
// from whenever this browser first saw the alert, not necessarily when the
// stockout actually began.
const STORAGE_KEY = 'yuma_alert_since_v1';
const DAY_MS = 86400000;

const readStore = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
};

const writeStore = store => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* private browsing / quota exceeded — duration tracking just resets */
  }
};

// Stamps each alert with `since` (ms epoch, first seen at this severity) and
// `days` (whole days elapsed). Alerts that disappear (resolved) are dropped
// from storage so a later recurrence starts a fresh count.
export const trackAlertDurations = (alerts = []) => {
  const store = readStore();
  const now = Date.now();
  const seenIds = new Set();

  const withDuration = alerts.map(a => {
    seenIds.add(a.id);
    const prev = store[a.id];
    const since = prev && prev.severity === a.severity ? prev.since : now;
    store[a.id] = {severity: a.severity, since};
    return {...a, since, days: Math.floor((now - since) / DAY_MS)};
  });

  Object.keys(store).forEach(id => {
    if (!seenIds.has(id)) delete store[id];
  });
  writeStore(store);

  return withDuration;
};

// "Since today", "1 day", "5 days".
export const formatAlertDuration = days => (days <= 0 ? 'Since today' : `${days} day${days === 1 ? '' : 's'}`);
