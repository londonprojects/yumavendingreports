import React, {useEffect, useMemo, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {useApp} from '../context/AppContext';
import {Spinner, EmptyState, Thumb} from '../components/ui';
import {MachinesMap} from '../components/MachinesMap';
import {getCurrencySymbol} from '../api';
import {buildVisitSchedule, buildRestockList} from '../api/schedule';
import {extractPlaceQuery, geocodePlaces, geocodeKey, splitGeographicOutliers} from '../api/geocode';
import {trackAlertDurations, formatAlertDuration} from '../utils/alertHistory';

const PRIORITY_LIMIT = 20;

const SeverityDot = ({severity}) => (
  <span
    className="dot"
    style={{background: severity === 'critical' ? 'var(--danger)' : 'var(--warning)', marginRight: 6}}
  />
);

const TierView = ({tier, tierLabel, cur, navigate, aiLoading, aiText, aiError, onAskAi, emptyHint}) => {
  const stops = [...tier.ordered, ...tier.unroutable];
  const restockList = useMemo(() => buildRestockList(tier), [tier]);

  if (stops.length === 0) {
    return (
      <div className="card card-pad">
        <EmptyState emoji="✅" title="Nothing to visit" hint={emptyHint} />
      </div>
    );
  }

  return (
    <>
      <div className="grid stat-grid" style={{marginBottom: 16}}>
        <div className="card card-pad stat-card">
          <div className="stat-label">Stops</div>
          <div className="stat-value">{stops.length}</div>
          <div className="stat-foot">
            {tier.ordered.length} routable{tier.unroutable.length ? `, ${tier.unroutable.length} unlocated` : ''}
          </div>
        </div>
        <div className="card card-pad stat-card">
          <div className="stat-label">Profit at risk</div>
          <div className="stat-value">
            {cur}
            {tier.profitAtRisk.toFixed(2)}/day
          </div>
          <div className="stat-foot">across this visit list</div>
        </div>
        <div
          className="card card-pad stat-card"
          title="Straight-line (great-circle) distance between stops in visiting order — not a real driving route, since there's no directions/routing API in play.">
          <div className="stat-label">Est. route distance</div>
          <div className="stat-value">{tier.totalKm.toFixed(1)} km</div>
          <div className="stat-foot">straight-line, not driving distance</div>
        </div>
      </div>

      <div className="section-title">🧳 What to restock — packing list</div>
      <div className="table-wrap" style={{marginBottom: 16}}>
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Product</th>
              <th className="right">Qty to bring</th>
              <th className="right">Machines</th>
              <th className="right" title="Total estimated daily profit recovered by restocking this product across every stop in this list">
                Profit at risk
              </th>
            </tr>
          </thead>
          <tbody>
            {restockList.packingList.map(p => (
              <tr key={p.productName}>
                <td style={{width: 46}}>
                  <Thumb src={p.image} alt={p.productName} />
                </td>
                <td style={{fontWeight: 600}}>{p.productName}</td>
                <td className="right nowrap" style={{fontWeight: 700}}>{p.qty}</td>
                <td className="right nowrap">{p.deviceCount}</td>
                <td className="right nowrap" style={{fontWeight: 600}}>
                  {cur}
                  {p.profitAtRisk.toFixed(2)}/day
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="section-title">
        🎯 Restock priority order
        <span className="muted" style={{marginLeft: 'auto', fontSize: 12, fontWeight: 400}}>
          highest profit impact first
        </span>
      </div>
      <div className="table-wrap" style={{marginBottom: 8}}>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th></th>
              <th>Product</th>
              <th>Machine</th>
              <th className="right">Qty</th>
              <th></th>
              <th className="right">Profit at risk</th>
            </tr>
          </thead>
          <tbody>
            {restockList.priorityActions.slice(0, PRIORITY_LIMIT).map((a, i) => (
              <tr
                key={`${a.deviceId}-${a.productName}`}
                className="clickable"
                onClick={() => navigate(`/machines/${encodeURIComponent(a.deviceId)}`)}>
                <td className="muted">{i + 1}</td>
                <td style={{width: 46}}>
                  <Thumb src={a.image} alt={a.productName} />
                </td>
                <td style={{fontWeight: 600}}>{a.productName}</td>
                <td>
                  {a.stopNumber ? `Stop ${a.stopNumber} · ` : ''}
                  {a.deviceName}
                </td>
                <td className="right nowrap">{a.qtyToBring}</td>
                <td className="nowrap">
                  <SeverityDot severity={a.severity} />
                  {a.severity === 'critical' ? 'Out of stock' : 'Low'}
                </td>
                <td className="right nowrap" style={{fontWeight: 600}}>
                  {cur}
                  {a.dailyProfitAtRisk.toFixed(2)}/day
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="muted" style={{fontSize: 12, marginBottom: 16}}>
        {restockList.priorityActions.length > PRIORITY_LIMIT
          ? `Showing the top ${PRIORITY_LIMIT} of ${restockList.priorityActions.length} restock actions, ranked by daily profit impact — the rest have little to no measurable margin data and are covered in the per-machine breakdown below.`
          : "Quantity assumes topping each slot back up to its own capacity."}{' '}
        If you can't get through everything in {tierLabel}, work down this list from the top.
      </div>

      <div className="section-title">
        🤖 AI route plan
        <button className="btn" style={{marginLeft: 'auto'}} onClick={onAskAi} disabled={aiLoading}>
          {aiLoading ? 'Thinking…' : '✨ Ask AI for a route plan'}
        </button>
      </div>
      {aiError ? (
        <div className="error-banner">{aiError}</div>
      ) : aiText ? (
        <div className="card card-pad" style={{whiteSpace: 'pre-wrap', lineHeight: 1.6, fontSize: 14, marginBottom: 8}}>
          {aiText}
        </div>
      ) : (
        <div className="card card-pad muted" style={{fontSize: 13, marginBottom: 8}}>
          Ask AI to turn this stop order into a plain-English visit plan.
        </div>
      )}

      {tier.ordered.length > 0 && (
        <div className="card card-pad" style={{marginBottom: 16}}>
          <MachinesMap
            showRoute
            pins={tier.ordered.map(s => ({
              deviceId: s.deviceId,
              name: s.deviceName,
              status: s.status,
              lat: s.coords.lat,
              lng: s.coords.lng,
              subtitle: `${cur}${s.profitAtRisk.toFixed(2)}/day at risk`,
            }))}
            onSelectDevice={id => navigate(`/machines/${encodeURIComponent(id)}`)}
          />
          <div className="muted" style={{fontSize: 12, marginTop: 10}}>
            Numbered in suggested visiting order — starts at the highest profit-at-risk stop, then greedily hops to
            whichever remaining stop is physically closest. Straight-line distance, not a real driving route.
          </div>
        </div>
      )}

      {tier.ordered.length > 0 && (
        <div className="table-wrap" style={{marginBottom: 16}}>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Machine</th>
                <th className="right">Critical</th>
                <th className="right">Low</th>
                <th className="right">Profit at risk</th>
                <th className="right" title="How long the worst item at this machine has been at its current severity">
                  Worst item age
                </th>
                <th className="right" title="Straight-line distance from the previous stop">
                  From last stop
                </th>
              </tr>
            </thead>
            <tbody>
              {tier.ordered.map((s, i) => (
                <tr key={s.deviceId} className="clickable" onClick={() => navigate(`/machines/${encodeURIComponent(s.deviceId)}`)}>
                  <td style={{fontWeight: 700}}>{i + 1}</td>
                  <td style={{fontWeight: 600}}>{s.deviceName}</td>
                  <td className="right nowrap">{s.criticalCount || '—'}</td>
                  <td className="right nowrap">{s.warningCount || '—'}</td>
                  <td className="right nowrap" style={{fontWeight: 600}}>
                    {cur}
                    {s.profitAtRisk.toFixed(2)}/day
                  </td>
                  <td className="right nowrap">{formatAlertDuration(s.daysOut)}</td>
                  <td className="right nowrap">{i === 0 ? '—' : `${s.legKm.toFixed(1)} km`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tier.unroutable.length > 0 && (
        <>
          <div className="section-title">📍 Also needs a visit — location unknown</div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Machine</th>
                  <th className="right">Critical</th>
                  <th className="right">Low</th>
                  <th className="right">Profit at risk</th>
                  <th className="right">Worst item age</th>
                </tr>
              </thead>
              <tbody>
                {tier.unroutable.map(s => (
                  <tr key={s.deviceId} className="clickable" onClick={() => navigate(`/machines/${encodeURIComponent(s.deviceId)}`)}>
                    <td style={{fontWeight: 600}}>{s.deviceName}</td>
                    <td className="right nowrap">{s.criticalCount || '—'}</td>
                    <td className="right nowrap">{s.warningCount || '—'}</td>
                    <td className="right nowrap" style={{fontWeight: 600}}>
                      {cur}
                      {s.profitAtRisk.toFixed(2)}/day
                    </td>
                    <td className="right nowrap">{formatAlertDuration(s.daysOut)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
};

const SchedulePage = () => {
  const {devices, products, inventoryProducts, orders, alerts, currencyCode, isRefreshing, salesLoading} = useApp();
  const navigate = useNavigate();
  const cur = getCurrencySymbol(currencyCode);
  const [tab, setTab] = useState('today');
  const [geocoded, setGeocoded] = useState({});
  const [geocoding, setGeocoding] = useState(false);
  const [ai, setAi] = useState({today: {}, thisWeek: {}});

  const salesPending = salesLoading && orders.length === 0;

  useEffect(() => {
    if (devices.length === 0) return;
    let active = true;
    setGeocoding(true);
    const items = devices.map(d => ({query: extractPlaceQuery(d.name), timeZone: d.timeZone}));
    geocodePlaces(items).then(results => {
      if (active) {
        setGeocoded(results);
        setGeocoding(false);
      }
    });
    return () => {
      active = false;
    };
  }, [devices]);

  const pinByDevice = useMemo(() => {
    const raw = devices
      .map(d => {
        const hit = geocoded[geocodeKey(extractPlaceQuery(d.name), d.timeZone)];
        return hit ? {deviceId: d.id, lat: hit.lat, lng: hit.lng} : null;
      })
      .filter(Boolean);
    // Same sanity backstop used on the Machines page map: a bad/default time
    // zone on the source data can occasionally place one machine on the
    // wrong continent, which would otherwise wreck the whole route (one
    // outlier drags a straight-line "route" across an ocean). Treated the
    // same as "location unknown" rather than trusted.
    const {trusted} = splitGeographicOutliers(raw);
    const map = new Map();
    trusted.forEach(p => map.set(p.deviceId, {lat: p.lat, lng: p.lng}));
    return map;
  }, [devices, geocoded]);

  // Same localStorage-backed duration tracking used on the Alerts page — see
  // utils/alertHistory.js for why this can only count from when this browser
  // first observed each alert, not necessarily its true real-world start.
  const [trackedAlerts, setTrackedAlerts] = useState(() => (isRefreshing ? [] : trackAlertDurations(alerts)));
  useEffect(() => {
    if (isRefreshing) return;
    setTrackedAlerts(trackAlertDurations(alerts));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alerts, isRefreshing]);

  const daysByDevice = useMemo(() => {
    const map = new Map();
    trackedAlerts.forEach(a => {
      if (a.resolved || a.type !== 'Low Stock') return;
      const cur = map.get(a.deviceId) || 0;
      if (a.days > cur) map.set(a.deviceId, a.days);
    });
    return map;
  }, [trackedAlerts]);

  const catalog = useMemo(() => {
    const byId = new Map();
    products.forEach(p => p.id != null && byId.set(p.id, p));
    inventoryProducts.forEach(p => {
      if (p.id != null && !byId.has(p.id)) byId.set(p.id, p);
    });
    return Array.from(byId.values());
  }, [products, inventoryProducts]);

  const schedule = useMemo(
    () => buildVisitSchedule({devices, alerts, orders, catalog, pinByDevice, daysByDevice}),
    [devices, alerts, orders, catalog, pinByDevice, daysByDevice],
  );

  const askAi = async tierKey => {
    const tier = schedule[tierKey];
    setAi(prev => ({...prev, [tierKey]: {loading: true, text: null, error: null}}));
    try {
      const stops = [...tier.ordered, ...tier.unroutable];
      const summary = {
        stops: stops.map((s, i) => ({
          order: tier.ordered.includes(s) ? i + 1 : null,
          machine: s.deviceName,
          criticalItems: s.criticalCount,
          lowItems: s.warningCount,
          estimatedDailyProfitAtRisk: Math.round(s.profitAtRisk * 100) / 100,
          worstItemDaysAtSeverity: s.daysOut,
          distanceFromPreviousStopKm: s.legKm != null ? Math.round(s.legKm * 10) / 10 : null,
          topItem: s.items[0]?.productName || null,
          locationKnown: !!s.coords,
        })),
        totalEstimatedProfitAtRiskPerDay: Math.round(tier.profitAtRisk * 100) / 100,
        totalRouteDistanceKm: Math.round(tier.totalKm * 10) / 10,
        currencySymbol: cur,
      };

      const res = await fetch('/api/insights', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          summary,
          task: `This is a restocking visit schedule, stops already ordered for an
efficient route (straight-line distance, not real driving directions). Write a
short, practical visit plan: (1) confirm the visiting order and call out why the
first 1-2 stops matter most (profit at risk, how long items have been out), (2)
flag any stop whose location is unknown and needs manual routing, (3) note the
total estimated profit recovery and route distance, (4) 2-3 practical tips for
the person doing this run today. Keep it under 300 words.`,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
      setAi(prev => ({...prev, [tierKey]: {loading: false, text: data.text, error: null}}));
    } catch (err) {
      setAi(prev => ({
        ...prev,
        [tierKey]: {loading: false, text: null, error: err.message || 'Something went wrong asking the AI.'},
      }));
    }
  };

  if (isRefreshing && devices.length === 0) return <Spinner />;

  const activeTier = tab === 'today' ? schedule.today : schedule.thisWeek;
  const activeAi = tab === 'today' ? ai.today : ai.thisWeek;

  return (
    <>
      <div style={{marginBottom: 20}}>
        <h1 style={{margin: 0, fontSize: 24}}>Schedule</h1>
        <div className="muted" style={{fontSize: 13, marginTop: 4}}>
          Optimized restocking visit order, by urgency and route efficiency
          {geocoding ? ' · locating machines…' : ''}
        </div>
      </div>

      <div className="pill-tabs" style={{marginBottom: 18}}>
        {[
          ['today', `Today (${schedule.today.ordered.length + schedule.today.unroutable.length})`],
          ['thisWeek', `This week (${schedule.thisWeek.ordered.length + schedule.thisWeek.unroutable.length})`],
        ].map(([key, label]) => (
          <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>

      {salesPending || geocoding ? (
        <div className="card card-pad">
          <Spinner />
        </div>
      ) : (
        <TierView
          tier={activeTier}
          tierLabel={tab === 'today' ? 'today' : 'this week'}
          cur={cur}
          navigate={navigate}
          aiLoading={!!activeAi?.loading}
          aiText={activeAi?.text}
          aiError={activeAi?.error}
          onAskAi={() => askAi(tab)}
          emptyHint={
            tab === 'today'
              ? 'No machines are fully out of stock right now. 🎉'
              : 'No machines are running low right now. 🎉'
          }
        />
      )}
    </>
  );
};

export default SchedulePage;
