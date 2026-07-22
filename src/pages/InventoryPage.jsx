import React, {useMemo, useState} from 'react';
import {useApp} from '../context/AppContext';
import {StockBar, SeverityBadge, EmptyState, Spinner, Thumb} from '../components/ui';
import ProductBreakdownModal from '../components/ProductBreakdownModal';
import {getStockSeverity, getCurrencySymbol, buildProductSalesMetrics} from '../api';
import {formatDuration, formatRelative} from '../utils/format';

const SortHeader = ({sortKey, sort, onSort, children, right, defaultDir = 'desc', title, style}) => {
  const active = sort.key === sortKey;
  return (
    <th
      className={right ? 'right' : ''}
      onClick={() => onSort(sortKey, defaultDir)}
      title={title}
      style={{cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', ...style}}>
      {children}
      <span style={{marginLeft: 4, opacity: active ? 1 : 0.25}}>
        {active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}
      </span>
    </th>
  );
};

const InventoryPage = () => {
  const {inventoryProducts, orders, salesLoading, currencyCode, isRefreshing} = useApp();
  const [search, setSearch] = useState('');
  const [onlyLow, setOnlyLow] = useState(false);
  const [selected, setSelected] = useState(null); // the inventory product shown in modal
  const [sort, setSort] = useState({key: 'fill', dir: 'asc'});
  const cur = getCurrencySymbol(currencyCode);
  // Sales load after core data; show "…" in velocity cells until they arrive.
  const salesPending = salesLoading && orders.length === 0;

  const metrics = useMemo(() => buildProductSalesMetrics(orders), [orders]);

  // Click a header to sort by it; click again to flip direction. Text sorts
  // ascending by default, numbers/dates descending (except runway/fill where
  // "worst first" ascending is more useful).
  const toggleSort = (key, defaultDir = 'desc') =>
    setSort(s => (s.key === key ? {key, dir: s.dir === 'asc' ? 'desc' : 'asc'} : {key, dir: defaultDir}));

  const augmented = useMemo(
    () =>
      inventoryProducts.map(p => {
        const m = metrics[p.id];
        const fill = p.totalCapacity > 0 ? p.totalStock / p.totalCapacity : 1;
        const daysLeft = m && m.unitsPerDay > 0 ? p.totalStock / m.unitsPerDay : null;
        return {
          p,
          m,
          sev: getStockSeverity(p.totalStock, p.totalCapacity),
          daysLeft,
          // sortable fields
          name: p.name || '',
          price: p.price || 0,
          machines: p.marketCount || 0,
          stock: p.totalStock || 0,
          sold: m ? m.unitsSold : 0,
          sellEvery: m ? m.avgTimeToSellMs : null,
          lastSold: m?.lastSold ? m.lastSold.getTime() : null,
          fill,
        };
      }),
    [inventoryProducts, metrics],
  );

  const rows = useMemo(() => {
    const q = search.toLowerCase();
    const filtered = augmented
      .filter(r => !q || r.name.toLowerCase().includes(q) || (r.p.gtin || '').includes(q))
      .filter(r => !onlyLow || r.sev);

    const dir = sort.dir === 'asc' ? 1 : -1;
    return filtered.sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      // Missing values (no sales, no runway) always sort to the bottom.
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'string') return av.localeCompare(bv) * dir;
      return (av - bv) * dir;
    });
  }, [augmented, search, onlyLow, sort]);

  const totals = useMemo(() => {
    const stock = inventoryProducts.reduce((s, p) => s + (p.totalStock || 0), 0);
    const capacity = inventoryProducts.reduce((s, p) => s + (p.totalCapacity || 0), 0);
    const value = inventoryProducts.reduce((s, p) => s + (p.totalStock || 0) * (p.price || 0), 0);
    return {stock, capacity, value};
  }, [inventoryProducts]);

  // Look up the current augmented row for the open product so the modal always
  // reflects the latest metrics (e.g. once background sales finish loading).
  const selectedRow = useMemo(
    () => (selected ? augmented.find(r => r.p === selected) : null),
    [selected, augmented],
  );

  if (isRefreshing && inventoryProducts.length === 0) return <Spinner />;

  return (
    <>
      <div style={{marginBottom: 20}}>
        <h1 style={{margin: 0, fontSize: 24}}>Inventory</h1>
        <div className="muted" style={{fontSize: 13, marginTop: 4}}>
          {inventoryProducts.length} products across all machines · {totals.stock.toLocaleString()} units ·{' '}
          {cur}
          {totals.value.toFixed(2)} retail value
        </div>
      </div>

      {inventoryProducts.length === 0 ? (
        <div className="card card-pad">
          <EmptyState
            emoji="📦"
            title="No inventory data"
            hint="The inventory endpoint returned no products for this account."
          />
        </div>
      ) : (
        <>
          <div style={{display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center'}}>
            <div className="search">
              <span>🔍</span>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search products…"
              />
            </div>
            <label style={{display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-2)'}}>
              <input type="checkbox" checked={onlyLow} onChange={e => setOnlyLow(e.target.checked)} />
              Only low / out of stock
            </label>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th></th>
                  <SortHeader sortKey="name" sort={sort} onSort={toggleSort} defaultDir="asc">
                    Product
                  </SortHeader>
                  <SortHeader sortKey="price" sort={sort} onSort={toggleSort} right>
                    Price
                  </SortHeader>
                  <SortHeader sortKey="machines" sort={sort} onSort={toggleSort} right>
                    Machines
                  </SortHeader>
                  <SortHeader sortKey="stock" sort={sort} onSort={toggleSort} right>
                    Stock
                  </SortHeader>
                  <SortHeader sortKey="sold" sort={sort} onSort={toggleSort} right>
                    Sold (30d)
                  </SortHeader>
                  <SortHeader
                    sortKey="sellEvery"
                    sort={sort}
                    onSort={toggleSort}
                    right
                    defaultDir="asc"
                    title="Average time for one unit to sell">
                    Sells every
                  </SortHeader>
                  <SortHeader
                    sortKey="daysLeft"
                    sort={sort}
                    onSort={toggleSort}
                    right
                    defaultDir="asc"
                    title="Estimated days of stock left at the recent sell rate">
                    Est. left
                  </SortHeader>
                  <SortHeader sortKey="lastSold" sort={sort} onSort={toggleSort}>
                    Last sold
                  </SortHeader>
                  <SortHeader sortKey="fill" sort={sort} onSort={toggleSort} defaultDir="asc" style={{width: 160}}>
                    Fill level
                  </SortHeader>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const {p, m, sev, daysLeft} = row;
                  const rowKey = `${p.id ?? 'row'}-${index}`;
                  const stockRunningOut = daysLeft != null && daysLeft <= 7;
                  return (
                    <tr
                      key={rowKey}
                      className="clickable"
                      onClick={() => setSelected(row.p)}
                      title="View per-machine breakdown">
                      <td style={{width: 46}}>
                        <Thumb src={p.image} alt={p.name} />
                      </td>
                      <td style={{fontWeight: 600}}>
                        {p.name}
                        {p.gtin && (
                          <div className="muted" style={{fontSize: 12, fontWeight: 400}}>
                            {p.gtin}
                          </div>
                        )}
                      </td>
                      <td className="right nowrap">
                        {cur}
                        {Number(p.price || 0).toFixed(2)}
                      </td>
                      <td className="right">{p.marketCount}</td>
                      <td className="right nowrap">
                        {p.totalStock}
                        {p.totalCapacity ? <span className="muted"> / {p.totalCapacity}</span> : null}
                      </td>
                      <td className="right nowrap">
                        {salesPending ? (
                          <span className="muted">…</span>
                        ) : m ? (
                          m.unitsSold
                        ) : (
                          <span className="muted">0</span>
                        )}
                      </td>
                      <td className="right nowrap" title="Average time for one unit to sell">
                        {salesPending ? (
                          <span className="muted">…</span>
                        ) : m && m.avgTimeToSellMs != null ? (
                          formatDuration(m.avgTimeToSellMs)
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td
                        className="right nowrap"
                        style={stockRunningOut ? {color: 'var(--danger)', fontWeight: 700} : undefined}
                        title="Estimated days of stock left at the recent sell rate">
                        {salesPending ? (
                          <span className="muted">…</span>
                        ) : daysLeft != null ? (
                          daysLeft < 1 ? '<1d' : `${Math.round(daysLeft)}d`
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td
                        className="nowrap muted"
                        title={m?.lastSold ? m.lastSold.toLocaleString() : 'No sales in the last 30 days'}>
                        {salesPending ? '…' : formatRelative(m?.lastSold)}
                      </td>
                      <td>
                        <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
                          <StockBar current={p.totalStock} capacity={p.totalCapacity} />
                          <SeverityBadge severity={sev} />
                        </div>
                      </td>
                      <td className="muted" style={{width: 30}}>›</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {selectedRow && (
        <ProductBreakdownModal
          row={selectedRow}
          currencyCode={currencyCode}
          salesPending={salesPending}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
};

export default InventoryPage;
