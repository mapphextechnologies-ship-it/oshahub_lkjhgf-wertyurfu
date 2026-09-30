# Carwash OS

Carwash OS is a separate Vite/React project for multi-tenant car-wash operations. It uses the car-wash design in the supplied system documentation: navy chrome, primary blue `#0A7CFF`, green `#00A859`, a responsive operations layout and installable PWA shell.

## Local preview

```sh
npm ci
npm run dev
```

Open `http://localhost:5173` for the public OshaHub landing homepage. The Business and Team application is at `http://localhost:5173/business.html`; the isolated Super Admin portal is at `http://localhost:5173/super-admin.html`. All three pages use the same Supabase project and shared Auth session on this origin. Valid staff invitation links open the Business and Team app directly. Business Admins can create a time-limited staff invitation and open a prefilled WhatsApp message; the sender must tap **Send** in WhatsApp. Demo workspaces are disabled unless `VITE_CARWASH_DEMO_MODE=true` is explicitly set.

## Supabase setup

1. Create a dedicated Supabase project for Carwash OS.
2. Run `database/carwash.sql` in that project's SQL editor. This creates the tenant-scoped domain schema, RLS policies, transactional RPCs, business access requests and in-app account messages. Re-run it after platform changes so new billing, order, staff and settings RPCs are installed.
   For an existing database missing the tenant settings column, run `database/migrations/20260929_tenant_settings.sql` in the SQL editor. For an existing project, run `database/migrations/20260930_subscription_reminders.sql` followed by `database/migrations/20260930_customer_billing.sql`, then `database/migrations/20260930_onboarding_fee_and_pricing.sql`. These configure 7-day trials, backfill existing trial accounts, send expiry reminders, and add customer billing requests, one-time trial extensions, verified plan payments, a one-time KES 5,000 onboarding fee on the first paid plan, and payment reports. Current monthly prices are Starter KES 3,900, Growth KES 7,900 and Enterprise KES 14,900.
3. In Supabase Auth, enable email/password sign-in and email confirmation. Configure the Site URL and redirect allow-list for local development and the OshaHub Vercel domain. Allow `/?invite=...` links with a matching domain path pattern. Configure SMTP before production so verification mail is reliably delivered.
4. For local development, copy `.env.example` to `.env.local`, then set `VITE_SUPABASE_URL` and either `VITE_SUPABASE_PUBLISHABLE_KEY` (new key format) or `VITE_SUPABASE_ANON_KEY` (legacy anon key). Restart `npm run dev` after changing environment variables.
5. In Vercel, configure the same URL and one public key variable for Preview and Production, then redeploy. Set `VITE_CARWASH_DEMO_MODE=false`. Only a public anon/publishable key belongs in the browser. Never add a service-role key to a `VITE_` variable.
6. Bootstrap the first platform admin from the Supabase SQL editor after creating that Auth user:

```sql
insert into public.carwash_memberships(user_id, tenant_id, role, full_name, status)
select id, null, 'SUPER_ADMIN', 'Platform Administrator', 'ACTIVE'
from auth.users u where email = 'admin@example.com'
  and not exists (select 1 from public.carwash_memberships m where m.user_id = u.id and m.tenant_id is null);
```

Replace the email and name. Keep this bootstrap limited to the first administrator. Super Admins can approve or re-approve business requests, bulk-clear requests, activate a plan after confirming payment, and edit their display name. Plan activation sends an in-app message. Expired subscriptions deny writes while preserving account sign-in and create an overdue notice for tenant members on their next sign-in. Business Admins invite Receptionist and Washer accounts; the invited person verifies their email and accepts a single-use, 72-hour invitation. Applicants receive pending/activation/rejection messages in the app. Supabase Auth handles email verification. WhatsApp opens with a prefilled message, but the sender still presses **Send**. The app does not claim to send activation email or SMS; configure mail delivery separately if required.

## Current integration boundary

The signed-in business workspace reads and writes tenant-scoped customers, vehicles, services, wash orders, payments, staff memberships, commissions, loyalty balances, audit events and business settings through Supabase. Wash status changes, assignment, payment recording and other sensitive actions use role-checked SQL RPCs. The workspace remembers the last section visited in the current browser session. Apply the latest `database/carwash.sql` before using these operations in Supabase. M-Pesa collection and outbound email/SMS are not integrated; payments can be recorded with a method and reference, while invitation links are shared manually.

The Vercel configuration builds the static OshaHub app from this project and serves only the `carwash-public/` assets, including the OshaHub logo, favicon, manifest, service worker and phone install icons. Authenticated database operations require a network connection.

## Main folders

- `src/platform-admin/` — standalone platform Super Admin sign-in and console.
- `src/carwash/` — Business and Team interface and demo operations model.
- `database/carwash.sql` — Carwash OS-only PostgreSQL/Supabase schema.
- `native-apps/washer/` — separate Expo washer app prototype.
- `carwash-public/` — OshaHub logos, PWA manifest, service worker and install icons.
- `vercel.json` — Vercel static build/deployment settings.

## Browser storage, abuse limits and scale

The demo workspace is memory-only and is discarded on reload. Supabase Auth sessions are persisted by the Supabase client so users stay signed in as they move between OshaHub pages. On startup the app removes only legacy `carwash-os-*` browser keys. It leaves other applications' browser storage untouched. Production business data must come from Supabase.

The SQL applies per-user hourly limits to business requests (5), platform reviews (60), staff invitations (10), and invitation acceptance (10). The limiter is atomic in PostgreSQL and its counter table has RLS enabled with no client grants. Supabase Auth also enforces IP-based endpoint limits. Before public launch, enable Auth CAPTCHA/bot protection, review Authentication > Rate Limits and email-provider quotas, configure alerting, and deploy this SQL to the actual project. Those provider controls cannot be set from the browser bundle.

Vercel distributes deployed static assets through its global CDN automatically. Supabase manages its own database/API capacity; this repo does not configure database compute size, connection pooling, provider firewall/WAF rules, or a private backend. Those require the production Vercel and Supabase projects. The configured public Supabase URL and anon key are expected client configuration, not secrets; service-role or payment credentials must never be shipped to the browser.
