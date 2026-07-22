import React, {useMemo} from 'react';
import {Link} from 'react-router-dom';
import {useApp} from '../context/AppContext';
import {StatCard, SeverityBadge, Spinner, EmptyState} from '../components/ui';
import {LineChart} from '../components/LineChart';
import {getCurrencySymbol} from '../api';
import {buildProfitOverTime} from '../api/insights';
import {palette} from '../theme';

const DashboardPage = () => {
  const {
    devices,
    products,
    inventoryProducts,
    orders,
    lowStockSummary,
    todayRevenue,
    financialSummary,
    currencyCode,
    isRefreshing,
    apiError,
    lastSyncedAt,
  } = useApp();

  const cur = getCurrencySymbol(currencyCode);

  // Catalog merged for price/cost lookups (products has both; inventoryProducts
  // fills in anything products is missing) — same pattern used on Insights/Machines.
  const catalog = useMemo(() => {
    const byId = new Map();
    products.forEach(p => p.id != null && byId.set(p.id, p));
    inventoryProducts.forEach(p => {
      if (p.id != null && !byId.has(p.id)) byId.set(p.id, p);
    });
    return Array.from(byId.values());
  }, [products, inventoryProducts]);

  const profitOverTime = useMemo(
    () => buildProfitOverTime({orders, devices, catalog}),
    [orders, devices, catalog],
  );

  const stats = useMemo(() => {
    const online = devices.filter(d => d.status === 'online').length;
    const totalStock = inventoryProducts.reduce((s, p) => s + (p.totalStock || 0), 0);
    const totalCapacity = inventoryProducts.reduce((s, p) => s + (p.totalCapacity || 0), 0);
    const fillPct = totalCapacity > 0 ? Math.round((totalStock / totalCapacity) * 100) : null;
    return {online, totalStock, totalCapacity, fillPct};
  }, [devices, inventoryProducts]);

  // Most urgent restock items across the estate — the actual per-machine
  // low/out-of-stock alerts (the inventory endpoint carries no capacity, so we
  // can't rank by fill %). Out-of-stock first, then lowest stock.
  const restockList = useMemo(() => {
    const rank = a => (a.severity === 'critical' ? 0 : 1);
    return [...(lowStockSummary.alerts || [])]
      .sort((a, b) => rank(a) - rank(b) || (a.stock ?? 0) - (b.stock ?? 0))
      .slice(0, 8);
  }, [lowStockSummary]);

  if (isRefreshing && devices.length === 0) {
    return <Spinner />;
  }

  return (
    <>
      <div style={{marginBottom: 20}}>
        <h1 style={{margin: 0, fontSize: 24}}>Dashboard</h1>
        <div className="muted" style={{fontSize: 13, marginTop: 4}}>
          {lastSyncedAt ? `Last synced ${lastSyncedAt}` : 'Live data from the HAHA Vending API'}
        </div>
      </div>

      {apiError && <div className="error-banner">Couldn’t load data: {apiError}</div>}

      <div className="grid stat-grid">
        <StatCard
          label="Machines online"
          value={`${stats.online}/${devices.length}`}
          icon="🏪"
          tint={palette.accent}
          foot={`${devices.length} total machines`}
        />
        <StatCard
          label="Total units in stock"
          value={stats.totalStock.toLocaleString()}
          icon="📦"
          tint={palette.success}
          foot={stats.fillPct != null ? `${stats.fillPct}% of capacity filled` : 'across all machines'}
        />
        <StatCard
          label="Low / out of stock"
          value={lowStockSummary.total}
          icon="⚠️"
          tint={palette.warning}
          foot={`${lowStockSummary.criticalCount} out of stock · ${lowStockSummary.deviceCount} machines`}
        />
        <StatCard
          label="Revenue today"
          value={`${cur}${todayRevenue.toFixed(2)}`}
          icon="💰"
          tint={palette.accent}
          foot={`${cur}${(financialSummary.salesTotal || 0).toFixed(2)} last 30 days`}
        />
      </div>

      <div className="section-title">
        📈 Profit over time
        <span className="muted" style={{marginLeft: 'auto', fontSize: 12, fontWeight: 400}}>
          last 30 days · {cur}
          {profitOverTime.totalProfit.toFixed(2)} total
        </span>
      </div>
      {profitOverTime.series.length === 0 ? (
        <div className="card card-pad">
          <EmptyState emoji="📈" title="No profit data yet" hint="Waiting on sales history to load." />
        </div>
      ) : (
        <div className="card card-pad" style={{marginBottom: 8}}>
          <LineChart
            series={profitOverTime.series}
            labels={profitOverTime.labels}
            formatValue={v => `${cur}${v.toFixed(0)}`}
          />
          <div style={{display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border-subtle)'}}>
            {profitOverTime.series.map(s => (
              <div key={s.deviceId} style={{display: 'flex', alignItems: 'center', gap: 6, fontSize: 12}}>
                <span style={{width: 8, height: 8, borderRadius: '50%', background: s.color, display: 'inline-block'}} />
                <span className="muted">{s.deviceName}</span>
                <strong>
                  {cur}
                  {s.total.toFixed(2)}
                </strong>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid" style={{gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', marginTop: 8}}>
        <div>
          <div className="section-title">
            🚨 Needs restocking soon
            {lowStockSummary.total > 0 && (
              <Link to="/alerts" style={{marginLeft: 'auto', fontSize: 13, color: 'var(--accent)', fontWeight: 600}}>
                View all {lowStockSummary.total} →
              </Link>
            )}
          </div>
          {restockList.length === 0 ? (
            <div className="card card-pad">
              <EmptyState emoji="✅" title="Everything is well stocked" />
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Machine</th>
                    <th className="right">Stock</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {restockList.map(a => (
                    <tr key={a.id}>
                      <td style={{fontWeight: 600}}>{a.productName}</td>
                      <td className="muted">
                        <Link
                          to={`/machines/${encodeURIComponent(a.deviceId)}`}
                          style={{color: 'var(--accent)'}}>
                          {a.deviceName || a.deviceId}
                        </Link>
                      </td>
                      <td className="right nowrap">{a.stock}</td>
                      <td style={{width: 110}}>
                        <SeverityBadge severity={a.severity} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div>
          <div className="section-title">🏪 Machines</div>
          {devices.length === 0 ? (
            <div className="card card-pad">
              <EmptyState emoji="🏪" title="No machines found" hint="Check your API credentials or environment." />
            </div>
          ) : (
            <div className="card" style={{overflow: 'hidden'}}>
              {devices.slice(0, 7).map(d => (
                <Link
                  to={`/machines/${encodeURIComponent(d.id)}`}
                  key={d.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '13px 18px',
                    borderBottom: '1px solid var(--border-subtle)',
                  }}>
                  <span
                    className="dot"
                    style={{
                      width: 9,
                      height: 9,
                      background: d.status === 'online' ? palette.success : palette.danger,
                    }}
                  />
                  <div style={{flex: 1, minWidth: 0}}>
                    <div style={{fontWeight: 600, fontSize: 14}}>{d.name}</div>
                    <div className="muted" style={{fontSize: 12}}>
                      {d.location || d.id}
                    </div>
                  </div>
                  <span className="muted" style={{fontSize: 18}}>
                    ›
                  </span>
                </Link>
              ))}
              {devices.length > 7 && (
                <Link to="/machines" style={{display: 'block', padding: '12px 18px', color: 'var(--accent)', fontWeight: 600, fontSize: 13}}>
                  View all {devices.length} machines →
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default DashboardPage;
