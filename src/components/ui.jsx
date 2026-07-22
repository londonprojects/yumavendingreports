import React from 'react';
import {palette, stockColor} from '../theme';
import {getStockSeverity} from '../api';

export const Spinner = () => <div className="spinner" />;

export const StatCard = ({label, value, icon, foot, tint}) => (
  <div className="card card-pad stat-card">
    {icon && (
      <div className="stat-icon" style={tint ? {background: tint + '22', color: tint} : undefined}>
        {icon}
      </div>
    )}
    <div className="stat-label">{label}</div>
    <div className="stat-value">{value}</div>
    {foot && <div className="stat-foot">{foot}</div>}
  </div>
);

export const StatusBadge = ({status}) => {
  const online = String(status).toLowerCase() === 'online';
  return (
    <span className={`badge ${online ? 'online' : 'offline'}`}>
      <span className="dot" />
      {online ? 'Online' : 'Offline'}
    </span>
  );
};

export const SeverityBadge = ({severity}) => {
  if (severity === 'critical') return <span className="badge critical">Out of stock</span>;
  if (severity === 'warning') return <span className="badge warning">Low</span>;
  return <span className="badge online">OK</span>;
};

// Visual stock meter. Colour follows the shared low-stock severity thresholds.
export const StockBar = ({current, capacity}) => {
  const cap = capacity > 0 ? capacity : Math.max(current, 1);
  const pct = Math.max(0, Math.min(100, (current / cap) * 100));
  const severity = getStockSeverity(current, capacity);
  const color = severity ? stockColor(severity) : palette.success;
  return (
    <div className="stock-bar" title={`${current} / ${capacity || '—'}`}>
      <span style={{width: `${pct}%`, background: color}} />
    </div>
  );
};

export const EmptyState = ({emoji = '📭', title, hint}) => (
  <div className="empty">
    <div className="emoji">{emoji}</div>
    <div style={{fontWeight: 600, color: 'var(--text-2)'}}>{title}</div>
    {hint && <div style={{marginTop: 6, fontSize: 13}}>{hint}</div>}
  </div>
);

export const Thumb = ({src, alt}) => {
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => setFailed(false), [src]);
  if (!src || failed) {
    return (
      <div className="thumb" style={{display: 'grid', placeItems: 'center', fontSize: 15}}>📦</div>
    );
  }
  return (
    <img
      className="thumb"
      src={src}
      alt={alt || ''}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
};
