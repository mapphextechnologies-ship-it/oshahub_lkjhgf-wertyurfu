-- SMS delivery reports repair migration.
-- Run this on the deployed Supabase database if `/api/admin/portal`
-- logs `sms.delivery.report_table_missing` or returns a 404 for
-- `sms_delivery_reports` or `sms_logs`.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.sms_logs (
  id uuid primary key default gen_random_uuid(),
  request_id text,
  message_id text not null unique,
  phone text not null,
  purpose text not null default 'general',
  sender_mode text,
  sender_id text,
  provider text not null default 'africastalking',
  provider_status text,
  provider_code integer,
  delivery_status text not null default 'provider_accepted',
  failure_reason text,
  network_code text,
  raw_provider_response jsonb not null default '{}'::jsonb,
  raw_delivery_payload jsonb not null default '{}'::jsonb,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sms_logs add column if not exists request_id text;
alter table public.sms_logs add column if not exists message_id text;
alter table public.sms_logs add column if not exists phone text;
alter table public.sms_logs add column if not exists purpose text not null default 'general';
alter table public.sms_logs add column if not exists sender_mode text;
alter table public.sms_logs add column if not exists sender_id text;
alter table public.sms_logs add column if not exists provider text not null default 'africastalking';
alter table public.sms_logs add column if not exists provider_status text;
alter table public.sms_logs add column if not exists provider_code integer;
alter table public.sms_logs add column if not exists delivery_status text not null default 'provider_accepted';
alter table public.sms_logs add column if not exists failure_reason text;
alter table public.sms_logs add column if not exists network_code text;
alter table public.sms_logs add column if not exists raw_provider_response jsonb not null default '{}'::jsonb;
alter table public.sms_logs add column if not exists raw_delivery_payload jsonb not null default '{}'::jsonb;
alter table public.sms_logs add column if not exists delivered_at timestamptz;
alter table public.sms_logs add column if not exists created_at timestamptz not null default now();
alter table public.sms_logs add column if not exists updated_at timestamptz not null default now();
alter table public.sms_logs drop constraint if exists sms_logs_delivery_status_check;
alter table public.sms_logs add constraint sms_logs_delivery_status_check
  check (delivery_status in ('provider_accepted', 'sent', 'delivered', 'failed', 'rejected', 'expired', 'blacklisted', 'invalid_phone_number', 'unknown'));

create table if not exists public.sms_delivery_reports (
  provider_message_id text primary key,
  provider text not null default 'africastalking',
  recipient_phone text not null,
  source_portal text not null default 'api',
  request_id text,
  sender_mode text,
  sender_id text,
  purpose text not null default 'general',
  provider_ack_status text,
  provider_ack_status_code integer,
  provider_status text,
  provider_status_code integer,
  network_code text,
  delivery_status text not null default 'submitted' check (delivery_status in ('submitted', 'queued', 'delivered', 'failed', 'rejected', 'unknown')),
  delivery_status_code integer,
  failure_reason text,
  delivered_at timestamptz,
  last_reported_at timestamptz not null default now(),
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sms_delivery_reports add column if not exists provider text not null default 'africastalking';
alter table public.sms_delivery_reports add column if not exists recipient_phone text not null default '';
alter table public.sms_delivery_reports add column if not exists source_portal text not null default 'api';
alter table public.sms_delivery_reports add column if not exists request_id text;
alter table public.sms_delivery_reports add column if not exists sender_mode text;
alter table public.sms_delivery_reports add column if not exists sender_id text;
alter table public.sms_delivery_reports add column if not exists purpose text not null default 'general';
alter table public.sms_delivery_reports add column if not exists provider_ack_status text;
alter table public.sms_delivery_reports add column if not exists provider_ack_status_code integer;
alter table public.sms_delivery_reports add column if not exists provider_status text;
alter table public.sms_delivery_reports add column if not exists provider_status_code integer;
alter table public.sms_delivery_reports add column if not exists network_code text;
alter table public.sms_delivery_reports add column if not exists delivery_status text not null default 'submitted';
alter table public.sms_delivery_reports add column if not exists delivery_status_code integer;
alter table public.sms_delivery_reports add column if not exists failure_reason text;
alter table public.sms_delivery_reports add column if not exists delivered_at timestamptz;
alter table public.sms_delivery_reports add column if not exists last_reported_at timestamptz not null default now();
alter table public.sms_delivery_reports add column if not exists raw_payload jsonb not null default '{}'::jsonb;
alter table public.sms_delivery_reports add column if not exists created_at timestamptz not null default now();
alter table public.sms_delivery_reports add column if not exists updated_at timestamptz not null default now();
alter table public.sms_delivery_reports drop constraint if exists sms_delivery_reports_delivery_status_check;
alter table public.sms_delivery_reports add constraint sms_delivery_reports_delivery_status_check
  check (delivery_status in ('submitted', 'queued', 'delivered', 'failed', 'rejected', 'unknown'));

drop trigger if exists sms_delivery_reports_set_updated_at on public.sms_delivery_reports;
create trigger sms_delivery_reports_set_updated_at before update on public.sms_delivery_reports
for each row execute function public.set_updated_at();

drop trigger if exists sms_logs_set_updated_at on public.sms_logs;
create trigger sms_logs_set_updated_at before update on public.sms_logs
for each row execute function public.set_updated_at();

create index if not exists idx_sms_delivery_reports_status_reported on public.sms_delivery_reports (delivery_status, last_reported_at desc);
create index if not exists idx_sms_delivery_reports_phone_reported on public.sms_delivery_reports (recipient_phone, last_reported_at desc);
create index if not exists idx_sms_delivery_reports_provider_reported on public.sms_delivery_reports (provider, last_reported_at desc);
create unique index if not exists idx_sms_logs_message_id_unique on public.sms_logs (message_id);
create index if not exists idx_sms_logs_phone_created on public.sms_logs (phone, created_at desc);
create index if not exists idx_sms_logs_status_created on public.sms_logs (delivery_status, created_at desc);
create index if not exists idx_sms_logs_request_id on public.sms_logs (request_id);

alter table public.sms_delivery_reports enable row level security;
alter table public.sms_logs enable row level security;

revoke all on table public.sms_delivery_reports from anon, authenticated;
revoke all on table public.sms_logs from anon, authenticated;
