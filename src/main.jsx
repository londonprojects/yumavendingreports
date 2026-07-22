import React from 'react';
import ReactDOM from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import App from './App';
import {ApiProvider} from './context/ApiContext';
import {AppProvider} from './context/AppContext';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ApiProvider>
        <AppProvider>
          <App />
        </AppProvider>
      </ApiProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
