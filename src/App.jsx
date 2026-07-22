import React from 'react';
import {Routes, Route, Navigate} from 'react-router-dom';
import {useApi} from './context/ApiContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import MachinesPage from './pages/MachinesPage';
import MachineDetailPage from './pages/MachineDetailPage';
import InventoryPage from './pages/InventoryPage';
import RestockPage from './pages/RestockPage';
import AlertsPage from './pages/AlertsPage';
import ProductsPage from './pages/ProductsPage';
import InsightsPage from './pages/InsightsPage';
import SchedulePage from './pages/SchedulePage';

const App = () => {
  const {isAuthenticated} = useApi();

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="machines" element={<MachinesPage />} />
        <Route path="machines/:id" element={<MachineDetailPage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="restock" element={<RestockPage />} />
        <Route path="schedule" element={<SchedulePage />} />
        <Route path="alerts" element={<AlertsPage />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="insights" element={<InsightsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
};

export default App;
