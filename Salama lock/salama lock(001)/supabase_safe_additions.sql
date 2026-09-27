-- Safe Supabase additions for SALAMA LOCK Paygo
-- Non-destructive: indexes only. No data updates, no deletes, no schema rewrites.

create index if not exists idx_customers_national_id
  on public.customers (national_id);

create index if not exists idx_customers_next_of_kin_phone
  on public.customers (next_of_kin_phone);

create index if not exists idx_customers_next_of_kin_otp_status_expires
  on public.customers (next_of_kin_otp_status, next_of_kin_otp_expires_at desc);

create index if not exists idx_customers_next_of_kin_verified_at
  on public.customers (next_of_kin_verified_at desc);

create index if not exists idx_payment_requests_phone_created
  on public.payment_requests (phone, created_at desc);

create index if not exists idx_payments_provider_payer_phone
  on public.payments (provider_payer_phone);

create index if not exists idx_payments_provider_reference_created
  on public.payments (provider_reference, created_at desc);

