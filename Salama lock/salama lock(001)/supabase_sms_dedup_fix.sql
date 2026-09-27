-- SMS deduplication lock table.
-- Run this on the deployed Supabase database to prevent duplicate SMS sends
-- across repeated callbacks, retries, and concurrent workers.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.sms_send_locks (
  dedupe_key text primary key,
  id uuid not null default gen_random_uuid(),
  customer_id text,
  recipient_phone text not null,
  phone_number text not null default '',
  purpose text not null default 'general',
  event_type text not null default 'general',
  event_id text not null default '',
  message_hash text not null,
  request_id text,
  source_portal text not null default 'api',
  sender_mode text,
  sender_id text,
  status text not null default 'processing',
  locked_at timestamptz not null default now(),
  expires_at timestamptz not null,
  cooldown_until timestamptz,
  sent_at timestamptz,
  provider_message_id text,
  provider_status text,
  provider_code integer,
  provider_response jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sms_send_locks_status_check
    check (status in ('processing', 'sent', 'failed'))
);

alter table public.sms_send_locks add column if not exists dedupe_key text;
alter table public.sms_send_locks add column if not exists id uuid default gen_random_uuid();
alter table public.sms_send_locks add column if not exists customer_id text;
alter table public.sms_send_locks add column if not exists recipient_phone text not null default '';
alter table public.sms_send_locks add column if not exists phone_number text not null default '';
alter table public.sms_send_locks add column if not exists purpose text not null default 'general';
alter table public.sms_send_locks add column if not exists event_type text not null default 'general';
alter table public.sms_send_locks add column if not exists event_id text not null default '';
alter table public.sms_send_locks add column if not exists message_hash text not null default '';
alter table public.sms_send_locks add column if not exists request_id text;
alter table public.sms_send_locks add column if not exists source_portal text not null default 'api';
alter table public.sms_send_locks add column if not exists sender_mode text;
alter table public.sms_send_locks add column if not exists sender_id text;
alter table public.sms_send_locks add column if not exists status text not null default 'processing';
alter table public.sms_send_locks add column if not exists locked_at timestamptz not null default now();
alter table public.sms_send_locks add column if not exists expires_at timestamptz not null default now();
alter table public.sms_send_locks add column if not exists cooldown_until timestamptz;
alter table public.sms_send_locks add column if not exists sent_at timestamptz;
alter table public.sms_send_locks add column if not exists provider_message_id text;
alter table public.sms_send_locks add column if not exists provider_status text;
alter table public.sms_send_locks add column if not exists provider_code integer;
alter table public.sms_send_locks add column if not exists provider_response jsonb not null default '{}'::jsonb;
alter table public.sms_send_locks add column if not exists error_message text;
alter table public.sms_send_locks add column if not exists created_at timestamptz not null default now();
alter table public.sms_send_locks add column if not exists updated_at timestamptz not null default now();
alter table public.sms_send_locks drop constraint if exists sms_send_locks_status_check;
alter table public.sms_send_locks add constraint sms_send_locks_status_check
  check (status in ('processing', 'sent', 'failed'));

drop trigger if exists sms_send_locks_set_updated_at on public.sms_send_locks;
create trigger sms_send_locks_set_updated_at before update on public.sms_send_locks
for each row execute function public.set_updated_at();

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

create index if not exists idx_sms_send_locks_phone_purpose_expires
  on public.sms_send_locks (recipient_phone, purpose, expires_at desc);
create index if not exists idx_sms_send_locks_status_expires
  on public.sms_send_locks (status, expires_at desc);
create index if not exists idx_sms_send_locks_request_id
  on public.sms_send_locks (request_id);
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

alter table public.sms_send_locks enable row level security;

revoke all on table public.sms_send_locks from anon, authenticated;
