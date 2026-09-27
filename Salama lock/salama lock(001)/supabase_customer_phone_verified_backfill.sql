-- Customer phone verification backfill.
-- Existing customers that completed activation before customer_phone_verified_at
-- existed should be eligible for SMS password-reset OTPs on their registered phone.

alter table public.customers add column if not exists customer_phone_verified_at timestamptz;

update public.customers
set customer_phone_verified_at = coalesce(
  customer_activation_otp_verified_at,
  customer_activation_otp_sent_at,
  updated_at,
  created_at,
  now()
)
where customer_phone_verified_at is null
  and nullif(btrim(customer_phone), '') is not null
  and lower(coalesce(customer_activation_otp_status, '')) = 'verified';
