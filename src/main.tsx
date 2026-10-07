import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

if (typeof window !== 'undefined') {
  const isBenignRuntimeMessage = (msg: unknown) => {
    let str = '';
    try {
      if (typeof msg === 'string') {
        str = msg;
      } else if (msg && typeof msg === 'object') {
        const m = msg as any;
        str = [m.message, m.name, m.reason, m.stack, String(msg)].filter(Boolean).join(' ');
      } else {
        str = String(msg || '');
      }
    } catch {
      str = '';
    }
    str = str.toLowerCase();
    return (
      str.includes('websocket closed without opened') ||
      str.includes('failed to connect to websocket') ||
      str.includes('width(0) and height(0) of chart should be greater than 0') ||
      str.includes('width(-1) and height(-1) of chart should be greater than 0') ||
      str.includes('failed to register a serviceworker') ||
      str.includes('the document is in an invalid state') ||
      str.includes('invalid state') ||
      str.includes('invalidstateerror') ||
      (str.includes('serviceworker') && (str.includes('invalid') || str.includes('not allowed') || str.includes('security')))
    );
  };

  window.addEventListener(
    'unhandledrejection',
    (event) => {
      const reason = event.reason;
      if (isBenignRuntimeMessage(reason)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true
  );

  window.addEventListener(
    'error',
    (event) => {
      const err = event.error || event.message || event;
      if (isBenignRuntimeMessage(err)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
