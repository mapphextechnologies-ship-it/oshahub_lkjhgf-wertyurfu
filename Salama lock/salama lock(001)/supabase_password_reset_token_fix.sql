-- Password reset token repair migration.
-- Run this on deployed databases to support the SMS OTP verify -> reset token flow.

begin;

alter table public.password_reset_requests add column if not exists reset_token_hash text;
alter table public.password_reset_requests add column if not exists reset_token_expires_at timestamptz;
alter table public.password_reset_requests add column if not exists reset_token_used_at timestamptz;
alter table public.password_reset_requests add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.password_reset_requests add column if not exists used_at timestamptz;
alter table public.password_reset_requests add column if not exists attempts integer not null default 0;

commit;
