import React, {useEffect, useMemo, useState} from 'react';
import {useParams, Link} from 'react-router-dom';
import {useApp} from '../context/AppContext';
import {StatusBadge, StockBar, SeverityBadge, Spinner, EmptyState, Thumb} from '../components/ui';
import {BarChart} from '../components/BarChart';
import {getStockSeverity, getErrorMessage, getCurrencySymbol, toLocalDateString} from '../api';
import {loadMachineSalesHistory} from '../api/loadAppData';

const HISTORY_MONTHS = 12;
const DAILY_DAYS = 30;

// "2026-07" → "Jul 2026"
const monthLabel = key => {
  const [y, m] = key.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleString('default', {month: 'short', year: 'numeric'});
};

// Excludes unpaid/refunded sales the same way everywhere they're tallied.
const isCountedSale = o => {
  const s = String(o.status || '').toLowerCase();
  return s !== 'unpaid' && s !== 'refunded' && !o.refund;
};

const MachineDetailPage = () => {
  const {id} = useParams();
  const {
    devices,
    inventoryProducts,
    products,
    orders,
    planogramCache,
    loadPlanogram,
    currencyCode,
  } = useApp();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState(null); // this machine's ~12mo of orders
  const [historyLoading, setHistoryLoading] = useState(false);

  const device = devices.find(d => String(d.id) === String(id));
  const layers = planogramCache[id];
  const cur = getCurrencySymbol(currencyCode);

  useEffect(() => {
    let active = true;
    if (!planogramCache[id]) {
      setLoading(true);
      setError(null);
      loadPlanogram(id)
        .catch(e => active && setError(getErrorMessage(e)))
        .finally(() => active && setLoading(false));
    }
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Fetch a long, machine-scoped sales history so the monthly table spans many
  // months (the global feed only loads the last 30 days across all machines).
  useEffect(() => {
    let active = true;
    setHistory(null);
    setHistoryLoading(true);
    loadMachineSalesHistory(id, HISTORY_MONTHS)
      .then(rows => active && setHistory(rows))
      .catch(() => active && setHistory([]))
      .finally(() => active && setHistoryLoading(false));
    return () => {
      active = false;
    };
  }, [id]);

  // Per-machine product breakdown from the inventory endpoint (works even when
  // the planogram carries no stock numbers).
  const machineProducts = useMemo(() => {
    const rows = [];
    inventoryProducts.forEach(p => {
      const m = (p.markets || []).find(mk => String(mk.marketId) === String(id));
      if (m) {
        const stock = Math.max(m.stock ?? 0, 0);
        rows.push({
          id: p.id,
          name: p.name,
          image: p.image,
          price: p.price || 0,
          cost: p.cost || 0,
          stock: m.stock ?? 0,
          value: stock * (p.price || 0),
          costValue: stock * (p.cost || 0),
        });
      }
    });
    return rows.sort((a, b) => b.value - a.value);
  }, [inventoryProducts, id]);

  // Total worth of the stock currently loaded in this machine.
  const stockValue = useMemo(
    () => ({
      retail: machineProducts.reduce((s, p) => s + p.value, 0),
      cost: machineProducts.reduce((s, p) => s + p.costValue, 0),
    }),
    [machineProducts],
  );

  // Unit cost lookup by product id (catalog carries cost; inventory as fallback).
  const costById = useMemo(() => {
    const map = new Map();
    products.forEach(p => p.id != null && map.set(p.id, p.cost || 0));
    inventoryProducts.forEach(p => {
      if (p.id != null && !map.has(p.id)) map.set(p.id, p.cost || 0);
    });
    return map;
  }, [products, inventoryProducts]);

  // This machine's sales grouped by calendar month, with the average cost per
  // purchase (revenue ÷ sales) and the average unit cost of goods (COGS ÷ units).
  // Prefer the long machine-scoped history; fall back to the global 30-day feed
  // while that loads so the current month shows immediately.
  const monthlyOrders = history ?? orders;
  const monthly = useMemo(() => {
    const byMonth = new Map();
    monthlyOrders.forEach(o => {
      if (String(o.deviceId) !== String(id) || !isCountedSale(o)) return;
      const key = (o.date || '').slice(0, 7); // YYYY-MM
      if (!key) return;
      let e = byMonth.get(key);
      if (!e) {
        e = {key, sales: 0, units: 0, revenue: 0, cogs: 0};
        byMonth.set(key, e);
      }
      e.sales += 1;
      e.revenue += o.amount || 0;
      (o.items || []).forEach(it => {
        const qty = Number(it.quantity) || 1;
        e.units += qty;
        e.cogs += qty * (costById.get(it.productId) || 0);
      });
    });
    return Array.from(byMonth.values())
      .sort((a, b) => b.key.localeCompare(a.key))
      .map(e => ({
        ...e,
        label: monthLabel(e.key),
        avgSale: e.sales ? e.revenue / e.sales : 0,
        avgUnitCost: e.units ? e.cogs / e.units : 0,
      }));
  }, [monthlyOrders, id, costById]);

  // Same monthly totals, oldest → newest, for the trend chart (the table above
  // reads newest-first).
  const monthlyChart = useMemo(() => [...monthly].reverse(), [monthly]);

  // Monthly totals rolled up by calendar year. Limited to whatever the 12-month
  // history window actually covers, so this is mostly useful when that window
  // straddles a year boundary.
  const yearly = useMemo(() => {
    const byYear = new Map();
    monthly.forEach(mo => {
      const y = mo.key.slice(0, 4);
      let e = byYear.get(y);
      if (!e) {
        e = {key: y, label: y, sales: 0, units: 0, revenue: 0};
        byYear.set(y, e);
      }
      e.sales += mo.sales;
      e.units += mo.units;
      e.revenue += mo.revenue;
    });
    return Array.from(byYear.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [monthly]);

  // Day-by-day totals for the trailing DAILY_DAYS days, zero-filled so the chart
  // reads as a continuous trend rather than skipping quiet days.
  const daily = useMemo(() => {
    const byDay = new Map();
    monthlyOrders.forEach(o => {
      if (String(o.deviceId) !== String(id) || !isCountedSale(o)) return;
      const key = (o.date || '').slice(0, 10); // YYYY-MM-DD
      if (!key) return;
      let e = byDay.get(key);
      if (!e) {
        e = {sales: 0, units: 0, revenue: 0};
        byDay.set(key, e);
      }
      e.sales += 1;
      e.revenue += o.amount || 0;
      (o.items || []).forEach(it => {
        e.units += Number(it.quantity) || 1;
      });
    });

    const days = [];
    const today = new Date();
    for (let i = DAILY_DAYS - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = toLocalDateString(d);
      const e = byDay.get(key);
      days.push({
        key,
        label: String(d.getDate()),
        fullLabel: d.toLocaleDateString('default', {day: 'numeric', month: 'short', year: 'numeric'}),
        sales: e?.sales || 0,
        units: e?.units || 0,
        revenue: e?.revenue || 0,
      });
    }
    return days;
  }, [monthlyOrders, id]);

  const [chartRange, setChartRange] = useState('daily');
  const chartData = chartRange === 'daily' ? daily : chartRange === 'yearly' ? yearly : monthlyChart;
  const chartHasSales = chartData.some(d => d.sales > 0);

  const totals = useMemo(() => {
    let current = 0;
    let capacity = 0;
    let low = 0;
    (layers || []).forEach(l =>
      (l.slots || []).forEach(s => {
        current += s.current || 0;
        capacity += s.capacity || 0;
        if (s.product && getStockSeverity(s.current || 0, s.capacity || 0)) low += 1;
      }),
    );
    return {current, capacity, low};
  }, [layers]);

  if (!device) {
    return (
      <div className="card card-pad">
        <EmptyState emoji="🤷" title="Machine not found" hint={<Link to="/machines">Back to machines</Link>} />
      </div>
    );
  }

  return (
    <>
      <Link to="/machines" className="muted" style={{fontSize: 13}}>
        ← All machines
      </Link>
      <div style={{display: 'flex', alignItems: 'flex-start', gap: 14, margin: '10px 0 22px', flexWrap: 'wrap'}}>
        <div>
          <h1 style={{margin: 0, fontSize: 24}}>{device.name}</h1>
          <div className="muted" style={{fontSize: 13, marginTop: 4}}>
            {device.location || device.id} · ID {device.id}
          </div>
        </div>
        <div style={{marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center'}}>
          <StatusBadge status={device.status} />
          {device.frozen && <span className="badge critical">❄ Frozen</span>}
        </div>
      </div>

      <div className="grid stat-grid" style={{marginBottom: 22}}>
        <div className="card card-pad stat-card">
          <div className="stat-label">Units in stock</div>
          <div className="stat-value">{totals.current || machineProducts.reduce((s, p) => s + p.stock, 0)}</div>
          {totals.capacity > 0 && <div className="stat-foot">of {totals.capacity} capacity</div>}
        </div>
        <div className="card card-pad stat-card">
          <div className="stat-label">Low / empty slots</div>
          <div className="stat-value">{totals.low}</div>
          <div className="stat-foot">need attention</div>
        </div>
        <div className="card card-pad stat-card">
          <div className="stat-label">Layers</div>
          <div className="stat-value">{device.numberOfLayers || (layers ? layers.length : '—')}</div>
          <div className="stat-foot">{device.deviceType || 'Machine'}</div>
        </div>
        <div className="card card-pad stat-card">
          <div className="stat-label">Products</div>
          <div className="stat-value">{machineProducts.length}</div>
          <div className="stat-foot">distinct SKUs</div>
        </div>
        <div className="card card-pad stat-card">
          <div className="stat-label">Stock value (retail)</div>
          <div className="stat-value">
            {cur}
            {stockValue.retail.toFixed(2)}
          </div>
          <div className="stat-foot">
            {stockValue.cost > 0 ? `${cur}${stockValue.cost.toFixed(2)} at cost` : 'value currently loaded'}
          </div>
        </div>
      </div>

      <div className="section-title">
        📈 Sales trends
        <div className="pill-tabs" style={{marginLeft: 'auto'}}>
          {[
            ['daily', 'Daily'],
            ['monthly', 'Monthly'],
            ['yearly', 'Yearly'],
          ].map(([r, label]) => (
            <button key={r} className={chartRange === r ? 'active' : ''} onClick={() => setChartRange(r)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {historyLoading && chartData.length === 0 ? (
        <div className="card card-pad">
          <Spinner />
        </div>
      ) : !chartHasSales ? (
        <div className="card card-pad">
          <EmptyState
            emoji="📈"
            title="No sales for this machine"
            hint={
              chartRange === 'daily'
                ? `No sales in the last ${DAILY_DAYS} days.`
                : chartRange === 'yearly'
                  ? 'No sales in the loaded history.'
                  : `No sales in the last ${HISTORY_MONTHS} months.`
            }
          />
        </div>
      ) : (
        <div className="card card-pad" style={{marginBottom: 8}}>
          <BarChart
            data={chartData}
            formatValue={v => `${cur}${v.toFixed(2)}`}
            labelEvery={chartRange === 'daily' ? 5 : 1}
          />
        </div>
      )}

      <div className="section-title">
        📅 Monthly sales &amp; average cost
        <span className="muted" style={{marginLeft: 'auto', fontSize: 12, fontWeight: 400}}>
          {historyLoading ? 'Loading history…' : `last ${HISTORY_MONTHS} months`}
        </span>
      </div>
      {historyLoading && monthly.length === 0 ? (
        <div className="card card-pad">
          <Spinner />
        </div>
      ) : monthly.length === 0 ? (
        <div className="card card-pad">
          <EmptyState emoji="📅" title="No sales for this machine" hint="No sales in the last 12 months." />
        </div>
      ) : (
        <div className="table-wrap" style={{marginBottom: 8}}>
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th className="right">Sales</th>
                <th className="right">Units</th>
                <th className="right">Revenue</th>
                <th className="right" title="Average amount per purchase (revenue ÷ sales)">
                  Avg. sale
                </th>
                <th className="right" title="Average cost of goods per unit sold (COGS ÷ units)">
                  Avg. unit cost
                </th>
              </tr>
            </thead>
            <tbody>
              {monthly.map(mo => (
                <tr key={mo.key}>
                  <td style={{fontWeight: 600}}>{mo.label}</td>
                  <td className="right nowrap">{mo.sales}</td>
                  <td className="right nowrap">{mo.units}</td>
                  <td className="right nowrap">
                    {cur}
                    {mo.revenue.toFixed(2)}
                  </td>
                  <td className="right nowrap" style={{fontWeight: 600}}>
                    {cur}
                    {mo.avgSale.toFixed(2)}
                  </td>
                  <td className="right nowrap">
                    {mo.avgUnitCost > 0 ? `${cur}${mo.avgUnitCost.toFixed(2)}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="section-title">🗄 Planogram</div>
      {loading ? (
        <Spinner />
      ) : error ? (
        <div className="error-banner">Couldn’t load planogram: {error}</div>
      ) : layers && layers.length ? (
        layers.map(layer => (
          <div className="layer" key={layer.id}>
            <div className="layer-head">{layer.name}</div>
            <div className="slots">
              {layer.slots.map(slot => {
                const sev = getStockSeverity(slot.current || 0, slot.capacity || 0);
                return (
                  <div className="slot" key={`${layer.id}-${slot.slot}`}>
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                      <span className="slot-num">Slot {slot.slot}</span>
                      {slot.product && <SeverityBadge severity={sev} />}
                    </div>
                    <div style={{display: 'flex', gap: 8, alignItems: 'center', margin: '6px 0'}}>
                      <Thumb src={slot.image} alt={slot.product} />
                      <div className="slot-prod" style={{margin: 0}}>
                        {slot.product || <span className="muted">Empty</span>}
                      </div>
                    </div>
                    {slot.product && (
                      <>
                        <div className="slot-qty">
                          <span>{slot.current ?? 0} / {slot.capacity || '—'}</span>
                          {slot.price ? <span>{cur}{Number(slot.price).toFixed(2)}</span> : null}
                        </div>
                        <StockBar current={slot.current || 0} capacity={slot.capacity || 0} />
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))
      ) : (
        <div className="card card-pad">
          <EmptyState emoji="🗄" title="No planogram data" hint="This machine has no layout configured, or the API returned none." />
        </div>
      )}

      <div className="section-title">📦 Product stock in this machine</div>
      {machineProducts.length === 0 ? (
        <div className="card card-pad">
          <EmptyState emoji="📦" title="No inventory data for this machine" />
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Product</th>
                <th className="right">Unit price</th>
                <th className="right">Stock</th>
                <th className="right" title="Stock × unit price">Value</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {machineProducts.map(p => (
                <tr key={p.id}>
                  <td style={{width: 46}}>
                    <Thumb src={p.image} alt={p.name} />
                  </td>
                  <td style={{fontWeight: 600}}>{p.name}</td>
                  <td className="right nowrap">{cur}{Number(p.price || 0).toFixed(2)}</td>
                  <td className="right nowrap">{p.stock}</td>
                  <td className="right nowrap" style={{fontWeight: 600}}>
                    {cur}
                    {p.value.toFixed(2)}
                  </td>
                  <td style={{width: 90}}>
                    <SeverityBadge severity={getStockSeverity(p.stock, 0)} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td></td>
                <td style={{fontWeight: 700}}>Total</td>
                <td></td>
                <td className="right nowrap" style={{fontWeight: 700}}>
                  {machineProducts.reduce((s, p) => s + p.stock, 0)}
                </td>
                <td className="right nowrap" style={{fontWeight: 700}}>
                  {cur}
                  {stockValue.retail.toFixed(2)}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </>
  );
};

export default MachineDetailPage;
