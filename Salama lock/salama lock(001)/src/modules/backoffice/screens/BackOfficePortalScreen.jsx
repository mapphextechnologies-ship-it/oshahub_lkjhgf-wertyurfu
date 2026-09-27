import React, { useInsertionEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';
import BackOfficeApp from '@/backOffice/app/App.jsx';
import { AppProviders as UploadedAdminProviders } from '@/uploadedAdmin/app/providers.jsx';
import uploadedAdminCss from '@/uploadedAdmin/styles/global.css?inline';

export function BackOfficePortalScreen() {
  useInsertionEffect(() => {
    const styleId = 'SALAMA LOCK-backoffice-forced-styles';
    const existing = document.getElementById(styleId);
    if (existing) {
      existing.textContent = `${uploadedAdminCss}\n${criticalBackOfficeCss}`;
      return undefined;
    }

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `${uploadedAdminCss}\n${criticalBackOfficeCss}`;
    document.head.appendChild(style);
    return undefined;
  }, []);

  return (
    <div className="uploaded-admin-viewport">
      <style>{criticalBackOfficeCss}</style>
      <BrowserRouter>
        <UploadedAdminProviders>
          <BackOfficeApp />
        </UploadedAdminProviders>
      </BrowserRouter>
    </div>
  );
}

const criticalBackOfficeCss = `
.uploaded-admin-viewport{width:100%;height:var(--app-vh,100vh);overflow-x:hidden;overflow-y:auto;background:#f5f7fb;color:#16211f;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.uploaded-admin-viewport *{box-sizing:border-box}
.uploaded-admin-viewport a{color:#1d4ed8;font-weight:500;text-decoration:none}
.uploaded-admin-viewport button,.uploaded-admin-viewport input,.uploaded-admin-viewport select,.uploaded-admin-viewport textarea{font:inherit}
.admin-shell{display:grid;grid-template-columns:280px minmax(0,1fr);grid-template-rows:auto minmax(0,1fr);min-height:100%;width:100%;overflow:visible;background:#f5f7fb}
.admin-shell.sidebar-closed{grid-template-columns:0 minmax(0,1fr)}
.topbar{position:sticky;top:0;grid-column:1/-1;grid-row:1;z-index:5;display:flex;align-items:center;justify-content:space-between;gap:24px;min-height:88px;background:linear-gradient(135deg,#0f3b8f 0%,#1d4ed8 54%,#38bdf8 100%);color:#fff;padding:18px 28px;box-shadow:0 16px 36px rgba(29,78,216,.22)}
.topbar h1{margin:4px 0 0;font-size:22px;font-weight:500}.topbar .eyebrow{color:#dbeafe}.topbar-title,.topbar-actions,.history-controls{display:flex;align-items:center;gap:12px}.topbar-title{gap:16px}
.icon-button{display:inline-grid;width:44px;height:44px;place-items:center;gap:4px;border:1px solid rgba(255,255,255,.32);border-radius:8px;background:rgba(255,255,255,.12);padding:10px;color:#fff}.icon-button span{display:block;width:20px;height:2px;border-radius:999px;background:#fff}.icon-button.compact{width:38px;height:38px;padding:8px}.icon-button svg{color:#fff}
.user-chip{display:grid;grid-template-columns:38px minmax(0,1fr);align-items:center;gap:10px;min-width:170px;border:1px solid rgba(255,255,255,.28);border-radius:8px;background:rgba(255,255,255,.12);padding:8px 12px 8px 9px;color:#fff}.user-chip-photo{display:grid;width:34px;height:34px;place-items:center;border-radius:8px;background:rgba(255,255,255,.18);overflow:hidden}.user-chip-photo img{width:100%;height:100%;object-fit:cover}.user-chip-text{display:grid;min-width:0}.user-chip-text small{color:#dbeafe;text-transform:capitalize}
.sidebar{position:sticky;top:88px;grid-column:1;grid-row:2;width:280px;max-width:280px;height:calc(var(--app-vh,100vh) - 88px);display:grid;grid-template-rows:minmax(0,1fr) auto;gap:16px;padding:28px;background:linear-gradient(180deg,#1746ad 0%,#1f55d6 55%,#38a8ed 100%);color:#eef5ff;overflow:hidden;z-index:2}.sidebar.is-closed{display:none}
.nav-list{display:grid;gap:22px;min-height:0;overflow-y:auto;padding-right:2px}.nav-group{display:grid;gap:6px}.nav-group-label{margin:0 0 2px;color:#fff;font-size:11px;letter-spacing:.02em;text-transform:uppercase}.sidebar .nav-item,.sidebar .nav-item:link,.sidebar .nav-item:visited,.sidebar .nav-item:hover,.sidebar .nav-item:focus,.sidebar .nav-item:active,.sidebar-logout{display:grid;grid-template-columns:24px minmax(0,1fr);align-items:center;gap:12px;min-height:44px;border-radius:8px;color:#fff!important;padding:0 14px;font-weight:600;opacity:1;text-decoration:none}.sidebar .nav-item span,.sidebar-logout span{color:#fff!important;opacity:1}.sidebar .nav-item svg,.sidebar-logout svg{color:#fff!important;opacity:1;stroke-width:2.2}.sidebar .nav-item:hover,.sidebar .nav-item[aria-current=page]{background:rgba(255,255,255,.18);box-shadow:inset 0 0 0 1px rgba(255,255,255,.24);color:#fff!important}.sidebar-logout{width:100%;border:1px solid rgba(255,255,255,.28);background:rgba(255,255,255,.14);color:#fff!important;text-align:left}
.admin-main{grid-column:2;grid-row:2;min-width:0;min-height:0;overflow:visible;background:#f5f7fb;position:relative;z-index:1}.content-area{min-height:calc(var(--app-vh,100vh) - 88px);padding:34px 28px 28px;background:#f5f7fb;overflow:visible}.page-stack{display:grid;gap:22px}.page-header{display:flex;align-items:flex-end;justify-content:space-between;gap:16px}.page-header h2{margin:0;font-size:30px;line-height:1.15;font-weight:500}.page-header p{max-width:760px;margin:8px 0 0;color:#66736f}.eyebrow{margin:0;color:#1d4ed8;font-size:12px;font-weight:600;letter-spacing:0;text-transform:uppercase}
.dashboard-header-band,.panel,.stat-card{border:1px solid #dce5e2;border-radius:8px;background:#fff;box-shadow:0 18px 40px rgba(22,33,31,.08)}.dashboard-header-band{padding:28px}.dashboard-section{display:grid;gap:14px}.section-title{display:grid;gap:4px}.section-title h3{margin:0;font-size:20px;font-weight:500}.stat-grid{display:grid;grid-template-columns:repeat(6,minmax(150px,1fr));gap:14px}.stat-grid.compact{grid-template-columns:repeat(4,minmax(160px,1fr))}.dashboard-summary-grid{grid-template-columns:repeat(6,minmax(140px,1fr))}.stat-card{display:grid;gap:8px;min-height:126px;padding:18px}.stat-card-top{display:flex;align-items:center;gap:9px;color:#0f3b8f}.stat-card span,.stat-card small{color:#66736f}.stat-card strong{font-size:28px;font-weight:500}.tone-warning,.tone-danger{border-color:rgba(29,78,216,.22);background:rgba(29,78,216,.08)}.tone-success{border-color:rgba(29,78,216,.28);background:rgba(29,78,216,.12)}
.dashboard-grid,.detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.panel{padding:20px}.panel h3{margin:0 0 16px;font-size:18px;font-weight:500}.panel-header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}.operations-strip{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:16px}.operations-strip div{display:grid;gap:5px;border:1px solid rgba(29,78,216,.18);border-radius:8px;background:rgba(29,78,216,.06);padding:14px}.operations-strip strong{font-size:24px;font-weight:500}.operations-strip span{color:#66736f;font-weight:500}.metric-list{display:grid;gap:10px}.metric-row{display:grid;grid-template-columns:32px minmax(0,1fr) auto;align-items:center;gap:10px;border:1px solid #dce5e2;border-radius:8px;background:#f8fafc;padding:13px}.metric-row span{color:#66736f;font-weight:500}
.table-wrap{overflow-x:auto;border:1px solid #dce5e2;border-radius:8px;background:#fff}.data-table{width:100%;min-width:760px;border-collapse:collapse}.data-table th,.data-table td{border-bottom:1px solid #dce5e2;padding:13px 14px;text-align:left;vertical-align:middle}.data-table td:has(.status-badge),.data-table th:has(.status-badge){text-align:center}.data-table th{background:#f8fafc;color:#47514f;font-size:12px;font-weight:600;text-transform:uppercase}.status-badge{display:inline-flex;min-width:84px;min-height:28px;align-items:center;justify-content:center;border-radius:999px;padding:0 10px;background:rgba(29,78,216,.12);color:#1d4ed8;font-size:12px;font-weight:500;text-transform:capitalize;white-space:nowrap}.button,.table-actions button{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:38px;border:1px solid transparent;border-radius:8px;padding:0 14px;font-weight:500}.button.primary{background:linear-gradient(135deg,#0f3b8f 0%,#1d4ed8 54%,#38bdf8 100%);color:#fff}.button.secondary{border-color:#dce5e2;background:#fff;color:#16211f}
.finance-style-page{display:grid;gap:18px}.finance-style-shell{display:grid;width:100%;max-width:780px;gap:18px;justify-self:center}.finance-style-header{display:grid;gap:5px;padding-top:2px}.finance-style-header h2{margin:0;color:#0f172a;font-size:24px;line-height:1.25;font-weight:500}.finance-style-activity-line{display:flex;align-items:center;gap:7px}.finance-style-dot{width:8px;height:8px;border-radius:999px;background:#16845b}.finance-style-eyebrow{margin:0;color:#64748b;font-size:12px;font-weight:500}.finance-style-profile-panel,.finance-style-list{border:1px solid #d8e2f0;border-radius:12px;background:#fff;overflow:hidden}.finance-style-profile-panel{display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:16px}.finance-style-row{display:flex;min-height:58px;align-items:center;gap:12px;width:100%;border:0;border-bottom:1px solid #d8e2f0;background:#fff;color:#0f172a;padding:0 14px;text-align:left}.finance-style-row label{flex:1;color:#0f172a;font-size:15px;font-weight:500}.finance-style-icon{display:grid;width:36px;height:36px;flex:0 0 auto;place-items:center;border-radius:10px;background:#eaf2ff;color:#0757c8}
@media (max-width:1180px){.stat-grid,.dashboard-summary-grid{grid-template-columns:repeat(3,minmax(160px,1fr))}.operations-strip{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:900px){.admin-shell{grid-template-columns:1fr;grid-template-rows:auto auto minmax(0,1fr)}.sidebar{position:static;grid-column:1;grid-row:2;height:auto}.admin-main{grid-column:1;grid-row:3}.topbar{grid-column:1;grid-row:1}.nav-list{grid-template-columns:repeat(2,minmax(0,1fr));overflow:visible}.topbar,.page-header{align-items:flex-start;flex-direction:column}.dashboard-grid,.detail-grid{grid-template-columns:1fr}.dashboard-summary-grid,.operations-strip{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:640px){.content-area,.topbar,.sidebar{padding:18px}.stat-grid,.dashboard-summary-grid,.operations-strip,.nav-list{grid-template-columns:1fr}.page-header h2{font-size:24px}.topbar-actions{width:100%;align-items:stretch;flex-direction:column}.history-controls{align-self:flex-start}}
`;

