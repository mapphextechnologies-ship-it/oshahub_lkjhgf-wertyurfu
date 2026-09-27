import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'salama_agent_token';
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://www.salamalockpay.com';
const DEMO_MODE = process.env.EXPO_PUBLIC_DEMO_MODE !== 'false';

const demoPortal = {
  agent: { id: 'demo-agent', fullName: 'Kevin Otieno', phone: '0722 456 789', email: 'agent@salama.demo', region: 'Nairobi East' },
  inventory: [
    { id: 'd1', productModel: 'Samsung Galaxy A16', imei: '356789000112421', totalPayable: 28500 },
    { id: 'd2', productModel: 'Honor X6b', imei: '869201005431120', totalPayable: 24900 },
    { id: 'd3', productModel: 'Samsung Galaxy A05', imei: '356112009845230', totalPayable: 21800, customerId: 'c2' }
  ],
  customers: [
    { id: 'c1', fullName: 'Mary Njeri', phone: '0711 220 330', status: 'active', balance: 16400, depositAmount: 2500, nextPaymentDate: 'Today', dailyInstallment: 250 },
    { id: 'c2', fullName: 'Brian Kamau', phone: '0724 880 116', status: 'screening', balance: 21800, depositAmount: 2000 },
    { id: 'c3', fullName: 'Faith Achieng', phone: '0705 331 992', status: 'overdue', balance: 9200, depositAmount: 1500, daysOverdue: 4, overdueAmount: 1000, dailyInstallment: 250, lastPaymentDate: '23 Jul 2026' }
  ],
  tasks: [
    { id: 't1', title: 'Follow up Mary’s deposit', note: 'Call before 2:00 PM', completed: false },
    { id: 't2', title: 'Deliver Honor X6b', note: 'Customer meeting in Kayole', completed: false },
    { id: 't3', title: 'Submit weekly inventory count', note: 'Completed this morning', completed: true }
  ],
  commissions: [
    { id: 'm1', description: 'Mary Njeri sale', amount: 850, createdAt: '26 Jul 2026', status: 'Approved' },
    { id: 'm2', description: 'Brian Kamau sale', amount: 650, createdAt: '23 Jul 2026', status: 'Pending' }
  ],
  notifications: [
    { id: 'a1', title: 'New stock assigned', message: 'Two devices were added to your inventory.' },
    { id: 'a2', title: 'Commission approved', message: 'KES 850 is ready for payout.' }
  ]
};

const cloneDemoPortal = () => JSON.parse(JSON.stringify(demoPortal));

export const hasSession = async () => Boolean(await SecureStore.getItemAsync(TOKEN_KEY));
export const saveSession = (token) => SecureStore.setItemAsync(TOKEN_KEY, token);
export const clearSession = () => SecureStore.deleteItemAsync(TOKEN_KEY);

async function request(path, method = 'GET', body) {
  if (DEMO_MODE) {
    await new Promise((resolve) => setTimeout(resolve, 350));
    if (path === '/api/agent/auth/login') {
      if (!body?.email || !body?.password) throw new Error('Enter the demo email and password.');
      return { token: 'agent-demo-session', user: demoPortal.agent };
    }
    if (path === '/api/agent/portal') return { portal: cloneDemoPortal() };
    if (path === '/api/agent/customers' && method === 'POST') {
      const customer = {
        id: `demo-customer-${Date.now()}`,
        ...body,
        status: 'screening',
        balance: Number(body?.depositAmount || 0)
      };
      demoPortal.customers.unshift(customer);
      const device = demoPortal.inventory.find((item) => item.id === body?.productId);
      if (device) device.customerId = customer.id;
      return { success: true, customer };
    }
    if (path === '/api/agent/tasks' && method === 'POST') {
      const task = { id: `demo-task-${Date.now()}`, title: body?.title, note: body?.note, completed: false };
      demoPortal.tasks.unshift(task);
      return { success: true, task };
    }
    if (/\/api\/agent\/tasks\/[^/]+\/complete$/.test(path)) {
      const taskId = decodeURIComponent(path.split('/').at(-2));
      const task = demoPortal.tasks.find((item) => item.id === taskId);
      if (task) task.completed = body?.completed === undefined ? true : Boolean(body.completed);
      return { success: true, task };
    }
    if (path.includes('/deposit-request')) return { success: true, requestId: `demo-deposit-${Date.now()}` };
    if (path.includes('/message')) return { success: true };
    if (path.includes('/resend-next-of-kin')) return { success: true };
    if (path.includes('/verify-next-of-kin')) return { success: true };
    if (path === '/api/agent/customer-media') return { success: true };
    if (path.includes('password-reset')) return { success: true, otpAvailable: true };
    if (path === '/api/auth/verify-otp') return { resetToken: 'demo-reset-token' };
    if (path === '/api/auth/reset-password') return { success: true };
    return { success: true };
  }

  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
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
