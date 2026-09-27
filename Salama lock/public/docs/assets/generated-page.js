(() => {
  if (localStorage.getItem('salamaApiAuth') !== 'verified') {
    sessionStorage.setItem('apiNext', location.pathname);
    location.replace('/#/api-login');
    return;
  }

  const slug = location.pathname.split('/').pop().replace('.html', '');
  const pages = {
    database: ['Database', 'Persistence model', 'The platform stores merchant-scoped device records, command state, provider callbacks and audit events in a structured persistence layer.', ['Merchant isolation', 'Every stored device and command is associated with its owning merchant account.', 'Migration control', 'Versioned database migrations keep environments consistent and changes reviewable.', 'Auditable records', 'Lifecycle events retain timestamps and correlation identifiers for operational review.']],
    security: ['Security', 'Security controls', 'Salama Lock protects API access, device commands and callbacks through layered authentication and authorization controls.', ['API credentials', 'Partner keys are hashed and exchanged for scoped access tokens.', 'Command authorization', 'Lock and unlock requests require authenticated permissions and validated ownership.', 'Protected callbacks', 'Provider callbacks use shared secrets, correlation identifiers and auditable processing.']],
    providers: ['Providers', 'Device provider integrations', 'Provider adapters connect Salama Lock commands to manufacturer and enterprise device-management services.', ['Adapter boundary', 'Provider-specific behavior stays isolated behind a consistent internal command interface.', 'Reliable delivery', 'Retries and queue processing handle temporary provider or network interruptions.', 'Status synchronization', 'Callbacks and polling update command and device state after provider execution.']],
    configuration: ['Configuration', 'Runtime configuration', 'Environment-based settings control authentication, providers, queues, callbacks and operational limits without changing application code.', ['Environment separation', 'Local, test and production environments keep independent configuration values.', 'Secret handling', 'API keys, callback secrets and administrative credentials belong in protected runtime variables.', 'Operational tuning', 'Retry limits, worker intervals and provider options can be adjusted per deployment.']],
    'admin-guide': ['Admin Guide', 'Administration and monitoring', 'Administrative tools support merchant management, provider visibility, event review and operational troubleshooting.', ['Merchant accounts', 'Review account status, roles and access configuration.', 'System monitoring', 'Inspect device totals, command outcomes and callback processing health.', 'Audit support', 'Use correlated events to investigate requests and resolve operational disputes.']],
    deployment: ['Deployment', 'Production deployment', 'The service is designed for repeatable deployment behind TLS with protected runtime configuration and monitored dependencies.', ['Application runtime', 'Build and run the Spring service using production environment variables.', 'Database readiness', 'Apply migrations before accepting API traffic and verify connectivity.', 'Health and scaling', 'Monitor application health, queues and providers while scaling stateless service instances.']],
    troubleshooting: ['Troubleshooting', 'Operational troubleshooting', 'Use correlation identifiers, command status and provider responses to trace issues through the platform.', ['Authentication failures', 'Confirm credentials, token scopes and merchant ownership.', 'Pending commands', 'Review queue state, retry attempts and provider availability.', 'Callback issues', 'Validate callback secrets, payload identifiers and audit events.']],
    changelog: ['Changelog', 'Platform change history', 'Track API, security, provider and operational changes that affect partner integrations.', ['API changes', 'Document new endpoints, response fields and compatibility notes.', 'Security changes', 'Record authentication, authorization and secret-management improvements.', 'Operational changes', 'Capture provider, retry, monitoring and deployment updates.']],
    'verification-report': ['Verification Report', 'Implementation verification', 'Verification checks compare documented behavior with controllers, security rules, persistence and provider code.', ['Endpoint review', 'Confirm documented routes, request bodies, responses and status codes.', 'Security review', 'Verify authentication requirements, scopes and merchant isolation.', 'Workflow review', 'Trace enrollment, lock, unlock, callback and retry behavior end to end.']]
  };
  const page = pages[slug] || ['Documentation', 'Salama Lock documentation', 'Technical documentation for secure device-management integrations.', []];
  const nav = [
    ['index.html','Overview'],['architecture.html','Architecture'],['api.html','API Reference'],['partner-handbook.html','Partner Handbook'],
    ['database.html','Database'],['security.html','Security'],['providers.html','Providers'],['configuration.html','Configuration'],
    ['admin-guide.html','Admin Guide'],['deployment.html','Deployment'],['troubleshooting.html','Troubleshooting'],
    ['changelog.html','Changelog'],['verification-report.html','Verification Report']
  ];
  const cards = [];
  for (let i = 0; i < page[3].length; i += 2) cards.push(`<section><h2>${page[3][i]}</h2><p>${page[3][i + 1]}</p></section>`);
  document.body.innerHTML = `
    <div class="mobile-bar"><strong>Salama Lock Docs</strong><button type="button" id="menuToggle">Menu</button></div>
    <div class="overlay" id="navOverlay"></div>
    <div class="layout">
      <aside class="sidebar">
        <div class="brand"><strong>Salama Lock</strong><span>Documentation</span></div>
        <input class="search" id="navSearch" type="search" placeholder="Filter pages…" aria-label="Filter navigation">
        <nav class="nav">${nav.map(([href,label]) => `<a href="${href}"${href === `${slug}.html` ? ' class="active"' : ''}>${label}</a>`).join('')}</nav>
        <div class="sidebar-footer"><button type="button" class="btn-icon" id="themeToggle">Theme</button></div>
      </aside>
      <div class="content-wrap"><article class="doc"><header class="doc-header"><p class="eyebrow">${page[0]}</p><h1>${page[1]}</h1><p>${page[2]}</p></header>${cards.join('')}</article></div>
    </div>`;
  const app = document.createElement('script');
  app.src = 'assets/app.js';
  document.body.appendChild(app);
})();
