# Carwash OS

Carwash OS is a separate Vite/React project for multi-tenant car-wash operations. It uses the car-wash design in the supplied system documentation: navy chrome, primary blue `#0A7CFF`, green `#00A859`, a responsive operations layout and installable PWA shell.

## Local preview

```sh
npm ci
npm run dev
```

Open `http://localhost:5173`. Visitors see the public landing page first; the team sign-in and business registration are reached from its actions. Valid staff invitation links go directly to invitation registration. The app has a role-aware secure sign-in for Business Admin, Receptionist, Washer and SaaS Super Admin accounts. A new business owner can request access; after approval, a Business Admin can create a time-limited staff invitation and open a prefilled WhatsApp message for the selected portal. The sender must tap **Send** in WhatsApp. Demo workspaces are disabled unless `VITE_CARWASH_DEMO_MODE=true` is explicitly set.

## Supabase setup

1. Create a **new Supabase project for Carwash OS**. Do not reuse the Salama Lock project.
2. Run `database/carwash.sql` in that project's SQL editor. This creates the tenant-scoped domain schema, RLS policies, transactional RPCs, business access requests and in-app account messages.
3. In Supabase Auth, enable email/password sign-in and email confirmation. Configure the Site URL and redirect allow-list for local development and the OshaHub Vercel domain. Allow `/?invite=...` links with a matching domain path pattern. Configure SMTP before production so verification mail is reliably delivered.
4. In Vercel, create a separate project rooted at this folder. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for Preview and Production. Set `VITE_CARWASH_DEMO_MODE=false`. Only the public anon/publishable key belongs in the browser. Never add a service-role key to a `VITE_` variable.
5. Bootstrap the first platform admin from the Supabase SQL editor after creating that Auth user:

```sql
insert into public.carwash_memberships(user_id, tenant_id, role, full_name, status)
select id, null, 'SUPER_ADMIN', 'Platform Administrator', 'ACTIVE'
from auth.users u where email = 'admin@example.com'
  and not exists (select 1 from public.carwash_memberships m where m.user_id = u.id and m.tenant_id is null);
```

Replace the email and name. Keep this bootstrap limited to the first administrator. Super Admins approve business requests in the Platform portal; approval creates the tenant and Business Admin membership atomically. Business Admins invite Receptionist and Washer accounts; the invited person verifies their email and accepts a single-use, 72-hour invitation. Applicants receive pending/activation/rejection messages in the app. Supabase Auth handles email verification. WhatsApp opens with a prefilled message, but the sender still presses **Send**. The app does not claim to send activation email or SMS; configure mail delivery separately if required.

## Current integration boundary

Supabase authentication, business registration requests, platform-admin approval, activation messages and the SQL access rules are connected in the code. The operational React dashboard is still a local demo data model. It is deliberately not presented as a live Supabase workspace after a real Supabase login; live customers, orders, payments, staff, reports, M-Pesa and washer-mobile synchronization still need repository/API integration before taking real business data or money. No Supabase or Vercel credentials were supplied, so a live database, email delivery and deployment cannot be verified from this checkout.

The Vercel configuration builds only the static OshaHub app and excludes copied Salama Lock API routes and phone-monitoring jobs. It serves the allow-listed `carwash-public/` assets, including the OshaHub logo, favicon, manifest, service worker and phone install icons. Authenticated database operations require a network connection.

## Main folders

- `src/carwash/` — Carwash OS interface and demo operations model.
- `database/carwash.sql` — Carwash OS-only PostgreSQL/Supabase schema.
- `native-apps/washer/` — separate Expo washer app prototype.
- `carwash-public/` — OshaHub logos, PWA manifest, service worker and install icons.
- `vercel.json` — Vercel static build/deployment settings.

## Browser storage, abuse limits and scale

The demo workspace is memory-only and is discarded on reload. Supabase sessions are also memory-only; users sign in again after a full reload. On startup the app removes only legacy `carwash-os-*` browser keys and the configured project's old Supabase auth token. It leaves other applications' browser storage untouched. This keeps business data out of browser local storage; production business data must come from Supabase.

The SQL applies per-user hourly limits to business requests (5), platform reviews (60), staff invitations (10), and invitation acceptance (10). The limiter is atomic in PostgreSQL and its counter table has RLS enabled with no client grants. Supabase Auth also enforces IP-based endpoint limits. Before public launch, enable Auth CAPTCHA/bot protection, review Authentication > Rate Limits and email-provider quotas, configure alerting, and deploy this SQL to the actual project. Those provider controls cannot be set from the browser bundle.

Vercel distributes deployed static assets through its global CDN automatically. Supabase manages its own database/API capacity; this repo does not configure database compute size, connection pooling, provider firewall/WAF rules, or a private backend. Those require the production Vercel and Supabase projects. The configured public Supabase URL and anon key are expected client configuration, not secrets; service-role or payment credentials must never be shipped to the browser.
