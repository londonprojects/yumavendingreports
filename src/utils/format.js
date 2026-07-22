// "3h", "2.5d", "1w" — a coarse human duration from milliseconds.
export const formatDuration = ms => {
  if (ms == null) return '—';
  const mins = ms / 60000;
  if (mins < 60) return `${Math.max(1, Math.round(mins))}m`;
  const hrs = mins / 60;
  if (hrs < 48) return `${Math.round(hrs)}h`;
  const days = hrs / 24;
  if (days < 14) return `${days < 10 ? days.toFixed(1) : Math.round(days)}d`;
  return `${Math.round(days / 7)}w`;
};

// "2d ago", "3h ago", "Never" from a Date.
export const formatRelative = date => {
  if (!date) return 'Never';
  const diff = Date.now() - date.getTime();
  if (diff < 60000) return 'just now';
  const mins = diff / 60000;
  if (mins < 60) return `${Math.round(mins)}m ago`;
  const hrs = mins / 60;
  if (hrs < 24) return `${Math.round(hrs)}h ago`;
  const days = hrs / 24;
  if (days < 30) return `${Math.round(days)}d ago`;
  return `${Math.round(days / 30)}mo ago`;
};
