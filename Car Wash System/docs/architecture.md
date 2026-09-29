# Carwash OS architecture

OshaHub Carwash OS is a tenant-scoped car-wash SaaS. The web app is a single PWA entry point with role-based areas for Platform Admin, Business Admin, Receptionist and Washer. The separately packaged washer mobile app is under `native-apps/washer`.

## Layers

- `src/carwash/` — responsive landing/sign-in flow and car-wash operations interface.
- `src/services/supabaseBrowser.js` — public Supabase Auth/data client; only URL and anon key belong in browser configuration.
- `database/carwash.sql` — tenant data, RLS, order/payment workflows, account requests, approval messages and administrative RPCs.
- `public/` — OshaHub branding, PWA manifest, service worker and install icons.
- Vercel — static SPA hosting for this application.

## Trust boundaries

Tenant roles come from active database memberships, never from a client role picker. New business registration creates a pending access request. Platform Admin approval creates the tenant and its Business Admin membership atomically. Staff accounts require an invitation and verified sign-in. Tables are tenant-scoped with RLS; state transitions, payment records and approvals use server-side database functions.

The current screens still have demo operational records. Do not process live washes or money until the operations UI is wired to the tenant tables and real Supabase/Vercel configuration has been smoke-tested.
