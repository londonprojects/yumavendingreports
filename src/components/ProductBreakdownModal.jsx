import React, {useEffect, useMemo} from 'react';
import {useNavigate} from 'react-router-dom';
import {getStockSeverity, getCurrencySymbol} from '../api';
import {formatDuration, formatRelative} from '../utils/format';
import {StockBar, SeverityBadge, Thumb} from './ui';

// Full per-machine breakdown for a single product, shown as a modal so the
// layout is readable regardless of the inventory table's horizontal scroll.
const ProductBreakdownModal = ({row, currencyCode, salesPending, onClose}) => {
  const navigate = useNavigate();
  const cur = getCurrencySymbol(currencyCode);
  const {p, m, daysLeft} = row;

  // Close on Escape.
  useEffect(() => {
    const onKey = e => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const markets = useMemo(
    () => [...(p.markets || [])].sort((a, b) => (a.stock ?? 0) - (b.stock ?? 0)),
    [p.markets],
  );

  const goToMachine = id => {
    onClose();
    navigate(`/machines/${encodeURIComponent(id)}`);
  };

  const chips = [
    {k: 'Price', v: `${cur}${Number(p.price || 0).toFixed(2)}`},
    {k: 'Total stock', v: p.totalStock ?? 0},
    {k: 'Machines', v: p.marketCount ?? markets.length},
    {k: 'Sold (30d)', v: salesPending ? '…' : m ? m.unitsSold : 0},
    {k: 'Sells every', v: salesPending ? '…' : m?.avgTimeToSellMs != null ? formatDuration(m.avgTimeToSellMs) : '—'},
    {
      k: 'Est. left',
      v: salesPending ? '…' : daysLeft != null ? (daysLeft < 1 ? '<1d' : `${Math.round(daysLeft)}d`) : '—',
    },
    {k: 'Last sold', v: salesPending ? '…' : formatRelative(m?.lastSold)},
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-header">
          <Thumb src={p.image} alt={p.name} />
          <div style={{minWidth: 0}}>
            <div style={{fontWeight: 700, fontSize: 16}}>{p.name}</div>
            {p.gtin && (
              <div className="muted" style={{fontSize: 12}}>
                {p.gtin}
              </div>
            )}
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="modal-body">
          <div className="chip-row">
            {chips.map(c => (
              <div className="chip" key={c.k}>
                <div className="k">{c.k}</div>
                <div className="v">{c.v}</div>
              </div>
            ))}
          </div>

          <div className="section-title" style={{marginTop: 4}}>
            🏪 Stock by machine
          </div>

          {markets.length === 0 ? (
            <div className="muted" style={{fontSize: 13, padding: '8px 0'}}>
              No per-machine breakdown available for this product.
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Machine</th>
                    <th>Slots</th>
                    <th className="right">Stock</th>
                    <th style={{width: 150}}>Level</th>
                  </tr>
                </thead>
                <tbody>
                  {markets.map(mkt => {
                    const sev = getStockSeverity(mkt.stock ?? 0, 0);
                    const racks = mkt.racks || [];
                    return (
                      <tr
                        key={mkt.marketId}
                        className="clickable"
                        onClick={() => goToMachine(mkt.marketId)}>
                        <td style={{fontWeight: 600, color: 'var(--accent)'}}>
                          {mkt.marketName || mkt.marketId}
                        </td>
                        <td className="muted nowrap" style={{fontSize: 12}}>
                          {racks.length
                            ? racks.map(r => `${r.name} (${r.stock})`).join(', ')
                            : '—'}
                        </td>
                        <td className="right nowrap" style={{fontWeight: 700}}>
                          {mkt.stock ?? 0}
                        </td>
                        <td>
                          <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
                            <StockBar current={Math.max(mkt.stock ?? 0, 0)} capacity={0} />
                            <SeverityBadge severity={sev} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProductBreakdownModal;
