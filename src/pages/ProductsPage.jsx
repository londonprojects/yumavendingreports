import React, {useMemo, useState} from 'react';
import {useApp} from '../context/AppContext';
import {EmptyState, Spinner, Thumb} from '../components/ui';
import {getCurrencySymbol} from '../api';

const ProductsPage = () => {
  const {products, inventoryProducts, currencyCode, isRefreshing} = useApp();
  const [search, setSearch] = useState('');
  const cur = getCurrencySymbol(currencyCode);

  // Prefer the richer inventory product catalog; fall back to the products list.
  const catalog = inventoryProducts.length ? inventoryProducts : products;

  const rows = useMemo(() => {
    const q = search.toLowerCase();
    return catalog.filter(
      p => !q || (p.name || '').toLowerCase().includes(q) || (p.gtin || '').includes(q),
    );
  }, [catalog, search]);

  if (isRefreshing && catalog.length === 0) return <Spinner />;

  return (
    <>
      <div style={{marginBottom: 20}}>
        <h1 style={{margin: 0, fontSize: 24}}>Products</h1>
        <div className="muted" style={{fontSize: 13, marginTop: 4}}>
          {catalog.length} products in the catalog
        </div>
      </div>

      <div className="search" style={{marginBottom: 18}}>
        <span>🔍</span>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products…" />
      </div>

      {rows.length === 0 ? (
        <div className="card card-pad">
          <EmptyState emoji="🏷️" title="No products" />
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Product</th>
                <th>Barcode</th>
                <th className="right">Price</th>
                {inventoryProducts.length ? <th className="right">Total stock</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map(p => (
                <tr key={p.id}>
                  <td style={{width: 46}}>
                    <Thumb src={p.image} alt={p.name} />
                  </td>
                  <td style={{fontWeight: 600}}>{p.name}</td>
                  <td className="muted nowrap">{p.gtin || '—'}</td>
                  <td className="right nowrap">
                    {cur}
                    {Number(p.price || 0).toFixed(2)}
                  </td>
                  {inventoryProducts.length ? (
                    <td className="right nowrap">{p.totalStock ?? '—'}</td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
};

export default ProductsPage;
