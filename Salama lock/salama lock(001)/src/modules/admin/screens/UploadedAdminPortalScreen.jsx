import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import UploadedAdminApp from '@/uploadedAdmin/app/App.jsx';
import { AppProviders as UploadedAdminProviders } from '@/uploadedAdmin/app/providers.jsx';

function getInitialAdminPath() {
  if (window.location.hash.startsWith('#/admin')) {
    return window.location.hash.slice(1) || '/admin/overview';
  }

  return '/admin/overview';
}

export function UploadedAdminPortalScreen() {
  const adminPath = getInitialAdminPath();

  return (
    <div className="uploaded-admin-viewport">
      <MemoryRouter initialEntries={[adminPath || '/admin/overview']}>
        <UploadedAdminProviders>
          <UploadedAdminApp />
        </UploadedAdminProviders>
      </MemoryRouter>
    </div>
  );
}

