import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  clearAuthState,
  DEFAULT_ENVIRONMENT,
  getAuthState,
  getErrorMessage,
  obtainToken,
} from '../api';
import {TOKEN_REFRESH_BUFFER_MS} from '../api/config';

const ApiContext = createContext(null);
const STORAGE_KEY = 'yuma_credentials';

const readStored = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const isTokenExpired = expiresAt => {
  if (!expiresAt) return true;
  const expiresMs = new Date(expiresAt).getTime();
  if (Number.isNaN(expiresMs)) return true;
  return Date.now() >= expiresMs - TOKEN_REFRESH_BUFFER_MS;
};

export const ApiProvider = ({children}) => {
  const stored = readStored();
  const [environment, setEnvironment] = useState(stored?.environment ?? DEFAULT_ENVIRONMENT);
  const [appkey, setAppkey] = useState(stored?.appkey ?? '');
  const [appsecret, setAppsecret] = useState(stored?.appsecret ?? '');
  const [password, setPassword] = useState(stored?.password ?? '');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [authError, setAuthError] = useState(null);
  const didAutoConnect = useRef(false);

  const saveCredentials = useCallback((key, secret, env, pass) => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({appkey: key, appsecret: secret, environment: env, password: pass}),
      );
    } catch {
      /* ignore quota / private-mode failures */
    }
  }, []);

  const connect = useCallback(
    async (opts = {}) => {
      const key = opts.appkey ?? appkey;
      const secret = opts.appsecret ?? appsecret;
      const env = opts.environment ?? environment;
      const pass = opts.password ?? password;
      const remember = opts.remember !== false;

      if (!key.trim() || !secret.trim() || !pass.trim()) {
        setAuthError('App key, app secret and password are required.');
        return false;
      }

      setIsConnecting(true);
      setAuthError(null);

      try {
        clearAuthState();
        await obtainToken({
          environment: env,
          appkey: key.trim(),
          appsecret: secret.trim(),
          password: pass.trim(),
        });
        setIsAuthenticated(true);
        if (remember) saveCredentials(key.trim(), secret.trim(), env, pass.trim());
        return true;
      } catch (error) {
        clearAuthState();
        setIsAuthenticated(false);
        setAuthError(getErrorMessage(error));
        return false;
      } finally {
        setIsConnecting(false);
      }
    },
    [appkey, appsecret, password, environment, saveCredentials],
  );

  const disconnect = useCallback((clearSaved = true) => {
    clearAuthState();
    setIsAuthenticated(false);
    setAuthError(null);
    if (clearSaved) {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
    }
  }, []);

  const ensureAuthenticated = useCallback(async () => {
    const auth = getAuthState();
    if (auth.token && !isTokenExpired(auth.expiresAt)) {
      setIsAuthenticated(true);
      return true;
    }
    if (!appkey.trim() || !appsecret.trim() || !password.trim()) return false;
    return connect();
  }, [appkey, appsecret, password, connect]);

  // Auto-connect once with saved credentials.
  useEffect(() => {
    if (didAutoConnect.current) return;
    didAutoConnect.current = true;
    const saved = readStored();
    if (saved?.appkey?.trim() && saved?.appsecret?.trim() && saved?.password?.trim()) {
      connect({
        appkey: saved.appkey,
        appsecret: saved.appsecret,
        password: saved.password,
        environment: saved.environment ?? DEFAULT_ENVIRONMENT,
        remember: false,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo(
    () => ({
      environment,
      setEnvironment,
      appkey,
      setAppkey,
      appsecret,
      setAppsecret,
      password,
      setPassword,
      isAuthenticated,
      isConnecting,
      authError,
      connect,
      disconnect,
      ensureAuthenticated,
    }),
    [
      environment,
      appkey,
      appsecret,
      password,
      isAuthenticated,
      isConnecting,
      authError,
      connect,
      disconnect,
      ensureAuthenticated,
    ],
  );

  return <ApiContext.Provider value={value}>{children}</ApiContext.Provider>;
};

export const useApi = () => {
  const ctx = useContext(ApiContext);
  if (!ctx) throw new Error('useApi must be used within ApiProvider');
  return ctx;
};
