import React, {useState} from 'react';
import {NavLink, Outlet} from 'react-router-dom';
import {useApi} from '../context/ApiContext';
import {useApp} from '../context/AppContext';

const NAV = [
  {to: '/', label: 'Dashboard', icon: '📊', end: true},
  {to: '/machines', label: 'Machines', icon: '🏪'},
  {to: '/inventory', label: 'Inventory', icon: '📦'},
  {to: '/restock', label: 'Restock', icon: '🔄'},
  {to: '/schedule', label: 'Schedule', icon: '🗓️'},
  {to: '/alerts', label: 'Alerts', icon: '🔔'},
  {to: '/products', label: 'Products', icon: '🏷️'},
  {to: '/insights', label: 'Insights', icon: '✨'},
];

const COLLAPSE_KEY = 'yuma_nav_collapsed';

const Layout = () => {
  const {disconnect, environment} = useApi();
  const {lowStockSummary, isRefreshing, salesLoading, refreshData, lastSyncedAt} = useApp();
  const [open, setOpen] = useState(false); // mobile drawer
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const alertCount = lowStockSummary?.total || 0;

  const toggleCollapsed = () =>
    setCollapsed(c => {
      const next = !c;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });

  return (
    <div className="app-shell">
      <aside
        className={`sidebar ${open ? 'open' : ''} ${collapsed ? 'collapsed' : ''}`}
        onClick={() => setOpen(false)}>
        <div className="brand">
          <div className="brand-logo">Y</div>
          <div className="brand-text">
            <div className="brand-name">Yuma Reporting</div>
            <div className="brand-sub">Vending Inventory</div>
          </div>
        </div>
        <nav className="nav">
          {NAV.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              title={item.label}
              className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
              {item.to === '/alerts' && alertCount > 0 && (
                <span className="nav-badge">{alertCount}</span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="footer-text">
            <div>
              Environment: <strong>{environment}</strong>
            </div>
            {lastSyncedAt && <div style={{marginTop: 4}}>Synced {lastSyncedAt}</div>}
          </div>
          <button onClick={() => disconnect()} title="Disconnect">
            <span className="footer-text">Disconnect</span>
            <span className="footer-icon" aria-hidden>
              ⎋
            </span>
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="menu-btn" onClick={() => setOpen(v => !v)} title="Menu">
            ☰
          </button>
          <button
            className="collapse-btn"
            onClick={toggleCollapsed}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            {collapsed ? '»' : '«'}
          </button>
          <div style={{flex: 1}} />
          <div className="topbar-right">
            <button className="btn ghost" onClick={refreshData} disabled={isRefreshing || salesLoading}>
              {isRefreshing ? 'Loading…' : salesLoading ? 'Loading sales…' : '↻ Refresh'}
            </button>
          </div>
        </header>
        <div className="content">
          <Outlet />
        </div>
      </div>
    </div>
  );
};

export default Layout;
