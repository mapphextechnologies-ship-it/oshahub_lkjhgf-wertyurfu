import React from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from '../components/ErrorBoundary.jsx';
import SuperAdminApp from './SuperAdminApp.jsx';
import './platform-admin.css';

createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <SuperAdminApp />
  </ErrorBoundary>
);
