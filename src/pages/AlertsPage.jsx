import React, {useMemo, useState} from 'react';
import {Link} from 'react-router-dom';
import {useApp} from '../context/AppContext';
import {SeverityBadge, EmptyState, Spinner, StatCard} from '../components/ui';
import {palette} from '../theme';

const AlertsPage = () => {
  const {alerts, lowStockSummary, isRefreshing} = useApp();
  const [filter, setFilter] = useState('all');

  const rows = useMemo(() => {
    return alerts
      .filter(a => {
        if (filter === 'critical') return a.severity === 'critical';
        if (filter === 'warning') return a.severity === 'warning';
        return true;
      })
      .sort((a, b) => (a.severity === 'critical' ? -1 : 1) - (b.severity === 'critical' ? -1 : 1));
  }, [alerts, filter]);

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
                <th>Status</th>
                <th>Product</th>
                <th>Machine</th>
                <th className="right">Stock</th>
                <th>Issue</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(a => (
                <tr key={a.id}>
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
