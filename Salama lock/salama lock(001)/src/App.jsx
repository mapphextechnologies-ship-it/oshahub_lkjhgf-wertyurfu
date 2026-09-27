import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { AppShell } from './components/layout/AppShell.jsx';
import {
  DashboardScreen,
  PaymentsScreen,
  CustomersScreen,
  CommissionsScreen,
  InventoryScreen,
  ReportsScreen,
  ReconciliationScreen,
  NotificationsScreen,
  SettingsScreen
} from './modules/finance/index.js';
import {
  LoginScreen,
  PortalEntryScreen,
  PortalLandingScreen,
  NextOfKinAcceptScreen
} from './modules/public/index.js';
import { UploadedAdminPortalScreen } from './modules/admin/index.js';
import { BackOfficePortalScreen } from './modules/backoffice/index.js';
import { useSecurityGuards } from './hooks/useSecurityGuards.js';
import { useInstallPrompt } from './hooks/useInstallPrompt.js';
import { Toast } from './components/ui/Toast.jsx';
import { Text } from './components/ui/Text.jsx';
import { SupportChatWidget } from './components/ui/SupportChatWidget.jsx';
import { FloatingInstallButton } from './components/ui/FloatingInstallButton.jsx';
import { authService } from './services/authService.js';
import { getAuthToken } from './services/authSession.js';
import { notificationService } from './services/notificationService.js';
import { paymentService } from './services/paymentService.js';
import { formatKes } from './utils/currency.js';
import { formatDate } from './utils/dates.js';
import { buildRepaymentHealthNotifications } from './utils/repaymentHealth.js';

function isAuthRoute() {
  return ['#/login', '#/register', '#/forgot-password'].includes(window.location.hash);
}

function cleanPortalPath() {
  return window.location.pathname.replace(/\/+$/, '').toLowerCase();
}

function isBackOfficePath() {
  const path = cleanPortalPath();
  return path === '/backoffice' || path.startsWith('/backoffice/');
}

function isStandaloneDisplay() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function isPortalEntryRoute() {
  return window.location.hash === '#/portal-entry';
}

function applyCleanPortalRoute() {
  const path = cleanPortalPath();
  if (path === '/finance-salama-lock' && window.location.hash === '#/finance/login') {
    window.history.replaceState(null, '', `${window.location.pathname}#/login`);
    return;
  }

  if (window.location.hash) return;

  const routeByPath = {
    '/admin-salama-lock': '#/admin/login',
    '/finance-salama-lock': '#/login',
    '/portal-entry': '#/portal-entry'
  };
  const hashRoute = routeByPath[path];
  if (hashRoute) {
    window.history.replaceState(null, '', `${window.location.pathname}${hashRoute}`);
    return;
  }

  if (isStandaloneDisplay() && !window.location.hash) {
    window.history.replaceState(null, '', `${window.location.pathname}#/portal-entry`);
  }
}

let freshLoginEnforced = false;

function requireFreshPortalLogin() {
  if (freshLoginEnforced) return;
  freshLoginEnforced = true;

  [
    'SALAMA LOCK-auth-token',
    'SALAMA LOCK-auth-refresh-token',
    'SALAMA LOCK-auth-expires-at',
    'SALAMA LOCK-customer-token',
    'SALAMA LOCK-agent-token',
    'SALAMA LOCK-admin-token',
    'SALAMA LOCK-uploaded-admin-session'
  ].forEach((key) => window.sessionStorage.removeItem(key));
}

function isAdminRoute() {
  return window.location.hash.startsWith('#/admin');
}

function isFinanceRoute() {
  return cleanPortalPath() === '/finance-salama-lock' || isAuthRoute();
}

function isNextOfKinRoute() {
  const params = new URLSearchParams(window.location.search);
  return window.location.hash.startsWith('#/next-of-kin') || params.has('next-of-kin');
}

function portalMetaForRoute() {
  if (isPortalEntryRoute()) {
    return {
      title: 'SALAMA LOCK Paygo Portal Login',
      manifest: '/manifest.webmanifest',
      appleTitle: 'SALAMA LOCK Paygo',
      description: 'Choose the SALAMA LOCK Paygo portal you want to sign in to.'
    };
  }

  if (isBackOfficePath()) {
    return {
      title: 'SALAMA LOCK Paygo Back Office',
      manifest: '/manifest-backoffice.webmanifest',
      appleTitle: 'SALAMA LOCK Back Office',
      description: 'Back Office screening workspace for SALAMA LOCK Paygo customer applications.'
    };
  }

  if (isAdminRoute()) {
    return {
      title: 'SALAMA LOCK Paygo Admin Portal',
      manifest: '/manifest-admin.webmanifest',
      appleTitle: 'SALAMA LOCK Admin',
      description: 'Admin CRM for SalamaLock screening, users, devices, reports, audit, and approvals.'
    };
  }

  if (isFinanceRoute()) {
    return {
      title: 'SALAMA LOCK Paygo Finance Portal',
      manifest: '/manifest-finance.webmanifest',
      appleTitle: 'SALAMA LOCK Finance',
      description: 'Finance workspace for SALAMA LOCK Paygo collections, commissions, reconciliation, reports, and notifications.'
    };
  }

  return {
    title: 'SALAMA LOCK Paygo',
    manifest: '/manifest.webmanifest',
    appleTitle: 'SALAMA LOCK Paygo',
    description: 'SALAMA LOCK Paygo customer and agent PAYGO product portals.'
  };
}

function buildDailyPaymentNotifications(payments) {
  const dailyRecords = payments.reduce((days, payment) => {
    const date = payment.date?.slice(0, 10) || new Date().toISOString().slice(0, 10);
    const current = days.get(date) ?? {
      date,
      recordCount: 0,
      paidCount: 0,
      unpaidCount: 0,
      collected: 0,
      unpaidBalance: 0,
      agents: new Map(),
      customers: []
    };
    const collected = Number(payment.depositCredit || 0) + Number(payment.paygoPayment || 0);
    const agentName = payment.agentName || 'No agent';
    const agentCode = payment.agentId || 'No code';
    const agentKey = `${agentName}-${agentCode}`;
    const agentRecord = current.agents.get(agentKey) ?? {
      agentName,
      agentCode,
      recordCount: 0
    };

    current.recordCount += 1;
    current.collected += collected;
    agentRecord.recordCount += 1;
    current.agents.set(agentKey, agentRecord);
    current.customers.push({
      customerName: payment.customerName || 'No customer name',
      customerPhone: payment.customerPhone || 'No phone',
      status: payment.status === 'paid' ? 'Paid' : 'Unpaid',
      paygoState: payment.paygoState || 'follow_up',
      amount: formatKes(collected),
      receipt: payment.receipt || 'No receipt',
      agentName,
      agentCode
    });

    if (payment.status === 'paid') {
      current.paidCount += 1;
    } else {
      current.unpaidCount += 1;
      current.unpaidBalance += Number(payment.balance ?? payment.totalPayable ?? 0);
    }

    days.set(date, current);
    return days;
  }, new Map());

  return [...dailyRecords.values()]
    .sort((first, second) => second.date.localeCompare(first.date))
    .map((record) => {
      const agentSummary = [...record.agents.values()]
        .map((agent) => `${agent.agentName} / ${agent.agentCode} (${agent.recordCount})`)
        .join('\n');
      const customerSummary = record.customers
        .map((customer) =>
          `${customer.customerName} - ${customer.status} ${customer.amount} (${customer.receipt})`
        )
        .join('\n');
      const customerActivities = record.customers.map((customer) => ({
        label: customer.customerName,
        value: `${customer.status} | Paid today ${customer.amount} | Account ${customer.paygoState.replaceAll('_', ' ')} | ${customer.receipt}`
      }));
      const customerNames = record.customers.map((customer) => customer.customerName).join(', ');

      return {
        id: `payment-daily-${record.date}`,
        type: 'payment_daily',
        title: `Daily payment activity: ${formatDate(record.date)}`,
        message: `${customerNames}: ${record.recordCount} records, ${record.paidCount} paid, ${record.unpaidCount} unpaid.`,
        issue: `Collected ${formatKes(record.collected)}. Unpaid balance ${formatKes(record.unpaidBalance)}.`,
        followUp: record.unpaidCount > 0
          ? 'Follow up unpaid customers and confirm the next collection action.'
          : 'No unpaid payment follow-up needed for this day.',
        paymentDate: formatDate(record.date),
        recordCount: record.recordCount,
        paidCount: record.paidCount,
        unpaidCount: record.unpaidCount,
        paymentStatusSummary: `${record.paidCount} paid, ${record.unpaidCount} unpaid`,
        collectedAmount: formatKes(record.collected),
        unpaidBalance: formatKes(record.unpaidBalance),
        agentSummary,
        customerSummary,
        customerActivities,
        sourcePortal: 'Payment records',
        createdAt: `${record.date}T18:00:00`,
        isRead: false
      };
    });
}

export function App() {
  useSecurityGuards();
  applyCleanPortalRoute();
  requireFreshPortalLogin();

  const [authenticated, setAuthenticated] = useState(() => Boolean(getAuthToken()));
  const [authChecked, setAuthChecked] = useState(false);
  const [authRouteActive, setAuthRouteActive] = useState(isAuthRoute);
  const [portalEntryRouteActive, setPortalEntryRouteActive] = useState(isPortalEntryRoute);
  const [adminRouteActive, setAdminRouteActive] = useState(isAdminRoute);
  const [backOfficeRouteActive, setBackOfficeRouteActive] = useState(isBackOfficePath);
  const [nextOfKinRouteActive, setNextOfKinRouteActive] = useState(isNextOfKinRoute);
  const [activeScreen, setActiveScreen] = useState(
    () => window.sessionStorage.getItem('SALAMA LOCK-active-screen') || 'dashboard'
  );
  const [profilePhoto, setProfilePhoto] = useState(
    () => window.sessionStorage.getItem('SALAMA LOCK-profile-photo') || ''
  );
  const [profileSettings, setProfileSettings] = useState(() => ({
    name: '',
    role: '',
    phone: '',
    branch: ''
  }));
  const [financeScope, setFinanceScope] = useState(() => window.sessionStorage.getItem('SALAMA LOCK-finance-scope') || 'all');
  const [themeMode, setThemeMode] = useState('light');
  const [appLayout, setAppLayout] = useState('App view');
  const [toastMessage, setToastMessage] = useState('');
  const [notifications, setNotifications] = useState([]);
  const { canInstall, install } = useInstallPrompt();

  const refreshDailyPaymentNotifications = useCallback(() => {
    return Promise.all([
      paymentService.listPayments(),
      notificationService.listNotifications()
    ])
      .then(([payments, backendNotifications]) => {
        const dailyNotifications = buildDailyPaymentNotifications(payments);
        const repaymentNotifications = buildRepaymentHealthNotifications(payments);
        setNotifications((current) => {
          const existingById = new Map(current.map((item) => [item.id, item]));
          const mergedDailyNotifications = dailyNotifications.map((item) => ({
            ...item,
            isRead: existingById.get(item.id)?.isRead ?? item.isRead
          }));
          const mergedRepaymentNotifications = repaymentNotifications.map((item) => ({
            ...item,
            isRead: existingById.get(item.id)?.isRead ?? item.isRead
          }));
          const mergedBackendNotifications = backendNotifications.map((item) => ({
            ...item,
            isRead: existingById.get(item.id)?.isRead ?? item.isRead
          }));
          const generatedIds = new Set([
            ...mergedDailyNotifications.map((item) => item.id),
            ...mergedRepaymentNotifications.map((item) => item.id),
            ...mergedBackendNotifications.map((item) => item.id)
          ]);
          const otherNotifications = current.filter(
            (item) => !generatedIds.has(item.id) && !['payment_daily', 'repayment_health'].includes(item.type)
          );

          return [...mergedBackendNotifications, ...mergedRepaymentNotifications, ...mergedDailyNotifications, ...otherNotifications]
            .sort((first, second) => String(second.createdAt || '').localeCompare(String(first.createdAt || '')));
        });
      })
      .catch(() => {});
  }, []);

  const refreshPaymentActivity = useCallback(() => {
    return refreshDailyPaymentNotifications();
  }, [refreshDailyPaymentNotifications]);

  useEffect(() => {
    function handleHashChange() {
      setAuthRouteActive(isAuthRoute());
      setPortalEntryRouteActive(isPortalEntryRoute());
      setAdminRouteActive(isAdminRoute());
      setBackOfficeRouteActive(isBackOfficePath());
      setNextOfKinRouteActive(isNextOfKinRoute());
    }

    window.addEventListener('hashchange', handleHashChange);
    window.addEventListener('popstate', handleHashChange);
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      window.removeEventListener('popstate', handleHashChange);
    };
  }, []);

  useEffect(() => {
    const meta = portalMetaForRoute();
    const manifestLink = document.querySelector('link[rel="manifest"]');
    const appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    const description = document.querySelector('meta[name="description"]');

    document.title = meta.title;
    manifestLink?.setAttribute('href', meta.manifest);
    appleTitle?.setAttribute('content', meta.appleTitle);
    description?.setAttribute('content', meta.description);
  }, [adminRouteActive, backOfficeRouteActive, nextOfKinRouteActive, authRouteActive, portalEntryRouteActive]);

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    document.documentElement.style.colorScheme = themeMode;
  }, [themeMode]);

  useEffect(() => {
    window.sessionStorage.setItem('SALAMA LOCK-active-screen', activeScreen);
  }, [activeScreen]);

  useEffect(() => {
    window.sessionStorage.setItem('SALAMA LOCK-finance-scope', financeScope);
  }, [financeScope]);

  useEffect(() => {
    if (profilePhoto) {
      window.sessionStorage.setItem('SALAMA LOCK-profile-photo', profilePhoto);
    }
  }, [profilePhoto]);

  useEffect(() => {
    if (!getAuthToken()) {
      setAuthChecked(true);
      setAuthenticated(false);
      return;
    }

    authService.currentUser()
      .then((user) => {
        setAuthenticated(user.role === 'finance' || user.role === 'admin');
        setProfileSettings({
          name: user.fullName || user.email || '',
          role: user.role || '',
          phone: user.phone || '',
          branch: user.branch || ''
        });
      })
      .catch(() => {
        authService.logout();
        setAuthenticated(false);
      })
      .finally(() => setAuthChecked(true));
  }, []);

  useEffect(() => {
    if (!authenticated) return;

    refreshDailyPaymentNotifications();
  }, [authenticated, refreshDailyPaymentNotifications, refreshPaymentActivity]);

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.isRead).length,
    [notifications]
  );

  function handleLogout() {
    authService.logout();
    window.sessionStorage.removeItem('SALAMA LOCK-active-screen');
    setAuthenticated(false);
    setActiveScreen('dashboard');
  }

  function handleLogin(user = {}) {
    setProfileSettings({
      name: user.fullName || user.email || '',
      role: user.role || '',
      phone: user.phone || '',
      branch: user.branch || ''
    });
    setAuthenticated(true);
  }

  if (!authChecked) {
    const networkAvailable = window.navigator.onLine;
    return (
      <View
        className="app-viewport"
        style={{ alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--app-bg)', padding: 24 }}
      >
        <View style={{ width: 'min(720px, 100%)', gap: 14, alignItems: 'center' }}>
          <Text style={{ color: networkAvailable ? 'var(--app-text)' : '#b42318', fontSize: 24, fontWeight: '700' }}>{networkAvailable ? 'Loading your secure portal…' : 'Network is down'}</Text>
          <Text style={{ color: 'var(--app-muted)', textAlign: 'center' }}>{networkAvailable ? 'Preparing the workspace before redirecting.' : 'Check your connection and reload this tab.'}</Text>
          <View style={{ width: '100%', height: 230, marginTop: 10, borderRadius: 14, borderWidth: 1, borderColor: 'var(--app-border)', backgroundColor: '#ffffff', padding: 20, gap: 15 }}>
            <View style={{ width: '42%', height: 22, borderRadius: 7, backgroundColor: '#e5ece8' }} />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              {[1,2,3].map((item) => <View key={item} style={{ flex: 1, height: 58, borderRadius: 9, backgroundColor: '#edf3ef' }} />)}
            </View>
            <View style={{ width: '100%', height: 90, borderRadius: 9, backgroundColor: '#e8efeb' }} />
          </View>
        </View>
      </View>
    );
  }

  if (nextOfKinRouteActive) {
    return (
      <>
        <NextOfKinAcceptScreen />
        <FloatingInstallButton visible={canInstall} onPress={install} />
      </>
    );
  }

  if (backOfficeRouteActive) {
    return (
      <>
        <BackOfficePortalScreen />
        <FloatingInstallButton visible={canInstall} onPress={install} />
      </>
    );
  }

  if (portalEntryRouteActive) {
    return (
      <>
        <PortalEntryScreen />
        <FloatingInstallButton visible={canInstall} onPress={install} />
        <SupportChatWidget />
      </>
    );
  }

  if (adminRouteActive) {
    return <UploadedAdminPortalScreen />;
  }

  if (!authenticated) {
    if (authRouteActive) {
      return <LoginScreen onLogin={handleLogin} />;
    }
    return (
      <>
        <PortalLandingScreen />
        <FloatingInstallButton visible={canInstall} onPress={install} />
        <SupportChatWidget />
      </>
    );
  }

  function handleThemeModeChange(nextTheme) {
    setThemeMode(nextTheme);
    setToastMessage(`${nextTheme === 'dark' ? 'Dark' : 'Light'} theme applied`);
  }

  function handleAppLayoutChange(nextLayout) {
    setAppLayout(nextLayout);
    setToastMessage(`${nextLayout} applied`);
  }

  return (
    <View
      className="app-viewport"
      data-theme={themeMode}
      data-layout={appLayout === 'Compact view' ? 'compact' : 'app'}
      style={{ backgroundColor: 'var(--app-bg)' }}
    >
      <AppShell
        activeScreen={activeScreen}
        onNavigate={setActiveScreen}
        onLogout={handleLogout}
        unreadCount={unreadCount}
        profilePhoto={profilePhoto}
        appLayout={appLayout}
        canInstall={canInstall}
        onInstall={install}
        profileSettings={profileSettings}
        financeScope={financeScope}
        onFinanceScopeChange={setFinanceScope}
      >
        {activeScreen === 'dashboard' && (
          <DashboardScreen onNavigate={setActiveScreen} notifications={notifications} productTypeScope={financeScope} />
        )}
        {activeScreen === 'payments' && <PaymentsScreen onPaymentRecordsChange={refreshPaymentActivity} productTypeScope={financeScope} />}
        {activeScreen === 'phones' && <InventoryScreen productType="phone" />}
        {activeScreen === 'bikes' && <InventoryScreen productType="bike" />}
        {activeScreen === 'customers' && <CustomersScreen />}
        {activeScreen === 'commissions' && <CommissionsScreen productTypeScope={financeScope} />}
        {activeScreen === 'reports' && <ReportsScreen productTypeScope={financeScope} />}
        {activeScreen === 'reconciliation' && <ReconciliationScreen productTypeScope={financeScope} />}
        {activeScreen === 'notifications' && (
          <NotificationsScreen
            notifications={notifications}
            onNotificationsChange={setNotifications}
          />
        )}
        {activeScreen === 'settings' && (
          <SettingsScreen
            profilePhoto={profilePhoto}
            onProfilePhotoChange={setProfilePhoto}
            profileSettings={profileSettings}
            onProfileSettingsChange={setProfileSettings}
            onStatusMessage={setToastMessage}
            themeMode={themeMode}
            onThemeModeChange={handleThemeModeChange}
            appLayout={appLayout}
            onAppLayoutChange={handleAppLayoutChange}
            canInstall={canInstall}
            onInstall={install}
          />
        )}
      </AppShell>
      <Toast message={toastMessage} onClose={() => setToastMessage('')} />
      <SupportChatWidget />
    </View>
  );
}
