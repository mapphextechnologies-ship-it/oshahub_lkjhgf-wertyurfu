import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'salama_customer_token';
const MERCHANT_KEY = 'salama_customer_merchant';
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://www.salamalockpay.com';
const DEMO_MODE = process.env.EXPO_PUBLIC_DEMO_MODE !== 'false';

const demoPortal = {
  customer: {
    id: 'demo-customer',
    fullName: 'Amina Wanjiku',
    phone: '0712 345 678',
    email: 'customer@salama.demo',
    nationalId: '28456789',
    region: 'Nairobi'
  },
  account: {
    status: 'active',
    balance: 18400,
    dailyInstallment: 250,
    paymentProgress: 62,
    nextPaymentDate: 'Today'
  },
  device: {
    model: 'Samsung Galaxy A16',
    imei: '356789•••••421',
    status: 'active'
  },
  payments: [
    { id: 'p1', provider: 'M-PESA', amount: 500, paidAt: 'Today, 8:42 AM', status: 'Paid' },
    { id: 'p2', provider: 'M-PESA', amount: 250, paidAt: 'Yesterday, 6:18 PM', status: 'Paid' },
    { id: 'p3', provider: 'Paybill', amount: 1000, paidAt: '24 Jul 2026', status: 'Paid' }
  ],
  notifications: [
    { id: 'n1', title: 'Payment received', message: 'Your KES 500 payment was received successfully.', createdAt: 'Today' },
    { id: 'n2', title: 'Device active', message: 'Your account is up to date and your device remains active.', createdAt: 'Yesterday' }
  ]
};

export const hasSession = async () => Boolean(await SecureStore.getItemAsync(TOKEN_KEY));
export const saveSession = (token) => SecureStore.setItemAsync(TOKEN_KEY, token);
export const clearSession = () => SecureStore.deleteItemAsync(TOKEN_KEY);
export const getMerchant = async () => {
  const value = await SecureStore.getItemAsync(MERCHANT_KEY);
  try { return value ? JSON.parse(value) : null; } catch { return null; }
};
export const saveMerchant = (merchant) => SecureStore.setItemAsync(MERCHANT_KEY, JSON.stringify(merchant));
export const clearMerchant = () => SecureStore.deleteItemAsync(MERCHANT_KEY);

export async function resolveMerchantCode(code) {
  const normalized = String(code || '').trim().toUpperCase();
  if (!/^SL-[A-Z0-9]{2,10}-\d{4}$/.test(normalized)) throw new Error('Enter the shop code exactly as provided by your agent.');
  if (DEMO_MODE) {
    const username = normalized.split('-')[1].toLowerCase();
    return { id: username, username, appName: username.replace(/(^|[-_])\w/g, (match) => match.replace(/[-_]/, ' ').toUpperCase()), enrollmentCode: normalized };
  }
  const result = await request('/api/customer/merchant-enrollment/resolve', 'POST', { code: normalized });
  return { ...result.merchant, enrollmentToken: result.enrollmentToken, enrollmentCode: normalized };
}

async function request(path, method = 'GET', body) {
  if (DEMO_MODE) {
    await new Promise((resolve) => setTimeout(resolve, 350));
    if (path === '/api/customer/auth/login') {
      if (!body?.email || !body?.password) throw new Error('Enter the demo email and password.');
      return { token: 'customer-demo-session', user: demoPortal.customer };
    }
    if (path === '/api/customer/portal') return { portal: demoPortal };
    if (path === '/api/customer/payment-requests') return { success: true, requestId: `demo-${Date.now()}` };
    if (path.includes('password-reset') || path.includes('activation')) return { success: true, otpAvailable: true };
    if (path === '/api/auth/verify-otp') return { resetToken: 'demo-reset-token' };
    if (path === '/api/auth/reset-password') return { success: true };
    return { success: true };
  }

  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  const merchant = await getMerchant();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(merchant?.enrollmentToken ? { 'X-Merchant-Enrollment': merchant.enrollmentToken } : {}),
        ...(merchant?.id ? { 'X-Merchant-Id': String(merchant.id) } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.message || 'The request could not be completed.');
      error.status = response.status;
      throw error;
    }
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('The request timed out. Check your connection and try again.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, 'POST', body)
};
