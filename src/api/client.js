import {API_ENVIRONMENTS, API_PATHS} from './config';
import {HahaApiError} from './errors';

let authState = {
  environment: null,
  token: null,
  tokenType: 'Bearer',
  expiresAt: null,
};

export const setAuthState = nextState => {
  authState = {...authState, ...nextState};
};

export const clearAuthState = () => {
  authState = {
    environment: authState.environment,
    token: null,
    tokenType: 'Bearer',
    expiresAt: null,
  };
};

export const getAuthState = () => authState;

const getBaseUrl = environment => {
  const baseUrl = API_ENVIRONMENTS[environment];
  if (!baseUrl) {
    throw new HahaApiError(`Unknown API environment: ${environment}`);
  }
  return baseUrl;
};

const parseJson = async response => {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new HahaApiError('Invalid JSON response from HAHA API', {
      status: response.status,
      response: text,
    });
  }
};

export const apiRequest = async (
  path,
  {method = 'GET', body, query, environment, token, requiresAuth = true} = {},
) => {
  const resolvedEnvironment = environment || authState.environment;
  if (!resolvedEnvironment) {
    throw new HahaApiError('API environment is not configured');
  }

  let finalUrl = `${getBaseUrl(resolvedEnvironment)}${path}`;
  if (query) {
    const queryParts = [];
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        queryParts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
      }
    });
    if (queryParts.length > 0) {
      finalUrl += (finalUrl.includes('?') ? '&' : '?') + queryParts.join('&');
    }
  }

  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  if (requiresAuth) {
    const resolvedToken = token || authState.token;
    if (!resolvedToken) {
      throw new HahaApiError('Not authenticated with HAHA API', {code: -401});
    }
    headers.Authorization = `${authState.tokenType || 'Bearer'} ${resolvedToken}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  let response;
  try {
    response = await fetch(finalUrl, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new HahaApiError('Network request timed out');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  const payload = await parseJson(response);

  if (!response.ok) {
    throw new HahaApiError(payload?.message || `HTTP ${response.status}`, {
      code: payload?.code,
      status: response.status,
      response: payload,
    });
  }

  if (!payload || typeof payload.code !== 'number') {
    throw new HahaApiError('Unexpected HAHA API response format', {
      status: response.status,
      response: payload,
    });
  }

  if (payload.code !== 0) {
    throw new HahaApiError(payload.message || 'HAHA API request failed', {
      code: payload.code,
      status: response.status,
      response: payload,
    });
  }

  return payload.data;
};

export const obtainToken = async ({environment, appkey, appsecret, password}) => {
  const data = await apiRequest(API_PATHS.token, {
    method: 'POST',
    environment,
    requiresAuth: false,
    body: password ? {appkey, appsecret, password} : {appkey, appsecret},
  });

  setAuthState({
    environment,
    token: data.token,
    tokenType: data.token_type || 'Bearer',
    expiresAt: data.expires_at,
  });

  return data;
};
