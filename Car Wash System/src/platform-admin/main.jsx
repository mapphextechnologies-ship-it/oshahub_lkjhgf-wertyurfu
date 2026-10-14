import React from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from '../components/ErrorBoundary.jsx';
import SuperAdminApp from './SuperAdminApp.jsx';
import './platform-admin.css';
import './platform-admin-enhancements.css';
import './platform-admin-layout.css';

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <SuperAdminApp />
  </ErrorBoundary>
);
