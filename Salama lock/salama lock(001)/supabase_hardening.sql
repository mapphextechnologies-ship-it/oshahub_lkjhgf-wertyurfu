-- SALAMA LOCK Paygo shared CRM hardening
-- Run this after older schema experiments if anon/authenticated policies were added.

alter table public.customers enable row level security;
alter table public.payments enable row level security;
alter table public.commissions enable row level security;
alter table public.agent_payout_requests enable row level security;
alter table public.reconciliation enable row level security;
alter table public.agent_notifications enable row level security;
alter table public.finance_notifications enable row level security;

drop policy if exists "finance read customers" on public.customers;
drop policy if exists "finance read payments" on public.payments;
drop policy if exists "finance insert payments" on public.payments;
drop policy if exists "finance read commissions" on public.commissions;
drop policy if exists "finance read agent payout requests" on public.agent_payout_requests;
drop policy if exists "finance write agent payout requests" on public.agent_payout_requests;
drop policy if exists "finance read reconciliation" on public.reconciliation;
drop policy if exists "public read customers" on public.customers;
drop policy if exists "public read payments" on public.payments;
drop policy if exists "finance read notifications" on public.finance_notifications;

revoke all on table public.customers from anon, authenticated;
revoke all on table public.payments from anon, authenticated;
revoke all on table public.commissions from anon, authenticated;
revoke all on table public.agent_payout_requests from anon, authenticated;
revoke all on table public.reconciliation from anon, authenticated;
revoke all on table public.agent_notifications from anon, authenticated;
revoke all on table public.finance_notifications from anon, authenticated;

-- Keep the service role key only in Vercel/server environments.
-- Do not expose SUPABASE_SERVICE_ROLE_KEY in VITE_* variables.
