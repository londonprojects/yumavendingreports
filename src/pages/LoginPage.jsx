import React, {useState} from 'react';
import {useApi} from '../context/ApiContext';

const LoginPage = () => {
  const {
    environment,
    setEnvironment,
    appkey,
    setAppkey,
    appsecret,
    setAppsecret,
    password,
    setPassword,
    connect,
    isConnecting,
    authError,
  } = useApi();
  const [remember, setRemember] = useState(true);

  const onSubmit = e => {
    e.preventDefault();
    connect({remember});
  };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={onSubmit}>
        <div className="brand-logo" style={{width: 46, height: 46, fontSize: 22}}>
          Y
        </div>
        <h1>Yuma Reporting</h1>
        <p className="sub">Connect with your HAHA Vending OpenAPI credentials to manage inventory across all your machines.</p>

        {authError && <div className="error-banner">{authError}</div>}

        <div className="form-group">
          <label>Environment</label>
          <select
            className="field"
            value={environment}
            onChange={e => setEnvironment(e.target.value)}>
            <option value="test">Test</option>
            <option value="production">Production</option>
          </select>
        </div>

        <div className="form-group">
          <label>App Key</label>
          <input
            className="field"
            value={appkey}
            onChange={e => setAppkey(e.target.value)}
            placeholder="your-app-key"
            autoComplete="username"
          />
        </div>

        <div className="form-group">
          <label>App Secret</label>
          <input
            className="field"
            type="password"
            value={appsecret}
            onChange={e => setAppsecret(e.target.value)}
            placeholder="your-app-secret"
            autoComplete="off"
          />
        </div>

        <div className="form-group">
          <label>Password</label>
          <input
            className="field"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="your-password"
            autoComplete="current-password"
          />
        </div>

        <label style={{display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-2)'}}>
          <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
          Remember credentials on this device
        </label>

        <button className="btn" type="submit" disabled={isConnecting}>
          {isConnecting ? 'Connecting…' : 'Connect'}
        </button>
      </form>
    </div>
  );
};

export default LoginPage;
