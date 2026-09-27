-- Payments schema repair migration.
-- Run this on the deployed Supabase database if payment callbacks fail with
-- missing-column errors for `payments`.

alter table public.payments
  add column if not exists payment_status text not null default 'paid',
  add column if not exists daily_target numeric(14,2) not null default 0,
  add column if not exists daily_installment numeric(14,2) not null default 0,
  add column if not exists grace_period_days integer not null default 3;

update public.payments
set
  daily_target = coalesce(daily_target, 0),
  daily_installment = coalesce(daily_installment, 0)
where daily_target is null
   or daily_installment is null;
