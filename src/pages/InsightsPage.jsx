import React, {useEffect, useMemo, useState} from 'react';
import {useApp} from '../context/AppContext';
import {Spinner, EmptyState, Thumb} from '../components/ui';
import {getCurrencySymbol} from '../api';
import {buildMarginLeaderboard, buildSlotAudit, summarizeSlotAuditByProduct, groupSlotAuditByMachine} from '../api/insights';

const pct = v => (v == null ? '—' : `${(v * 100).toFixed(1)}%`);

const DirectionBadge = ({direction}) => {
  if (direction === 'increase') return <span className="badge warning">↑ Add a slot</span>;
  if (direction === 'decrease') return <span className="badge neutral">↓ Drop a slot</span>;
  return <span className="badge online">OK</span>;
};

const MarginMiniTable = ({title, rows, cur, tint}) => (
  <div className="card card-pad" style={{flex: 1, minWidth: 260}}>
    <div style={{fontWeight: 700, fontSize: 13, marginBottom: 10, color: tint}}>{title}</div>
    {rows.length === 0 ? (
      <div className="muted" style={{fontSize: 13}}>No products with both price and cost data.</div>
    ) : (
      <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
        {rows.map(r => (
          <div key={r.id} style={{display: 'flex', alignItems: 'center', gap: 8}}>
            <Thumb src={r.image} alt={r.name} />
            <div style={{flex: 1, minWidth: 0}}>
              <div style={{fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                {r.name}
              </div>
              <div className="muted" style={{fontSize: 12}}>
                {cur}
                {r.price.toFixed(2)} sale · {cur}
                {r.cost.toFixed(2)} cost
              </div>
            </div>
            <div style={{fontWeight: 700, color: tint, fontSize: 14}}>{pct(r.marginPct)}</div>
          </div>
        ))}
      </div>
    )}
  </div>
);

// Pure presentational — takes already-computed data so it can be exercised
// with fake data (see the temporary preview harness used to verify this UI
// without live HAHA credentials).
export const InsightsView = ({
  cur,
  margin,
  byProduct,
  byMachine,
  planogramsLoading,
  machinesTotal,
  aiLoading,
  aiText,
  aiError,
  onAskAi,
}) => {
  const opportunities = byProduct.filter(p => p.opportunity !== 0);

  return (
    <>
      <div style={{marginBottom: 20}}>
        <h1 style={{margin: 0, fontSize: 24}}>Insights</h1>
        <div className="muted" style={{fontSize: 13, marginTop: 4}}>
          Profit margin and slot-allocation analysis across {machinesTotal} machine{machinesTotal === 1 ? '' : 's'}
        </div>
      </div>

      <div className="grid stat-grid" style={{marginBottom: 22}}>
        <div className="card card-pad stat-card">
          <div className="stat-label">Highest margin</div>
          <div className="stat-value" style={{fontSize: 18}}>{margin.top[0]?.name || '—'}</div>
          <div className="stat-foot">{margin.top[0] ? pct(margin.top[0].marginPct) : 'no data'}</div>
        </div>
        <div className="card card-pad stat-card">
          <div className="stat-label">Lowest margin</div>
          <div className="stat-value" style={{fontSize: 18}}>{margin.bottom[0]?.name || '—'}</div>
          <div className="stat-foot">{margin.bottom[0] ? pct(margin.bottom[0].marginPct) : 'no data'}</div>
        </div>
        <div className="card card-pad stat-card">
          <div className="stat-label">Slot changes recommended</div>
          <div className="stat-value">{opportunities.length}</div>
          <div className="stat-foot">products under- or over-slotted</div>
        </div>
        <div className="card card-pad stat-card">
          <div className="stat-label">Machines analyzed</div>
          <div className="stat-value">{byMachine.length}</div>
          <div className="stat-foot">of {machinesTotal} total{planogramsLoading ? ' · loading…' : ''}</div>
        </div>
      </div>

      <div className="section-title">
        🤖 AI summary
        <button className="btn" style={{marginLeft: 'auto'}} onClick={onAskAi} disabled={aiLoading}>
          {aiLoading ? 'Thinking…' : '✨ Ask AI for a summary'}
        </button>
      </div>
      {aiError ? (
        <div className="error-banner">{aiError}</div>
      ) : aiText ? (
        <div className="card card-pad" style={{whiteSpace: 'pre-wrap', lineHeight: 1.6, fontSize: 14, marginBottom: 8}}>
          {aiText}
        </div>
      ) : (
        <div className="card card-pad muted" style={{fontSize: 13}}>
          Ask AI to turn the numbers below into a prioritized, plain-English report.
        </div>
      )}

      <div className="section-title">💰 Profit margin — highest &amp; lowest</div>
      {margin.excludedCount > 0 && (
        <div className="banner" style={{marginBottom: 12}}>
          {margin.excludedCount} product{margin.excludedCount === 1 ? '' : 's'} excluded from this ranking — their
          catalog cost is missing or ≥ price, which usually means cost hasn't been entered correctly rather than a
          real loss-making item.
        </div>
      )}
      <div style={{display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 8}}>
        <MarginMiniTable title="Highest margin" rows={margin.top} cur={cur} tint="var(--success)" />
        <MarginMiniTable title="Lowest margin" rows={margin.bottom} cur={cur} tint="var(--danger)" />
      </div>

      <div className="section-title">🔀 Slot allocation — 1 row vs. 2 rows</div>
      {planogramsLoading && byProduct.length === 0 ? (
        <div className="card card-pad">
          <Spinner />
        </div>
      ) : byProduct.length === 0 ? (
        <div className="card card-pad">
          <EmptyState emoji="🔀" title="No planogram data yet" hint="Visit a machine's detail page, or wait for planograms to finish loading." />
        </div>
      ) : (
        <div className="table-wrap" style={{marginBottom: 8}}>
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th className="right">Machines</th>
                <th className="right">Current slots</th>
                <th className="right">Recommended</th>
                <th className="right" title="Average units sold per day, across machines that stock it">Avg. velocity</th>
                <th className="right" title="Average profit margin, where cost data is available">Avg. margin</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {byProduct.map(p => (
                <tr key={p.productId}>
                  <td style={{fontWeight: 600}}>{p.productName}</td>
                  <td className="right nowrap">{p.machines}</td>
                  <td className="right nowrap">{p.currentSlotsTotal}</td>
                  <td className="right nowrap" style={{fontWeight: 600}}>{p.recommendedSlotsTotal}</td>
                  <td className="right nowrap">{p.avgUnitsPerDay.toFixed(2)}/day</td>
                  <td className="right nowrap">{pct(p.avgMarginPct)}</td>
                  <td>
                    <DirectionBadge
                      direction={p.opportunity > 0 ? 'increase' : p.opportunity < 0 ? 'decrease' : 'ok'}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="section-title">
        🏪 How machines are organized
        <span className="muted" style={{marginLeft: 'auto', fontSize: 12, fontWeight: 400}}>
          current vs. recommended slots, per machine
        </span>
      </div>
      {byMachine.length === 0 ? (
        <div className="card card-pad">
          <EmptyState emoji="🏪" title="No machines analyzed yet" />
        </div>
      ) : (
        byMachine.map(machine => (
          <div className="table-wrap" key={machine.deviceId} style={{marginBottom: 14}}>
            <table>
              <thead>
                <tr>
                  <th colSpan={5} style={{background: 'var(--surface)', fontSize: 13}}>
                    {machine.deviceName}
                  </th>
                </tr>
                <tr>
                  <th>Product</th>
                  <th className="right">Current</th>
                  <th className="right">Recommended</th>
                  <th className="right">Velocity</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {machine.rows.map(r => (
                  <tr key={`${machine.deviceId}-${r.productId}`}>
                    <td>{r.productName}</td>
                    <td className="right nowrap">{r.currentSlots}</td>
                    <td className="right nowrap" style={{fontWeight: 600}}>{r.recommendedSlots}</td>
                    <td className="right nowrap">{r.unitsPerDay.toFixed(2)}/day</td>
                    <td>
                      <DirectionBadge direction={r.direction} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}
    </>
  );
};

const InsightsPage = () => {
  const {devices, products, inventoryProducts, orders, planogramCache, loadPlanogram, currencyCode} = useApp();
  const cur = getCurrencySymbol(currencyCode);
  const [planogramsLoading, setPlanogramsLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiText, setAiText] = useState(null);
  const [aiError, setAiError] = useState(null);

  // The planogram audit needs every machine's layout, not just the one a user
  // happens to have opened, so backfill the cache for any machine missing it.
  useEffect(() => {
    const missing = devices.filter(d => !planogramCache[d.id]);
    if (!missing.length) return;
    let active = true;
    setPlanogramsLoading(true);
    Promise.allSettled(missing.map(d => loadPlanogram(d.id))).finally(() => {
      if (active) setPlanogramsLoading(false);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devices]);

  const catalog = useMemo(() => {
    const byId = new Map();
    products.forEach(p => p.id != null && byId.set(p.id, p));
    inventoryProducts.forEach(p => {
      if (p.id != null && !byId.has(p.id)) byId.set(p.id, p);
    });
    return Array.from(byId.values());
  }, [products, inventoryProducts]);

  const margin = useMemo(() => buildMarginLeaderboard(catalog), [catalog]);

  const slotRows = useMemo(
    () => buildSlotAudit({devices, orders, planogramsByDevice: planogramCache, catalog}),
    [devices, orders, planogramCache, catalog],
  );
  const byProduct = useMemo(() => summarizeSlotAuditByProduct(slotRows), [slotRows]);
  const byMachine = useMemo(() => groupSlotAuditByMachine(slotRows), [slotRows]);

  const onAskAi = async () => {
    setAiLoading(true);
    setAiError(null);
    setAiText(null);
    try {
      const summary = {
        marginTop: margin.top.map(m => ({name: m.name, price: m.price, cost: m.cost, marginPct: Math.round(m.marginPct * 1000) / 10})),
        marginBottom: margin.bottom.map(m => ({name: m.name, price: m.price, cost: m.cost, marginPct: Math.round(m.marginPct * 1000) / 10})),
        slotIncreaseOpportunities: byProduct
          .filter(p => p.opportunity > 0)
          .slice(0, 8)
          .map(p => ({
            name: p.productName,
            machines: p.machines,
            currentSlots: p.currentSlotsTotal,
            recommendedSlots: p.recommendedSlotsTotal,
            avgUnitsPerDay: Math.round(p.avgUnitsPerDay * 100) / 100,
            avgMarginPct: p.avgMarginPct != null ? Math.round(p.avgMarginPct * 1000) / 10 : null,
          })),
        slotDecreaseOpportunities: byProduct
          .filter(p => p.opportunity < 0)
          .slice(0, 8)
          .map(p => ({
            name: p.productName,
            machines: p.machines,
            currentSlots: p.currentSlotsTotal,
            recommendedSlots: p.recommendedSlotsTotal,
            avgUnitsPerDay: Math.round(p.avgUnitsPerDay * 100) / 100,
          })),
        machinesAnalyzed: byMachine.length,
        currencySymbol: cur,
      };

      const res = await fetch('/api/insights', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({summary}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
      setAiText(data.text);
    } catch (err) {
      setAiError(err.message || 'Something went wrong asking the AI.');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <InsightsView
      cur={cur}
      margin={margin}
      byProduct={byProduct}
      byMachine={byMachine}
      planogramsLoading={planogramsLoading}
      machinesTotal={devices.length}
      aiLoading={aiLoading}
      aiText={aiText}
      aiError={aiError}
      onAskAi={onAskAi}
    />
  );
};

export default InsightsPage;
