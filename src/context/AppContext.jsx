import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  getErrorMessage,
  buildLowStockAlertsFromDevices,
  buildRestockSuggestions,
  summarizeLowStock,
  enrichLayersWithInventory,
  buildDeviceNameMap,
} from '../api';
import {loadCoreData, loadSalesData, loadDevicePlanogram} from '../api/loadAppData';
import {useApi} from './ApiContext';

const AppContext = createContext(null);

const formatSyncedAt = () => new Date().toISOString().slice(0, 16).replace('T', ' ');

const EMPTY = {
  devices: [],
  products: [],
  inventoryProducts: [],
  orders: [],
  transactions: [],
  restockRecords: [],
  salesStats: [],
  financialSummary: {totalBalance: 0, salesTotal: 0, refundTotal: 0},
  alerts: [],
  todayOrders: [],
  todayRevenue: 0,
  currencyCode: undefined,
};

export const AppProvider = ({children}) => {
  const {isAuthenticated} = useApi();

  const [data, setData] = useState(EMPTY);
  const [isRefreshing, setIsRefreshing] = useState(false); // phase 1: core data
  const [salesLoading, setSalesLoading] = useState(false); // phase 2: sales
  const [apiError, setApiError] = useState(null);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [planogramCache, setPlanogramCache] = useState({});

  // Two-phase load: render the app as soon as the fast core data lands, then
  // stream in sales (which page through thousands of rows) in the background to
  // fill the velocity metrics.
  const refreshData = useCallback(async () => {
    setIsRefreshing(true);
    setApiError(null);

    let core;
    try {
      core = await loadCoreData();
      setData(prev => ({...prev, ...core}));
      setLastSyncedAt(formatSyncedAt());
    } catch (error) {
      setApiError(getErrorMessage(error));
      setIsRefreshing(false);
      return null;
    }
    setIsRefreshing(false);

    setSalesLoading(true);
    try {
      const deviceNameById = buildDeviceNameMap(core.devices);
      const sales = await loadSalesData(deviceNameById);
      setData(prev => ({...prev, ...sales}));
    } catch (error) {
      // Core data is already shown; a sales failure only blanks the metrics.
      setApiError(getErrorMessage(error));
    } finally {
      setSalesLoading(false);
    }
    return core;
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      refreshData();
    } else {
      setData(EMPTY);
      setLastSyncedAt(null);
    }
  }, [isAuthenticated, refreshData]);

  // Load a device planogram on demand, enriched with per-machine inventory so
  // slots without embedded stock numbers still show quantities.
  const loadPlanogram = useCallback(
    async deviceId => {
      const layers = await loadDevicePlanogram(deviceId);
      const enriched = enrichLayersWithInventory(layers, data.inventoryProducts, deviceId);
      setPlanogramCache(prev => ({...prev, [deviceId]: enriched}));
      return enriched;
    },
    [data.inventoryProducts],
  );

  // Slot-level low-stock alerts require planograms; the machine list can also
  // surface inventory-endpoint alerts (data.alerts) without any planogram load.
  const restockSuggestions = useMemo(
    () => buildRestockSuggestions(data.alerts, data.devices),
    [data.alerts, data.devices],
  );

  const lowStockSummary = useMemo(() => summarizeLowStock(data.alerts), [data.alerts]);

  const value = useMemo(
    () => ({
      ...data,
      isRefreshing,
      salesLoading,
      apiError,
      lastSyncedAt,
      refreshData,
      loadPlanogram,
      planogramCache,
      restockSuggestions,
      lowStockSummary,
      buildLowStockAlertsFromDevices,
    }),
    [
      data,
      isRefreshing,
      salesLoading,
      apiError,
      lastSyncedAt,
      refreshData,
      loadPlanogram,
      planogramCache,
      restockSuggestions,
      lowStockSummary,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
};
