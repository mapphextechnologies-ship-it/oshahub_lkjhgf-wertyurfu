-- Password reset request field repair migration.
-- Stores the exact account identifier and linked phone used for SMS OTP reset requests.

alter table public.password_reset_requests add column if not exists requested_email text;
alter table public.password_reset_requests add column if not exists normalized_email text;
alter table public.password_reset_requests add column if not exists registered_phone text;

update public.password_reset_requests
set
  requested_email = coalesce(requested_email, email),
  normalized_email = coalesce(normalized_email, lower(email)),
  registered_phone = coalesce(registered_phone, phone)
where requested_email is null
   or normalized_email is null
   or registered_phone is null;

create index if not exists idx_password_reset_requests_normalized_email_created
  on public.password_reset_requests (lower(normalized_email), created_at desc)
  where normalized_email is not null;

create index if not exists idx_password_reset_requests_registered_phone_created
  on public.password_reset_requests (registered_phone, created_at desc)
  where registered_phone is not null;
