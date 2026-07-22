import React, {useMemo, useState} from 'react';
import {Link} from 'react-router-dom';
import {useApp} from '../context/AppContext';
import {SeverityBadge, EmptyState, Spinner} from '../components/ui';
import {buildPackingList, filterRecordsByPeriod} from '../api';

const RestockPage = () => {
  const {restockSuggestions, restockRecords, salesLoading, isRefreshing} = useApp();
  const [period, setPeriod] = useState('Week');

  const packingList = useMemo(() => buildPackingList(restockSuggestions), [restockSuggestions]);
  const records = useMemo(
    () => filterRecordsByPeriod(restockRecords, period),
    [restockRecords, period],
  );

  if (isRefreshing && restockSuggestions.length === 0 && restockRecords.length === 0) {
    return <Spinner />;
  }

  return (
    <>
      <div style={{marginBottom: 20}}>
        <h1 style={{margin: 0, fontSize: 24}}>Restock</h1>
        <div className="muted" style={{fontSize: 13, marginTop: 4}}>
          Machines needing a visit and what to bring
        </div>
      </div>

      <div className="grid" style={{gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))'}}>
        <div>
          <div className="section-title">🚐 Machines to visit ({restockSuggestions.length})</div>
          {restockSuggestions.length === 0 ? (
            <div className="card card-pad">
              <EmptyState emoji="✅" title="No restocks needed" hint="Every machine is above the low-stock threshold." />
            </div>
          ) : (
            <div className="grid" style={{gap: 12}}>
              {restockSuggestions.map(s => (
                <div className="card card-pad" key={s.device.id}>
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10}}>
                    <Link
                      to={`/machines/${encodeURIComponent(s.device.id)}`}
                      style={{fontWeight: 700, color: 'var(--accent)'}}>
                      {s.device.name || s.device.id}
                    </Link>
                    <div style={{display: 'flex', gap: 6}}>
                      {s.criticalCount > 0 && <span className="badge critical">{s.criticalCount} empty</span>}
                      {s.warningCount > 0 && <span className="badge warning">{s.warningCount} low</span>}
                    </div>
                  </div>
                  <div style={{display: 'flex', flexDirection: 'column', gap: 6}}>
                    {s.items.map(item => (
                      <div
                        key={item.id}
                        style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13}}>
                        <span>{item.productName}</span>
                        <span style={{display: 'flex', gap: 8, alignItems: 'center'}}>
                          <span className="muted">
                            {item.stock}/{item.capacity || '—'}
                          </span>
                          <SeverityBadge severity={item.severity} />
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="section-title">🧳 Packing list</div>
          {packingList.length === 0 ? (
            <div className="card card-pad">
              <EmptyState emoji="🧳" title="Nothing to pack" />
            </div>
          ) : (
            <div className="table-wrap" style={{marginBottom: 24}}>
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th className="right">Machines</th>
                    <th className="right">Units to bring</th>
                  </tr>
                </thead>
                <tbody>
                  {packingList.map(item => (
                    <tr key={item.productName}>
                      <td style={{fontWeight: 600}}>{item.productName}</td>
                      <td className="right muted">{item.deviceCount}</td>
                      <td className="right nowrap" style={{fontWeight: 700}}>
                        {item.qty}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="section-title" style={{display: 'flex'}}>
            🗒 Recent restock activity
            <div className="pill-tabs" style={{marginLeft: 'auto'}}>
              {['Today', 'Week', 'Month'].map(p => (
                <button key={p} className={period === p ? 'active' : ''} onClick={() => setPeriod(p)}>
                  {p}
                </button>
              ))}
            </div>
          </div>
          {salesLoading && restockRecords.length === 0 ? (
            <div className="card card-pad">
              <Spinner />
            </div>
          ) : records.length === 0 ? (
            <div className="card card-pad">
              <EmptyState emoji="🗒" title="No activity in this period" />
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Machine</th>
                    <th>Type</th>
                    <th>By</th>
                  </tr>
                </thead>
                <tbody>
                  {records.slice(0, 40).map(r => (
                    <tr key={r.id}>
                      <td className="nowrap muted">{r.date}</td>
                      <td>{r.deviceName || r.deviceId}</td>
                      <td>
                        <span className="badge neutral">{r.type}</span>
                      </td>
                      <td className="muted">{r.by}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default RestockPage;
