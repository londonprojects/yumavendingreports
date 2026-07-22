import React, {useEffect, useMemo, useState} from 'react';
import {Link} from 'react-router-dom';
import {useApp} from '../context/AppContext';
import {SeverityBadge, EmptyState, Spinner, StatCard, Thumb} from '../components/ui';
import {palette} from '../theme';
import {trackAlertDurations, formatAlertDuration} from '../utils/alertHistory';

const AlertsPage = () => {
  const {alerts, lowStockSummary, isRefreshing, products, inventoryProducts} = useApp();
  const [filter, setFilter] = useState('all');

  // Alerts carry a productId but no image — look it up from the catalog
  // (products has it; inventoryProducts fills in anything products is missing).
  const imageById = useMemo(() => {
    const map = new Map();
    products.forEach(p => p.id != null && p.image && map.set(p.id, p.image));
    inventoryProducts.forEach(p => {
      if (p.id != null && p.image && !map.has(p.id)) map.set(p.id, p.image);
    });
    return map;
  }, [products, inventoryProducts]);
  // Lazy-init from whatever alerts are already present (avoids an empty-state
  // flash), then re-stamp durations whenever the alert list changes. Stamping
  // touches localStorage, so the ongoing sync runs as an effect, not render.
  // Critically, this must not run while core data is still loading: `alerts`
  // starts as `[]` before the first load resolves, and treating that as a
  // real "everything resolved" snapshot would prune every tracked alert's
  // history on every fresh page load.
  const [tracked, setTracked] = useState(() => (isRefreshing ? [] : trackAlertDurations(alerts)));
  useEffect(() => {
    if (isRefreshing) return;
    setTracked(trackAlertDurations(alerts));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alerts, isRefreshing]);

  const rows = useMemo(() => {
    return tracked
      .filter(a => {
        if (filter === 'critical') return a.severity === 'critical';
        if (filter === 'warning') return a.severity === 'warning';
        return true;
      })
      .sort((a, b) => {
        const sevDiff = (a.severity === 'critical' ? -1 : 1) - (b.severity === 'critical' ? -1 : 1);
        return sevDiff !== 0 ? sevDiff : b.days - a.days;
      });
  }, [tracked, filter]);

  if (isRefreshing && alerts.length === 0) return <Spinner />;

  return (
    <>
      <div style={{marginBottom: 20}}>
        <h1 style={{margin: 0, fontSize: 24}}>Alerts</h1>
        <div className="muted" style={{fontSize: 13, marginTop: 4}}>
          Low-stock and out-of-stock alerts across all machines
        </div>
      </div>

      <div className="grid stat-grid" style={{marginBottom: 20}}>
        <StatCard label="Total alerts" value={lowStockSummary.total} icon="🔔" tint={palette.accent} />
        <StatCard label="Out of stock" value={lowStockSummary.criticalCount} icon="🚫" tint={palette.danger} />
        <StatCard label="Running low" value={lowStockSummary.warningCount} icon="⚠️" tint={palette.warning} />
        <StatCard label="Machines affected" value={lowStockSummary.deviceCount} icon="🏪" tint={palette.accent} />
      </div>

      <div className="pill-tabs" style={{marginBottom: 16}}>
        {[
          ['all', 'All'],
          ['critical', 'Out of stock'],
          ['warning', 'Low'],
        ].map(([f, label]) => (
          <button key={f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>
            {label}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="card card-pad">
          <EmptyState emoji="✅" title="No alerts" hint="All products are above the low-stock threshold." />
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Status</th>
                <th>Product</th>
                <th>Machine</th>
                <th className="right">Stock</th>
                <th
                  title="How long this has continuously been at its current severity. The API doesn't report stockout history, so this counts from whenever this app first saw it — it may understate the real duration.">
                  Duration
                </th>
                <th>Issue</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(a => (
                <tr key={a.id}>
                  <td style={{width: 46}}>
                    <Thumb src={imageById.get(a.productId)} alt={a.productName} />
                  </td>
                  <td style={{width: 110}}>
                    <SeverityBadge severity={a.severity} />
                  </td>
                  <td style={{fontWeight: 600}}>{a.productName}</td>
                  <td>
                    <Link
                      to={`/machines/${encodeURIComponent(a.deviceId)}`}
                      style={{color: 'var(--accent)', fontWeight: 500}}>
                      {a.deviceName || a.deviceId}
                    </Link>
                  </td>
                  <td className="right nowrap">
                    {a.stock}
                    {a.capacity ? <span className="muted"> / {a.capacity}</span> : null}
                  </td>
                  <td className="nowrap" style={a.days >= 3 ? {color: 'var(--danger)', fontWeight: 600} : undefined}>
                    {a.severity === 'critical' ? 'Out ' : 'Low '}
                    {formatAlertDuration(a.days)}
                  </td>
                  <td className="muted">{a.issue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
};

export default AlertsPage;
