const baseUrl = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:5173';

const cases = [
  {
    name: 'finance register validates required fields',
    path: '/api/auth/register',
    options: { method: 'POST', body: {} },
    expectedStatus: 400,
    expectedText: 'Enter full name'
  },
  {
    name: 'finance login validates credentials',
    path: '/api/auth/login',
    options: { method: 'POST', body: { identifier: 'bad', password: 'short' } },
    expectedStatus: 400,
    expectedText: 'Invalid login credentials'
  },
  {
    name: 'agent register validates required fields',
    path: '/api/agent/auth/register',
    options: { method: 'POST', body: {} },
    expectedStatus: 400,
    expectedText: 'Enter full name'
  },
  {
    name: 'agent login validates credentials',
    path: '/api/agent/auth/login',
    options: { method: 'POST', body: { email: 'bad', password: 'short' } },
    expectedStatus: 400,
    expectedText: 'Invalid login credentials'
  },
  {
    name: 'customer activation validates OTP',
    path: '/api/customer/auth/activate',
    options: { method: 'POST', body: { otp: '123' } },
    expectedStatus: 400,
    expectedText: '6-digit'
  },
  {
    name: 'customer activation OTP validates onboarding phone',
    path: '/api/customer/auth/activation-otp',
    options: { method: 'POST', body: { phone: '123' } },
    expectedStatus: 400,
    expectedText: 'Kenyan phone number'
  },
  {
    name: 'customer login validates credentials',
    path: '/api/customer/auth/login',
    options: { method: 'POST', body: { email: 'bad', password: 'short' } },
    expectedStatus: 400,
    expectedText: 'Invalid login credentials'
  },
  {
    name: 'admin agent approval is protected',
    path: '/api/admin/agents/test-agent/approve',
    options: { method: 'POST' },
    expectedStatus: 401,
    expectedText: 'Sign in is required'
  },
  {
    name: 'admin customer approval is protected',
    path: '/api/admin/applications/test-application/review',
    options: { method: 'POST', body: { action: 'approve', reason: 'smoke test' } },
    expectedStatus: 401,
    expectedText: 'Sign in is required'
  },
  {
    name: 'admin finance approval is protected',
    path: '/api/admin/finance-users/test-user/approve',
    options: { method: 'POST' },
    expectedStatus: 401,
    expectedText: 'Sign in is required'
  },
  {
    name: 'admin agent status is protected',
    path: '/api/admin/agents/test-agent/status',
    options: { method: 'POST', body: { status: 'suspended' } },
    expectedStatus: 401,
    expectedText: 'Sign in is required'
  },
  {
    name: 'admin user creation is protected',
    path: '/api/admin/finance-users',
    options: { method: 'POST', body: { name: 'Smoke User', email: 'smoke@example.com', phone: '0700000000' } },
    expectedStatus: 401,
    expectedText: 'Sign in is required'
  },
  {
    name: 'admin user status is protected',
    path: '/api/admin/finance-users/test-user/status',
    options: { method: 'POST', body: { status: 'active' } },
    expectedStatus: 401,
    expectedText: 'Sign in is required'
  },
  {
    name: 'admin user role is protected',
    path: '/api/admin/finance-users/test-user/role',
    options: { method: 'POST', body: { role: 'finance_officer' } },
    expectedStatus: 401,
    expectedText: 'Sign in is required'
  },
  {
    name: 'admin user reset is protected',
    path: '/api/admin/finance-users/test-user/reset',
    options: { method: 'POST' },
    expectedStatus: 401,
    expectedText: 'Sign in is required'
  },
  {
    name: 'admin notification status is protected',
    path: '/api/admin/notifications/status',
    options: { method: 'POST', body: { ids: ['FNT-test'], status: 'read' } },
    expectedStatus: 401,
    expectedText: 'Sign in is required'
  },
  {
    name: 'admin application details are protected',
    path: '/api/admin/applications/test-application/details',
    options: { method: 'POST', body: { verification: {} } },
    expectedStatus: 401,
    expectedText: 'Sign in is required'
  },
  {
    name: 'admin product agent assignment is protected',
    path: '/api/admin/products/test-product/assign-agent',
    options: { method: 'POST', body: { assignedAgentId: 'test-agent' } },
    expectedStatus: 401,
    expectedText: 'Sign in is required'
  },
  {
    name: 'finance notification read update is protected',
    path: '/api/notifications',
    options: { method: 'PATCH', body: { ids: ['FNT-test'], status: 'read' } },
    expectedStatus: 401,
    expectedText: 'Sign in is required'
  },
  {
    name: 'finance notification delete is protected',
    path: '/api/notifications',
    options: { method: 'DELETE', body: { ids: ['FNT-test'] } },
    expectedStatus: 401,
    expectedText: 'Sign in is required'
  }
];

function bodyFor(options = {}) {
  if (!('body' in options)) return {};
  return {
    body: JSON.stringify(options.body),
    headers: {
      'Content-Type': 'application/json'
    }
  };
}

let failed = 0;

for (const item of cases) {
  const response = await fetch(`${baseUrl}${item.path}`, {
    method: item.options.method,
    ...bodyFor(item.options)
  });
  const text = await response.text();
  const ok = response.status === item.expectedStatus && text.includes(item.expectedText);

  console.log(`${ok ? 'PASS' : 'FAIL'} ${item.name} -> ${response.status} ${text}`);
  if (!ok) failed += 1;
}

if (failed) {
  process.exitCode = 1;
}
