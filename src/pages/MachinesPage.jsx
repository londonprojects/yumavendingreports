import React, {useEffect, useMemo, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {useApp} from '../context/AppContext';
import {StatusBadge, EmptyState, Spinner} from '../components/ui';
import {MachinesMap} from '../components/MachinesMap';
import {palette} from '../theme';
import {getCurrencySymbol} from '../api';
import {buildRestockPriority} from '../api/insights';
import {extractPlaceQuery, geocodePlaces, geocodeKey, splitGeographicOutliers} from '../api/geocode';

// Small at-a-glance restock indicator for a machine card: severity-colored dot
// plus, once sales history is in, the estimated daily profit lost to letting
// its low/out-of-stock slots stay empty.
const RestockGlance = ({priority, cur}) => {
  if (!priority) {
    return (
      <span className="badge online">
        <span className="dot" />
        Stocked
      </span>
    );
  }
  const badgeClass = priority.criticalCount > 0 ? 'critical' : 'warning';
  return (
    <span className={`badge ${badgeClass}`} title={`${priority.criticalCount} out of stock, ${priority.warningCount} low`}>
      {priority.criticalCount > 0 ? '🚫' : '⚠️'} {priority.criticalCount + priority.warningCount} to restock
      {priority.profitAtRisk > 0 ? ` · ${cur}${priority.profitAtRisk.toFixed(2)}/day` : ''}
    </span>
  );
};

const MachinesPage = () => {
  const {devices, products, inventoryProducts, orders, alerts, currencyCode, isRefreshing} = useApp();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiText, setAiText] = useState(null);
  const [aiError, setAiError] = useState(null);
  const [geocoded, setGeocoded] = useState({}); // query -> {lat, lng, displayName} | null
  const [geocoding, setGeocoding] = useState(false);
  const cur = getCurrencySymbol(currencyCode);

  // The API has no location/lat-lng data at all (marketLocation is always
  // empty on this account) — the only location signal is whatever site name
  // is baked into the machine's display name, so resolve that via a free
  // OpenStreetMap lookup, biased to the device's own time zone where known
  // (otherwise a generic name like "Hayes" can resolve to a same-named place
  // on the wrong continent). Best-effort: ambiguous names may still mismatch,
  // and non-address names (demo/showroom units) just won't resolve.
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

  const geocodedPins = useMemo(() => {
    return devices
      .map(d => {
        const hit = geocoded[geocodeKey(extractPlaceQuery(d.name), d.timeZone)];
        if (!hit) return null;
        return {deviceId: d.id, name: d.name, status: d.status, lat: hit.lat, lng: hit.lng};
      })
      .filter(Boolean);
  }, [devices, geocoded]);

  // Country-biasing fixes most wrong-continent mismatches, but a bad/default
  // time zone on the source data can still let one through — this catches
  // whatever's left as a sanity check against the rest of the resolved fleet.
  const {trusted: mapPins, outliers} = useMemo(() => splitGeographicOutliers(geocodedPins), [geocodedPins]);

  const unresolvedDevices = useMemo(() => {
    if (geocoding) return [];
    const outlierIds = new Set(outliers.map(p => p.deviceId));
    return devices.filter(
      d => !geocoded[geocodeKey(extractPlaceQuery(d.name), d.timeZone)] || outlierIds.has(d.id),
    );
  }, [devices, geocoded, geocoding, outliers]);

  // Stock per machine, derived from the inventory endpoint's per-market data.
  const stockByMachine = useMemo(() => {
    const map = {};
    inventoryProducts.forEach(p => {
      (p.markets || []).forEach(m => {
        map[m.marketId] = (map[m.marketId] || 0) + (m.stock || 0);
      });
    });
    return map;
  }, [inventoryProducts]);

  // Catalog merged for price/cost lookups (products has both; inventoryProducts
  // fills in anything products is missing).
  const catalog = useMemo(() => {
    const byId = new Map();
    products.forEach(p => p.id != null && byId.set(p.id, p));
    inventoryProducts.forEach(p => {
      if (p.id != null && !byId.has(p.id)) byId.set(p.id, p);
    });
    return Array.from(byId.values());
  }, [products, inventoryProducts]);

  // Which machines need restocking, ranked by how much daily profit is at risk
  // from their empty/low slots (recent sell velocity × margin) — this needs no
  // planogram fetch, just the inventory-endpoint alerts already loaded.
  const restockPriority = useMemo(
    () => buildRestockPriority({devices, alerts, orders, catalog}),
    [devices, alerts, orders, catalog],
  );
  const priorityByDevice = useMemo(() => {
    const map = new Map();
    restockPriority.forEach(p => map.set(p.deviceId, p));
    return map;
  }, [restockPriority]);

  const onAskAi = async () => {
    setAiLoading(true);
    setAiError(null);
    setAiText(null);
    try {
      const summary = {
        machinesNeedingRestock: restockPriority.slice(0, 10).map(p => ({
          machine: p.deviceName,
          status: p.status,
          criticalItems: p.criticalCount,
          lowItems: p.warningCount,
          estimatedDailyProfitAtRisk: Math.round(p.profitAtRisk * 100) / 100,
          topItems: p.items.slice(0, 5).map(i => ({
            product: i.productName,
            stock: i.stock,
            capacity: i.capacity,
            severity: i.severity,
            unitsPerDaySold: Math.round(i.unitsPerDay * 100) / 100,
            dailyProfitAtRisk: Math.round(i.dailyProfitAtRisk * 100) / 100,
          })),
        })),
        totalMachines: devices.length,
        machinesNeedingRestockCount: restockPriority.length,
        currencySymbol: cur,
      };

      const res = await fetch('/api/insights', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          summary,
          task: `Rank which machines to restock first for maximum profit recovery
today. For each of the top 3-5 machines, say why (which items are critical/low,
and the $/day estimated profit at risk) and give a short, concrete restocking
action. Close with 2-3 broader suggestions for reducing profit lost to
stockouts going forward.`,
        }),
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

  const filtered = useMemo(() => {
    return devices.filter(d => {
      if (filter === 'online' && d.status !== 'online') return false;
      if (filter === 'offline' && d.status === 'online') return false;
      const q = search.toLowerCase();
      return (
        !q ||
        (d.name || '').toLowerCase().includes(q) ||
        (d.location || '').toLowerCase().includes(q) ||
        String(d.id).toLowerCase().includes(q)
      );
    });
  }, [devices, search, filter]);

  if (isRefreshing && devices.length === 0) return <Spinner />;

  return (
    <>
      <div style={{marginBottom: 20}}>
        <h1 style={{margin: 0, fontSize: 24}}>Machines</h1>
        <div className="muted" style={{fontSize: 13, marginTop: 4}}>
          {devices.length} vending machines
        </div>
      </div>

      <div className="section-title">
        🗺️ Machine locations
        <span className="muted" style={{marginLeft: 'auto', fontSize: 12, fontWeight: 400}}>
          {geocoding
            ? 'Locating…'
            : `${mapPins.length} of ${devices.length} placed automatically from their site name`}
        </span>
      </div>
      {geocoding && mapPins.length === 0 ? (
        <div className="card card-pad">
          <Spinner />
        </div>
      ) : mapPins.length === 0 ? (
        <div className="card card-pad">
          <EmptyState
            emoji="🗺️"
            title="No machines could be located"
            hint="None of the machine names resolved to a real place via OpenStreetMap."
          />
        </div>
      ) : (
        <div className="card card-pad" style={{marginBottom: 8}}>
          <MachinesMap
            pins={mapPins}
            onSelectDevice={id => navigate(`/machines/${encodeURIComponent(id)}`)}
          />
          <div className="muted" style={{fontSize: 12, marginTop: 10}}>
            Best-effort: pins come from geocoding each machine's site name via OpenStreetMap (no API key, no exact
            address on file), so a few may be off or missing entirely.
            {!geocoding && unresolvedDevices.length > 0 && (
              <>
                {' '}
                Couldn't place {unresolvedDevices.length}: {unresolvedDevices.map(d => d.name).join(', ')}.
              </>
            )}
          </div>
        </div>
      )}

      <div className="section-title">
        ⚡ Restock priority — by profit impact
        <button className="btn" style={{marginLeft: 'auto'}} onClick={onAskAi} disabled={aiLoading || restockPriority.length === 0}>
          {aiLoading ? 'Thinking…' : '✨ Ask AI for a plan'}
        </button>
      </div>
      {restockPriority.length === 0 ? (
        <div className="card card-pad muted" style={{fontSize: 13, marginBottom: 8}}>
          No machines currently have low or out-of-stock items. 🎉
        </div>
      ) : (
        <div className="table-wrap" style={{marginBottom: 8}}>
          <table>
            <thead>
              <tr>
                <th>Machine</th>
                <th className="right">Critical</th>
                <th className="right">Low</th>
                <th className="right" title="Estimated units/day × margin lost across all its empty/low slots">
                  Profit at risk
                </th>
                <th>Top item to restock</th>
              </tr>
            </thead>
            <tbody>
              {restockPriority.slice(0, 8).map(p => (
                <tr key={p.deviceId} className="clickable" onClick={() => navigate(`/machines/${encodeURIComponent(p.deviceId)}`)}>
                  <td style={{fontWeight: 600}}>{p.deviceName}</td>
                  <td className="right nowrap">{p.criticalCount || '—'}</td>
                  <td className="right nowrap">{p.warningCount || '—'}</td>
                  <td className="right nowrap" style={{fontWeight: 600}}>
                    {p.profitAtRisk > 0 ? `${cur}${p.profitAtRisk.toFixed(2)}/day` : '—'}
                  </td>
                  <td className="muted">{p.items[0]?.productName || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {aiError ? (
        <div className="error-banner">{aiError}</div>
      ) : aiText ? (
        <div className="card card-pad" style={{whiteSpace: 'pre-wrap', lineHeight: 1.6, fontSize: 14, marginBottom: 18}}>
          {aiText}
        </div>
      ) : null}

      <div style={{display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap'}}>
        <div className="search">
          <span>🔍</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, location or ID…"
          />
        </div>
        <div className="pill-tabs">
          {['all', 'online', 'offline'].map(f => (
            <button key={f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>
              {f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card card-pad">
          <EmptyState emoji="🏪" title="No machines match" />
        </div>
      ) : (
        <div className="grid device-grid">
          {filtered.map(d => (
            <div
              className="card device-card"
              key={d.id}
              onClick={() => navigate(`/machines/${encodeURIComponent(d.id)}`)}
              style={{cursor: 'pointer'}}>
              <div className="dc-head">
                <div>
                  <div className="dc-name">{d.name}</div>
                  <div className="dc-loc">{d.location || d.id}</div>
                </div>
                <StatusBadge status={d.status} />
              </div>

              <div>
                <div className="meter-row">
                  <span>Units in stock</span>
                  <strong style={{color: 'var(--text)'}}>
                    {(stockByMachine[d.id] ?? 0).toLocaleString()}
                  </strong>
                </div>
                <RestockGlance priority={priorityByDevice.get(d.id)} cur={cur} />
              </div>

              <div style={{display: 'flex', gap: 16, fontSize: 13, color: 'var(--text-2)', borderTop: '1px solid var(--border-subtle)', paddingTop: 12}}>
                <span>🧊 {d.deviceType || 'Machine'}</span>
                {d.numberOfLayers ? <span>🗄 {d.numberOfLayers} layers</span> : null}
                {d.frozen && <span style={{color: palette.danger}}>❄ Frozen</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
};

export default MachinesPage;
