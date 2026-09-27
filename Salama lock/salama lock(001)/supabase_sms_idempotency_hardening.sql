-- Durable SMS event idempotency and 24-hour content cooldown support.
-- Apply after supabase_sms_dedup_fix.sql.

create extension if not exists pgcrypto;

alter table public.sms_send_locks add column if not exists id uuid default gen_random_uuid();
alter table public.sms_send_locks add column if not exists customer_id text;
alter table public.sms_send_locks add column if not exists phone_number text;
alter table public.sms_send_locks add column if not exists event_type text;
alter table public.sms_send_locks add column if not exists event_id text;
alter table public.sms_send_locks add column if not exists cooldown_until timestamptz;

update public.sms_send_locks
set id = coalesce(id, gen_random_uuid()),
    phone_number = coalesce(nullif(phone_number, ''), recipient_phone),
    event_type = coalesce(nullif(event_type, ''), purpose),
    -- Existing lock keys are already unique. Preserve that uniqueness while
    -- rolling the richer event columns onto historical rows.
    event_id = coalesce(nullif(event_id, ''), dedupe_key),
    cooldown_until = coalesce(cooldown_until, expires_at, created_at + interval '24 hours')
where id is null
   or nullif(phone_number, '') is null
   or nullif(event_type, '') is null
   or nullif(event_id, '') is null
   or cooldown_until is null;

alter table public.sms_send_locks alter column id set default gen_random_uuid();
alter table public.sms_send_locks alter column id set not null;
alter table public.sms_send_locks alter column phone_number set default '';
alter table public.sms_send_locks alter column phone_number set not null;
alter table public.sms_send_locks alter column event_type set default 'general';
alter table public.sms_send_locks alter column event_type set not null;
alter table public.sms_send_locks alter column event_id set default '';
alter table public.sms_send_locks alter column event_id set not null;
alter table public.sms_send_locks alter column cooldown_until set not null;

create or replace function public.normalize_sms_send_event()
returns trigger
language plpgsql
as $$
begin
  new.id := coalesce(new.id, gen_random_uuid());
  new.phone_number := coalesce(nullif(new.phone_number, ''), new.recipient_phone, '');
  new.event_type := coalesce(nullif(new.event_type, ''), new.purpose, 'general');
  new.event_id := coalesce(nullif(new.event_id, ''), nullif(new.request_id, ''), new.dedupe_key, '');
  new.cooldown_until := coalesce(new.cooldown_until, new.expires_at, now() + interval '24 hours');
  return new;
end;
$$;

drop trigger if exists sms_send_locks_normalize_event on public.sms_send_locks;
create trigger sms_send_locks_normalize_event
before insert or update on public.sms_send_locks
for each row execute function public.normalize_sms_send_event();

create unique index if not exists idx_sms_send_locks_id_unique
  on public.sms_send_locks (id);
drop index if exists public.idx_sms_send_locks_event_unique;
create unique index if not exists idx_sms_send_locks_event_unique
  on public.sms_send_locks (event_type, event_id)
  where event_id <> '';
create index if not exists idx_sms_send_locks_content_cooldown
  on public.sms_send_locks (phone_number, message_hash, created_at desc);
create index if not exists idx_sms_send_locks_customer_created
  on public.sms_send_locks (customer_id, created_at desc)
  where customer_id is not null;

-- Provider callbacks may race across more than one public callback URL.
-- These constraints make the payment write itself idempotent.
create unique index if not exists idx_payments_provider_transaction_unique
  on public.payments (provider_transaction_id)
  where provider_transaction_id is not null and provider_transaction_id <> '';
create unique index if not exists idx_payments_provider_reference_unique
  on public.payments (provider_reference)
  where provider_reference is not null and provider_reference <> '';

alter table public.sms_send_locks enable row level security;
revoke all on table public.sms_send_locks from anon, authenticated;
