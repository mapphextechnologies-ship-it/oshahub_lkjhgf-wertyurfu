# SALAMA LOCK Paygo Finance

Finance operations portal for the SALAMA LOCK Paygo distributed CRM system.

The frontend is a Vite app. In production it reads and writes PAYGO customers, payments, commissions, and reconciliation data through Vercel API routes backed by a shared Supabase database. Admin, agent, customer, and finance portals should use the same Supabase project so every portal works from one centralized CRM dataset.

Finance views can be scoped to `all`, `bike`, or `phone`. The same menus stay visible, but the dashboard, payments, commissions, reports, and reconciliation pages now read scoped data so bikes and phones do not blend into one cash view.

## Local Setup

```bash
npm install
npm run dev
```

Open `http://localhost:5173/`.

<!-- Redeploy trigger: small edit to force Vercel to build latest commit with fixes -->

To test database-backed mode locally, copy `.env.production.template` to `.env.local` and set:

```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_AUTH_REQUIRED=true
VITE_API_BASE_URL=
PUBLIC_APP_URL=https://SALAMA LOCK-beta.vercel.app
ADMIN_MAX_ACCOUNTS=10
CRON_SECRET=generate-a-long-random-secret
OTP_PEPPER=generate-a-long-random-secret
PAYMENT_CALLBACK_SECRET=generate-a-long-random-secret
PAYOUT_CALLBACK_SECRET=generate-a-long-random-secret
PAYMENT_PROVIDER=daraja
COMMISSION_PAYOUT_PROVIDER=daraja
AFRICASTALKING_USERNAME=
AFRICASTALKING_API_KEY=
AFRICASTALKING_SENDER_ID=
AFRICASTALKING_NEXT_OF_KIN_SENDER_ID=
AFRICASTALKING_REPLY_SENDER_ID=
AFRICASTALKING_SANDBOX=false
AFRICASTALKING_INBOUND_SECRET=
AFRICASTALKING_DELIVERY_REPORT_SECRET=
DARAJA_ENV=sandbox
DARAJA_CONSUMER_KEY=
DARAJA_CONSUMER_SECRET=
DARAJA_BUSINESS_SHORT_CODE=
DARAJA_PASSKEY=
MPESA_CONSUMER_KEY=
MPESA_CONSUMER_SECRET=
MPESA_SHORTCODE=
MPESA_PASSKEY=
DARAJA_TRANSACTION_TYPE=CustomerPayBillOnline
DARAJA_CALLBACK_URL=https://your-vercel-domain.vercel.app/api/mpesa/callback?secret=YOUR_PAYMENT_CALLBACK_SECRET
DARAJA_C2B_SHORT_CODE=
DARAJA_C2B_VALIDATION_URL=https://your-vercel-domain.vercel.app/api/mpesa/validation?secret=YOUR_PAYMENT_CALLBACK_SECRET
DARAJA_C2B_CONFIRMATION_URL=https://your-vercel-domain.vercel.app/api/mpesa/confirmation?secret=YOUR_PAYMENT_CALLBACK_SECRET
DARAJA_C2B_RESPONSE_TYPE=Completed
DARAJA_C2B_COMMAND_ID=CustomerPayBillOnline
DARAJA_C2B_SHORT_CODE=4050421
DARAJA_B2C_SHORT_CODE=
DARAJA_B2C_INITIATOR_NAME=
DARAJA_B2C_SECURITY_CREDENTIAL=
DARAJA_B2C_RESULT_URL=https://your-vercel-domain.vercel.app/api/commissions/payout-callback?secret=YOUR_PAYOUT_CALLBACK_SECRET
DARAJA_B2C_TIMEOUT_URL=https://your-vercel-domain.vercel.app/api/commissions/payout-callback?secret=YOUR_PAYOUT_CALLBACK_SECRET
DARAJA_B2C_COMMAND_ID=BusinessPayment
PHONE_LOCKER_APP_ID=
PHONE_LOCKER_APP_KEY=
PHONE_LOCKER_BASE_URL=
```

Set `AFRICASTALKING_USERNAME` and `AFRICASTALKING_API_KEY` from your Africa's Talking app. Set `PUBLIC_APP_URL=https://www.SALAMA LOCKpay.com` so SMS links, next-of-kin acceptance links, and payment callbacks stay on the live domain. Production SMS delivery requires an approved `AFRICASTALKING_SENDER_ID` or shortcode; the default Africa's Talking sender is mainly for test SMSes and limited Airtel routes. If you have a reply-capable long code or shortcode for next-of-kin messages, set `AFRICASTALKING_NEXT_OF_KIN_SENDER_ID` or `AFRICASTALKING_REPLY_SENDER_ID`; otherwise the SMS includes a web acceptance link. SMS OTPs, approvals, next-of-kin acceptance links, reminders, payment notices, and commission notices use Africa's Talking. Configure the SMS delivery reports callback URL in Africa's Talking to `https://your-vercel-domain.vercel.app/api/sms/delivery-report?secret=YOUR_DELIVERY_REPORT_SECRET` so the admin dashboard can tell the difference between a gateway handoff and real handset delivery. If `/api/admin/portal` logs `sms.delivery.report_table_missing`, run [`supabase_sms_delivery_reports_fix.sql`](./supabase_sms_delivery_reports_fix.sql) or rerun `supabase.sql` on the deployed Supabase project. Set `DARAJA_CONSUMER_KEY`, `DARAJA_CONSUMER_SECRET`, `DARAJA_BUSINESS_SHORT_CODE`, and `DARAJA_PASSKEY` or the matching `MPESA_*` aliases from your Safaricom Daraja app for M-PESA STK Push and Paybill collection. For C2B Paybill collection, use shortcode `4050421` and set `DARAJA_C2B_VALIDATION_URL` and `DARAJA_C2B_CONFIRMATION_URL` to your live Vercel domain.

The Paybill account number shown in the customer portal is the customer `national_id`.

The backend can run the phone locker on Honor or Trustonic. Honor remains the default, and the active provider is selected with `PHONE_LOCKER_PROVIDER=honor` or `PHONE_LOCKER_PROVIDER=trustonic`. Honor uses AK/SK signing with `X-RY-ID`, `X-RY-DATE`, and `X-RY-SIGN`. If you use `HMAC-SHA256`, the client also sends `X-RY-SIGN-ALGOS: HmacSHA256`. The backend retries once with the alternate supported algorithm if Honor returns `401 Authorization failure`, which helps when the app was provisioned with the other signing mode.

Honor setup:

```env
PHONE_LOCKER_PROVIDER=honor
HONOR_API_BASE=https://apigw.yun.hihonor.com
HONOR_BASE_URL=https://apigw.yun.hihonor.com
HONOR_APP_ID=your-app-id
HONOR_USERNAME=your-app-id
HONOR_APP_KEY=your-app-key
HONOR_PASSWORD=your-app-key
HONOR_SIGN_ALGORITHM=SHA256
HONOR_CONTACT_NUMBER=+254700000000
HONOR_SUPPORT_EMAIL=support@example.com
HONOR_TIMEOUT_MS=15000
```

Trustonic setup:

```env
PHONE_LOCKER_PROVIDER=trustonic
TRUSTONIC_API_BASE=https://api.eu-demo.cloud.trustonic.com
TRUSTONIC_BASE_URL=https://api.eu-demo.cloud.trustonic.com
TRUSTONIC_API_KEY=your-trustonic-api-key
TRUSTONIC_USERNAME=
TRUSTONIC_PASSWORD=
TRUSTONIC_CLIENT_ID=
TRUSTONIC_CLIENT_SECRET=
TRUSTONIC_API_VARIANT=journey-v2
TRUSTONIC_API_KEY_HEADER=x-api-key
TRUSTONIC_ASSIGNED_POLICY=deviceFinancing
TRUSTONIC_TIMEOUT_MS=15000
```

Trustonic device enrollment uses the prepaid journey API. The backend uploads the IMEI 1 device record, updates the expiration timestamp for lock and unlock actions, and queries device status for diagnostics. If your Trustonic tenant uses different path names, override them with `TRUSTONIC_REGISTER_PATH`, `TRUSTONIC_UPDATE_PATH`, `TRUSTONIC_STATUS_PATH`, and `TRUSTONIC_TOKEN_PATH`. Trustonic also supports bearer tokens, API keys, or username/password plus client ID/client secret credentials, so you can use whichever auth mode your tenant exposes.

If a phone was enrolled in Trustonic under a non-IMEI device UID, store that exact UID in the phone's `locker_id` field. The backend now prefers that value for Trustonic lookups before falling back to IMEI 1.

Paygo phone unlocks now trigger on a successful daily installment payment, not only when the full balance reaches zero. If the payment meets or exceeds the customer's `daily_installment`, the device sync will unlock the phone and then re-check the active phone-lock provider state.

The backend also runs `/api/system/phone-monitor` every minute to enforce unlock expiry and send phone-lock commands from server-side paygo state.

### Trustonic webhook gateway

SALAMA LOCK can receive Trustonic webhooks before relaying them to Momani. This prevents a broken Momani credential or endpoint from making Trustonic retry the same webhook continuously. Incoming events are authenticated, saved in Supabase, deduplicated, and acknowledged with HTTP `202`. A server-side worker then delivers them to Momani with bounded exponential retries. Permanent client failures such as HTTP `401` or `403` move directly to `dead_letter` and are not retried automatically.

1. Run [`supabase_trustonic_webhook_gateway.sql`](./supabase_trustonic_webhook_gateway.sql) in the deployed Supabase SQL Editor.
2. Rotate any webhook token that has appeared in logs or support messages.
3. Configure the following server-only Vercel variables:

```env
TRUSTONIC_WEBHOOK_SECRET=a-new-long-random-secret
MOMANI_TRUSTONIC_WEBHOOK_URL=https://api.staging.momani.co.ug/third-party/kt-mdm/trustonic/webhook
MOMANI_TRUSTONIC_WEBHOOK_AUTH_MODE=query
MOMANI_TRUSTONIC_WEBHOOK_TOKEN=a-new-momani-token
MOMANI_TRUSTONIC_WEBHOOK_TOKEN_PARAM=token
MOMANI_TRUSTONIC_WEBHOOK_TIMEOUT_MS=8000
MOMANI_TRUSTONIC_WEBHOOK_MAX_ATTEMPTS=8
```

4. Deploy SALAMA LOCK and test `POST https://www.SALAMA LOCKpay.com/api/trustonic/webhook?token=YOUR_TRUSTONIC_WEBHOOK_SECRET` with a staging webhook.
5. Only after the test returns HTTP `202`, change the Trustonic tenant subscription from the direct Momani URL to the SALAMA LOCK URL above.
6. Confirm the corresponding row reaches `delivered` in `public.trustonic_webhook_events`, then ask Trustonic to clear or replay its old failed queue.

The query authentication mode preserves compatibility with Momani's current `?token=` endpoint. Change `MOMANI_TRUSTONIC_WEBHOOK_AUTH_MODE` to `bearer` or `header` when Momani supports credentials outside the URL. After repairing a credential, review `dead_letter` rows before re-queuing them; SALAMA LOCK intentionally does not hammer an endpoint that has already rejected authorization.

## Supabase Setup

1. Create a Supabase project for the shared SALAMA LOCK Paygo CRM database.
2. Open the Supabase SQL Editor.
3. Run `supabase.sql` once.
4. Keep `SUPABASE_SERVICE_ROLE_KEY` only in server environments such as Vercel. Do not expose it as a `VITE_*` variable.
5. Set `ADMIN_REGISTRATION_CODE` to a private setup code before creating admin accounts. Create the first admin through the admin registration screen/API, then rotate the setup code or remove it when registration should be closed.
6. Set `ADMIN_MAX_ACCOUNTS=10` in Vercel. Admin registration locks after this number of active admin profiles exists; existing active admins can still sign in. Admin login is also locked for 15 minutes after 8 failed attempts for the same email.

The schema creates shared CRM tables:

```text
customers
payments
commissions
agent_payout_requests
reconciliation
agent_notifications
finance_notifications
```

If you previously experimented with public policies, run `supabase_hardening.sql` to lock the tables back down for server-side API access.

For an existing Supabase project, rerun `supabase.sql` after pulling updates. It uses `create index if not exists` and `create or replace function`, so it safely adds the performance indexes and dashboard summary function without deleting existing data.

### Cross-device data consistency

Finance, Admin, and Agent operational records are read from the server API backed by the same Supabase project. Browser storage is used only for login sessions, interface preferences, and unsent form drafts; it is not used as an authoritative fallback for customers, payments, inventory, commissions, reconciliation, or notifications.

Configure every deployment and custom domain with the same `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and server-only `SUPABASE_SERVICE_ROLE_KEY`. Keep `VITE_API_BASE_URL` blank on Vercel so every device uses the deployed repository's same-origin `/api` routes. If the shared backend is unavailable, operational screens intentionally show an error or empty state instead of device-specific cached/demo records.

## Vercel Deployment

Deploy the repo to Vercel with the included `vercel.json`.

Required Vercel environment variables:

```env
VITE_LOCAL_AUTH_ENABLED=false
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_AUTH_REQUIRED=true
VITE_API_BASE_URL=
ADMIN_MAX_ACCOUNTS=10
CRON_SECRET=generate-a-long-random-secret
OTP_PEPPER=generate-a-long-random-secret
PAYMENT_CALLBACK_SECRET=generate-a-long-random-secret
PAYOUT_CALLBACK_SECRET=generate-a-long-random-secret
PHONE_LOCKER_PROVIDER=honor
HONOR_API_BASE=https://apigw.yun.hihonor.com
HONOR_APP_ID=your-locker-app-id
HONOR_APP_KEY=your-locker-app-key
HONOR_SIGN_ALGORITHM=SHA256
HONOR_CONTACT_NUMBER=+254700000000
HONOR_SUPPORT_EMAIL=support@example.com
HONOR_FORBID_INCOMING_CALL=false
# Optional semicolon-separated phone numbers that remain reachable during lock.
HONOR_ALLOW_INCOMING_LIST=
HONOR_SUPPORT_USER_REFRESH=true
HONOR_ALLOW_APP=1
# Optional semicolon-separated app package names that remain allowed during lock.
HONOR_ALLOW_APP_LIST=
HONOR_TIMEOUT_MS=15000

PHONE_LOCKER_PROVIDER=trustonic
TRUSTONIC_API_BASE=https://api.eu-demo.cloud.trustonic.com
TRUSTONIC_API_KEY=your-trustonic-api-key
TRUSTONIC_API_VARIANT=journey-v2
TRUSTONIC_API_KEY_HEADER=x-api-key
TRUSTONIC_ASSIGNED_POLICY=deviceFinancing
TRUSTONIC_LOCK_POLICY=deviceFinancingLocked
TRUSTONIC_UNLOCK_POLICY=deviceFinancingUnlocked
TRUSTONIC_TIMEOUT_MS=15000
```

If Vercel shows `No more than 12 Serverless Functions can be added to a Deployment on the Hobby plan`, the project is still deploying under a Hobby project/team. Moving your app to a Pro team removes that limit for the deployment target. In Vercel:

1. Open the project.
2. Check the team or scope shown at the top of the project settings.
3. If it is still on a personal Hobby scope, move the project to your Pro team or create a Pro team and redeploy there.
4. Redeploy after the project is attached to the Pro team.

This repository currently uses many API route files under `/api`, so Hobby deployments will hit that limit unless the routes are consolidated.

Create finance users in Supabase Auth, then mark them as finance users:

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"finance"}'::jsonb
where email = 'name@SALAMA LOCKpaygo.co.ke';
```

If a separate backend is later deployed, set `BACKEND_API_URL` and the Vercel routes will proxy to that backend instead of using Supabase directly.

For Daraja STK Push callbacks, configure this callback URL:

```text
https://your-vercel-domain.vercel.app/api/mpesa/callback?secret=YOUR_PAYMENT_CALLBACK_SECRET
```

Set `PAYMENT_CALLBACK_SECRET` in Vercel and put the same value in the callback URL query string as shown above. If no callback secret is configured, callback routes reject requests.

For C2B Paybill payments made outside STK Push, register these Safaricom C2B v2 URLs for your Paybill shortcode:

```text
Validation URL: https://your-vercel-domain.vercel.app/api/paybill/validation?secret=YOUR_PAYMENT_CALLBACK_SECRET
Confirmation URL: https://your-vercel-domain.vercel.app/api/paybill/confirmation?secret=YOUR_PAYMENT_CALLBACK_SECRET
```

Normal Paybill C2B callbacks can be recorded even when the app did not create a payment request first, as long as the customer pays using a BillRefNumber that matches the customer National ID. For B2C commission payouts, set the Daraja initiator name, encrypted security credential, B2C shortcode, result URL, and timeout URL after Safaricom enables B2C on your shortcode.

After setting the Daraja C2B env vars, register the URLs from the backend:

```text
POST https://your-vercel-domain.vercel.app/api/mpesa/register-urls?secret=YOUR_PAYMENT_CALLBACK_SECRET
```

The backend calls `https://api.safaricom.co.ke/mpesa/c2b/v2/registerurl` server-side and expects `BillRefNumber` to be the customer National ID for C2B payments. The live callback URLs should use `/api/paybill/validation` and `/api/paybill/confirmation` because Safaricom rejects callback URLs containing `mpesa` in the path. That keeps the confirmation flow aligned with the customer record, payment requests, and the finance dashboard.

For sandbox C2B testing, simulate a Paybill payment:

```text
POST https://your-vercel-domain.vercel.app/api/mpesa/simulate-c2b?secret=YOUR_PAYMENT_CALLBACK_SECRET
Body: { "amount": 100, "phone": "254708374149", "accountReference": "NATIONAL_ID" }
```

## Automated Follow-Ups

Vercel cron calls `/api/system/follow-ups` at 08:00 and 17:00 Nairobi time. The job updates customer overdue status, creates customer notifications, creates agent follow-up notifications, creates finance risk alerts, and sends Africa's Talking SMS reminders. Set `CRON_SECRET` in Vercel so Vercel cron signs the request and outsiders cannot trigger reminder SMS.

## Payments

Before enabling finance payment corrections on an existing deployment, run
[`supabase_payment_corrections.sql`](./supabase_payment_corrections.sql). The edit screen then preserves the original provider transaction, creates an active corrected revision, supersedes the prior ledger version, recalculates the customer account under a database row lock, and records the actor and an automatic correction reason in `admin_audit_logs` in one transaction.

SALAMA LOCK Paygo uses Africa's Talking for SMS and Safaricom Daraja for money movement. Daraja handles customer STK Push payment prompts, C2B Paybill confirmations, and optional finance B2C commission payouts.

For M-Pesa testing, use the Daraja flow that matches the payment direction:

1. Customer to business collection uses STK Push or Paybill C2B.
2. Business to agent payout uses B2C and the commission payout callback.
3. If you type payment amounts in the app, use numbers like `20` or `KES 20`; the app now strips common currency symbols before saving.

For next-of-kin SMS acceptance, set your Africa's Talking incoming SMS callback URL to:

```text
https://your-vercel-domain.vercel.app/api/africastalking/inbound?secret=YOUR_INBOUND_SECRET
```

Use `POST`. When the next-of-kin replies `1`, `YES`, or `ACCEPT`, the webhook confirms acceptance, moves the application through automatic screening, and sends the customer activation OTP if the application is approved. The SMS link flow also remains available. If you prefer a shared header secret instead of a query string, the webhook also accepts `x-SALAMA LOCK-webhook-secret`.

Recommended backend flow:

```text
1. Customer pays through customer portal, SIM toolkit, or *334#.
2. Payment provider sends confirmation/callback to your backend.
3. Backend validates provider signature, receipt, account reference, amount, and customer.
4. Backend upserts the payment into Supabase `payments`.
5. Backend updates customer balance, overdue state, reconciliation, and commissions.
6. Backend writes finance alerts into `finance_notifications` when payment is received, missing, late, mismatched, or needs follow-up.
7. Finance portal refreshes `/api/payments`, `/api/reconciliation`, and `/api/notifications`.
```

New provider records should use generic fields such as `provider_reference`, `provider_transaction_id`, `provider_account_reference`, `provider_payer_phone`, and `provider_paid_at`. Payment product configuration, callbacks, and transaction validation must remain in the backend.

## Agent Commission Payments

The finance portal does not transfer money from the browser. When finance clicks a commission payment action:

```text
POST /api/commissions/:id/pay
POST /api/commissions/agent-payment-approvals
```

Vercel either proxies the request to `BACKEND_API_URL`, or, if no backend is connected yet, records a queued payout request in Supabase. The Supabase-only fallback sets the commission to `processing` with `payout_status = queued`; it does not mark the commission as paid and it does not call any payment provider.

Your production backend should implement:

```text
POST /commissions/:id/pay
```

Backend responsibilities:

```text
1. Validate the finance user is authorized.
2. Validate the commission exists.
3. Validate the agent details and amount.
4. Reject commissions that are already paid or already processing.
5. Send the money through the payment provider from the backend only.
6. Update Supabase with status, paid_at, payout reference, and provider response.
7. Return the updated commission to the finance portal.
```

The backend can use `agent_payout_requests` as its payout work queue, or it can complete the payout immediately and update `commissions` directly.

## Load Balancing

The portal is safe to run behind Vercel's managed load balancing because API routes are stateless. Auth state is carried by the user's Supabase token, and shared application data lives in Supabase or your external backend.

Health check endpoint:

```text
/api/health
```

Expected healthy response includes:

```json
{
  "ok": true,
  "stateless": true,
  "databaseConfigured": true
}
```

If `BACKEND_API_URL` points to your own backend, set `BACKEND_TIMEOUT_MS` to keep slow backend instances from hanging finance requests. The default is `10000`.

## Installable App

The portal includes `manifest.webmanifest`, app icons, and `sw.js`, so supported browsers can install it as a standalone app. API requests are never cached by the service worker; payments, notifications, and reconciliation stay server-driven.

## Auth Pages

```text
Login: http://localhost:5173/#/login
Register: http://localhost:5173/#/register
Forgot password: http://localhost:5173/#/forgot-password
```

Users register with their own email and password. Accounts are created in Supabase Auth through `/api/auth/register`; they are not stored in browser localStorage.

Password reset OTP sending and password changes are handled by the Vercel API routes with Supabase Auth. If `BACKEND_API_URL` is set, those routes proxy to your secure backend instead.

## Data Flow

Finance screens call same-origin `/api/*` routes. Those routes use `SUPABASE_SERVICE_ROLE_KEY` server-side to fetch the required finance data from the centralized Supabase database. Payment-provider integrations, transaction execution, callbacks, and agent payout execution belong in the secure backend, not in this portal.
