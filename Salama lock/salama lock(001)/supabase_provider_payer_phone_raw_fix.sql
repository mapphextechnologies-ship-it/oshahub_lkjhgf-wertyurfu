-- Payment callback MSISDN repair migration.
-- Stores the raw M-PESA C2B MSISDN separately from the validated SMS phone.

alter table public.payments add column if not exists provider_payer_phone_raw text;
