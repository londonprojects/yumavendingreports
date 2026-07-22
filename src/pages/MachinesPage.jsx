import React, {useMemo, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {useApp} from '../context/AppContext';
import {StatusBadge, EmptyState, Spinner} from '../components/ui';
import {palette} from '../theme';

const MachinesPage = () => {
  const {devices, inventoryProducts, isRefreshing} = useApp();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

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
