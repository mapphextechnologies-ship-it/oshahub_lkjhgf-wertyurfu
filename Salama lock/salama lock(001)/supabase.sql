-- SALAMA LOCK Paygo shared CRM Supabase schema
-- Run once in the Supabase SQL Editor before deploying the portals.

create schema if not exists extensions;
create extension if not exists pgcrypto;
create extension if not exists pg_trgm with schema extensions;
alter extension pg_trgm set schema extensions;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'customer-kyc',
  'customer-kyc',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.admin_profiles (
  id text primary key default ('ADM-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null unique,
  phone text,
  role text not null default 'admin' check (role in ('admin', 'super_admin', 'back_office_officer')),
  status text not null default 'active' check (status in ('active', 'suspended', 'inactive')),
  source_portal text not null default 'admin',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.system_settings (
  section text primary key,
  settings_json jsonb not null default '{}'::jsonb,
  saved_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'system_settings'
      and column_name = 'values'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'system_settings'
      and column_name = 'settings_json'
  ) then
    execute 'alter table public.system_settings rename column "values" to settings_json';
  end if;
end $$;

-- Admin accounts are created through /api/admin/auth/register with
-- ADMIN_REGISTRATION_CODE set in the server environment. Do not create default
-- admin passwords in this setup script.

create table if not exists public.branches (
  id text primary key default ('BRN-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  name text not null unique,
  location text,
  phone text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  source_portal text not null default 'admin',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_products (
  id text primary key default ('PRD-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  product_type text not null default 'product',
  product_model text not null,
  total_payable numeric(14,2) not null default 0,
  serial_number text,
  chassis_number text,
  imei_1 text,
  imei_2 text,
  locker_id text,
  locker_provider text not null default 'honor' check (locker_provider in ('honor', 'trustonic')),
  branch text,
  assigned_customer_id text,
  assigned_agent_id text,
  assigned_agent_code text,
  status text not null default 'available' check (status in ('available', 'assigned', 'reserved', 'sold', 'maintenance', 'inactive')),
  source_portal text not null default 'admin',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_phone_profiles (
  product_id text primary key references public.inventory_products(id) on delete cascade,
  imei_1 text not null,
  imei_2 text,
  locker_id text,
  locker_provider text not null default 'honor' check (locker_provider in ('honor', 'trustonic')),
  provider_state text,
  provider_lock_status text,
  provider_task_id text,
  provider_request_id text,
  provider_response jsonb not null default '{}'::jsonb,
  provider_error_code text,
  provider_error_message text,
  storage_gb numeric(6,2),
  ram_gb numeric(6,2),
  color text,
  sim_slot_count integer not null default 2,
  lock_status text not null default 'pending' check (lock_status in ('pending', 'synced', 'failed', 'locked', 'unlocked', 'registered', 'unknown')),
  locker_sync_status text not null default 'pending' check (locker_sync_status in ('pending', 'synced', 'failed', 'unknown')),
  sync_status text not null default 'pending' check (sync_status in ('pending', 'synced', 'failed', 'unknown')),
  command_status text not null default 'unknown' check (command_status in ('unknown', 'pending', 'success', 'failed', 'skipped')),
  locker_last_synced_at timestamptz,
  last_provider_sync_at timestamptz,
  locker_last_error text,
  locker_last_request_at timestamptz,
  last_command_at timestamptz,
  last_lock_request_at timestamptz,
  last_lock_command_at timestamptz,
  last_unlock_command_at timestamptz,
  last_command_action text,
  last_verified_at timestamptz,
  unlock_until_at timestamptz,
  final_device_state text,
  honor_task_id text,
  honor_lock_status text,
  last_known_honor_status text,
  device_status text,
  honor_last_response jsonb,
  source_portal text not null default 'admin',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_bike_profiles (
  product_id text primary key references public.inventory_products(id) on delete cascade,
  serial_number text not null,
  chassis_number text,
  engine_number text,
  frame_number text,
  registration_number text,
  tracker_id text,
  color text,
  odometer_km numeric(12,2) not null default 0,
  service_due_date date,
  mechanical_status text not null default 'ready' check (mechanical_status in ('ready', 'inspection', 'maintenance', 'repossessed', 'retired')),
  source_portal text not null default 'admin',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_product_backups (
  id text primary key default ('INV-BK-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  product_id text,
  product_type text not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  snapshot jsonb not null default '{}'::jsonb,
  source_portal text not null default 'system',
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_replication_outbox (
  id text primary key default ('INV-OUT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  product_id text references public.inventory_products(id) on delete set null,
  product_type text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  attempts integer not null default 0,
  status text not null default 'pending' check (status in ('pending', 'processing', 'done', 'failed')),
  error_message text,
  processed_at timestamptz,
  source_portal text not null default 'system',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.inventory_products drop constraint if exists inventory_products_product_type_check;
alter table public.inventory_products add constraint inventory_products_product_type_check
  check (product_type in ('product', 'bike', 'phone'));

create table if not exists public.admin_audit_logs (
  id text primary key default ('AUD-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_email text,
  action text not null,
  target_table text,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  source_portal text not null default 'admin',
  created_at timestamptz not null default now()
);

create table if not exists public.customers (
  id text primary key default ('CUS-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  customer_name text not null,
  customer_phone text,
  national_id text,
  email text,
  alternate_phones text,
  alternate_emails text,
  bike_model text,
  serial_number text,
  chassis_number text,
  agent_name text,
  agent_id text,
  total_payable numeric(14,2) not null default 0,
  paid_amount numeric(14,2) not null default 0,
  balance numeric(14,2) not null default 0,
  due_date date,
  last_payment_date date,
  paygo_started_at timestamptz,
  paygo_first_payment_at timestamptz,
  paygo_last_payment_at timestamptz,
  paygo_next_due_at timestamptz,
  paygo_usage_ends_at timestamptz,
  unlock_until timestamptz,
  paygo_grace_until_at timestamptz,
  paygo_installments_paid integer not null default 0,
  paygo_total_installments integer not null default 0,
  paygo_frequency_hours integer not null default 24,
  paygo_grace_period_hours integer not null default 72,
  paygo_schedule_status text not null default 'inactive',
  last_reminder_sent_at timestamptz,
  next_reminder_due timestamptz,
  reminder_count integer not null default 0,
  date_of_birth date,
  gender text,
  location text,
  occupation text,
  passport_photo_url text,
  id_front_url text,
  id_back_url text,
  next_of_kin_name text,
  next_of_kin_phone text,
  next_of_kin_relationship text,
  next_of_kin_national_id text,
  next_of_kin_gender text,
  next_of_kin_location text,
  next_of_kin_occupation text,
  next_of_kin_passport_photo_url text,
  next_of_kin_id_front_url text,
  next_of_kin_id_back_url text,
  next_of_kin_otp_hash text,
  next_of_kin_otp_expires_at timestamptz,
  next_of_kin_otp_sent_at timestamptz,
  next_of_kin_otp_verified_at timestamptz,
  next_of_kin_otp_status text not null default 'not_sent' check (next_of_kin_otp_status in ('not_sent', 'sent', 'verified', 'expired', 'failed')),
  customer_phone_verified_at timestamptz,
  customer_activation_otp_hash text,
  customer_activation_otp_expires_at timestamptz,
  customer_activation_otp_sent_at timestamptz,
  customer_activation_otp_verified_at timestamptz,
  customer_activation_otp_status text not null default 'not_sent' check (customer_activation_otp_status in ('not_sent', 'sent', 'verified', 'expired', 'failed')),
  next_of_kin_verified_at timestamptz,
  application_status text not null default 'active' check (application_status in ('draft', 'next_of_kin_pending', 'pending_screening', 'info_required', 'approved', 'rejected', 'active')),
  screening_reason text,
  screened_at timestamptz,
  screened_by uuid references auth.users(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'defaulted', 'paid', 'not_registered', 'next_of_kin_pending', 'pending_screening', 'rejected')),
  overdue_days integer not null default 0,
  registration_status text generated always as (status) stored,
  source_portal text not null default 'finance',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_applications (
  id text primary key default ('APP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  customer_id text not null references public.customers(id) on delete cascade,
  agent_id text,
  agent_name text,
  product_id text,
  national_id text,
  status text not null default 'pending_screening' check (status in ('next_of_kin_pending', 'pending_screening', 'info_required', 'approved', 'rejected')),
  duplicate_national_id boolean not null default false,
  verification jsonb not null default '{}'::jsonb,
  review_reason text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  source_portal text not null default 'agent',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agents (
  id text primary key default ('AGT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  agent_code text not null unique,
  full_name text not null,
  national_id text,
  phone text not null,
  email text not null unique,
  region text,
  status text not null default 'active' check (status in ('active', 'pending', 'suspended', 'inactive')),
  source_portal text not null default 'agent',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payments (
  id text primary key default ('PAY-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  customer_id text references public.customers(id) on delete set null,
  customer_name text not null,
  customer_phone text,
  product_type text not null default 'bike',
  product_model text,
  agent_name text,
  agent_id text,
  bike_model text,
  serial_number text,
  chassis_number text,
  total_payable numeric(14,2) not null default 0,
  paid_amount numeric(14,2) not null default 0,
  balance numeric(14,2) not null default 0,
  daily_target numeric(14,2) not null default 0,
  daily_installment numeric(14,2) not null default 0,
  due_date date,
  registration_status text not null default 'registered',
  payment_status text not null default 'paid',
  deposit_credit numeric(14,2) not null default 0,
  paygo_payment numeric(14,2) not null default 0,
  date timestamptz not null default now(),
  receipt text unique,
  provider_reference text,
  provider_transaction_id text,
  provider_account_reference text,
  provider_payer_phone text,
  provider_payer_phone_raw text,
  provider_paid_at timestamptz,
  reconciliation_status text not null default 'matched',
  verified_at timestamptz,
  verified_by text,
  method text not null default 'manual',
  status text not null default 'paid' check (status in ('paid', 'unpaid', 'completed')),
  source_portal text not null default 'finance',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.payments add column if not exists ledger_state text not null default 'active';
alter table public.payments add column if not exists revision_of text references public.payments(id) on delete restrict;
alter table public.payments add column if not exists revision_number integer not null default 1;
alter table public.payments add column if not exists correction_reason text;
alter table public.payments add column if not exists corrected_by uuid references auth.users(id) on delete set null;
alter table public.payments add column if not exists corrected_by_email text;
alter table public.payments add column if not exists corrected_at timestamptz;

alter table public.payments drop constraint if exists payments_reconciliation_status_check;
alter table public.payments add column if not exists reconciliation_status text not null default 'matched';
alter table public.payments add column if not exists verified_at timestamptz;
alter table public.payments add column if not exists verified_by text;
alter table public.payments add constraint payments_reconciliation_status_check
  check (reconciliation_status in ('matched', 'unmatched', 'missing', 'amount_mismatch', 'manual_review'));

create table if not exists public.commissions (
  id text primary key default ('COM-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  payment_id text references public.payments(id) on delete set null,
  agent_name text not null,
  agent_code text not null,
  agent_phone text,
  customer_name text,
  product_type text not null default 'product',
  product_model text,
  serial_number text,
  chassis_number text,
  type text not null default 'payment_percentage',
  amount numeric(14,2) not null default 0,
  status text not null default 'earned' check (status in ('earned', 'processing', 'paid', 'failed', 'cancelled')),
  earned_at timestamptz not null default now(),
  paid_at timestamptz,
  payout_status text not null default 'not_requested' check (payout_status in ('not_requested', 'queued', 'processing', 'paid', 'failed', 'cancelled')),
  payout_requested_at timestamptz,
  payout_completed_at timestamptz,
  payout_reference text,
  provider_response jsonb not null default '{}'::jsonb,
  payout_error text,
  finance_approved_at timestamptz,
  finance_approval_reference text,
  follow_up_sent_at timestamptz,
  source_portal text not null default 'finance',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agent_payout_requests (
  id text primary key default ('APR-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  commission_id text not null references public.commissions(id) on delete cascade,
  agent_name text not null,
  agent_code text not null,
  agent_phone text,
  amount numeric(14,2) not null default 0,
  status text not null default 'queued' check (status in ('queued', 'processing', 'paid', 'failed', 'cancelled')),
  finance_approval_reference text,
  backend_reference text,
  provider_reference text,
  provider_response jsonb not null default '{}'::jsonb,
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reconciliation (
  id text primary key default ('REC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  payment_id text references public.payments(id) on delete set null,
  receipt text,
  customer_name text not null default 'Unknown account ref',
  national_id text,
  provider_amount numeric(14,2) not null default 0,
  system_amount numeric(14,2),
  date date not null default current_date,
  status text not null default 'unmatched' check (status in ('matched', 'unmatched', 'missing', 'amount_mismatch')),
  source_portal text not null default 'finance',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agent_notifications (
  id text primary key default ('AGN-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  agent_id text,
  agent_name text,
  agent_code text,
  agent_phone text,
  customer_id text references public.customers(id) on delete cascade,
  customer_name text,
  message text not null,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'read')),
  source_portal text not null default 'finance',
  created_at timestamptz not null default now()
);

create table if not exists public.agent_tasks (
  id text primary key default ('ATK-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  agent_id text not null references public.agents(id) on delete cascade,
  customer_id text references public.customers(id) on delete cascade,
  title text not null,
  note text,
  due_label text,
  status text not null default 'open' check (status in ('open', 'done', 'cancelled')),
  completed_at timestamptz,
  source_portal text not null default 'agent',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.finance_notifications (
  id text primary key default ('FNT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  type text not null default 'payment_unpaid',
  title text not null,
  message text not null,
  issue text,
  follow_up text,
  customer_id text references public.customers(id) on delete set null,
  customer_name text,
  customer_phone text,
  agent_name text,
  agent_code text,
  payment_id text references public.payments(id) on delete set null,
  payment_date timestamptz,
  amount numeric(14,2),
  balance numeric(14,2),
  overdue_days integer,
  source_portal text not null default 'backend',
  severity text not null default 'info' check (severity in ('info', 'warning', 'critical', 'success')),
  status text not null default 'unread' check (status in ('unread', 'read', 'dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_requests (
  id text primary key default ('PQR-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  customer_id text not null references public.customers(id) on delete cascade,
  amount numeric(14,2) not null default 0,
  phone text not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  provider_reference text,
  backend_reference text,
  provider_response jsonb not null default '{}'::jsonb,
  failure_reason text,
  source_portal text not null default 'customer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_notifications (
  id text primary key default ('CNT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  customer_id text not null references public.customers(id) on delete cascade,
  title text not null,
  message text not null,
  type text not null default 'info',
  status text not null default 'unread' check (status in ('unread', 'read', 'dismissed')),
  source_portal text not null default 'backend',
  created_at timestamptz not null default now()
);

create table if not exists public.password_reset_requests (
  id text primary key default ('PRR-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  requested_email text,
  normalized_email text,
  email text not null,
  user_id uuid references auth.users(id) on delete set null,
  registered_phone text,
  phone text not null,
  otp_hash text,
  otp_expires_at timestamptz,
  otp_verified_at timestamptz,
  reset_token_hash text,
  reset_token_expires_at timestamptz,
  reset_token_used_at timestamptz,
  used_at timestamptz,
  attempts integer not null default 0,
  status text not null default 'otp_required' check (status in ('otp_required', 'otp_sent', 'verified', 'completed', 'failed', 'cancelled')),
  source_portal text not null default 'customer',
  provider_response jsonb not null default '{}'::jsonb,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sms_delivery_reports (
  provider_message_id text primary key,
  provider text not null default 'africastalking',
  recipient_phone text not null,
  source_portal text not null default 'api',
  request_id text,
  sender_mode text,
  sender_id text,
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
  delivery_status text not null default 'provider_accepted' check (
    delivery_status in (
      'provider_accepted',
      'sent',
      'delivered',
      'failed',
      'rejected',
      'expired',
      'blacklisted',
      'invalid_phone_number',
      'unknown'
    )
  ),
  failure_reason text,
  network_code text,
  raw_provider_response jsonb not null default '{}'::jsonb,
  raw_delivery_payload jsonb not null default '{}'::jsonb,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.customers add column if not exists auth_user_id uuid references auth.users(id) on delete set null;
alter table public.customers add column if not exists alternate_phones text;
alter table public.customers add column if not exists alternate_emails text;
alter table public.customers add column if not exists product_type text not null default 'bike';
alter table public.customers add column if not exists product_model text;
alter table public.customers add column if not exists chassis_number text;
alter table public.customers add column if not exists daily_installment numeric(14,2) not null default 0;
alter table public.customers add column if not exists final_payment_date date;
alter table public.customers add column if not exists paygo_started_at timestamptz;
alter table public.customers add column if not exists paygo_first_payment_at timestamptz;
alter table public.customers add column if not exists paygo_last_payment_at timestamptz;
alter table public.customers add column if not exists paygo_next_due_at timestamptz;
alter table public.customers add column if not exists paygo_usage_ends_at timestamptz;
alter table public.customers add column if not exists unlock_until timestamptz;
alter table public.customers add column if not exists paygo_grace_until_at timestamptz;
alter table public.customers add column if not exists paygo_installments_paid integer not null default 0;
alter table public.customers add column if not exists paygo_total_installments integer not null default 0;
alter table public.customers add column if not exists paygo_frequency_hours integer not null default 24;
alter table public.customers add column if not exists paygo_grace_period_hours integer not null default 72;
alter table public.customers add column if not exists paygo_schedule_status text not null default 'inactive';
alter table public.customers add column if not exists last_reminder_sent_at timestamptz;
alter table public.customers add column if not exists next_reminder_due timestamptz;
alter table public.customers add column if not exists reminder_count integer not null default 0;
alter table public.customers add column if not exists date_of_birth date;
alter table public.customers add column if not exists gender text;
alter table public.customers add column if not exists location text;
alter table public.customers add column if not exists occupation text;
alter table public.customers add column if not exists passport_photo_url text;
alter table public.customers add column if not exists id_front_url text;
alter table public.customers add column if not exists id_back_url text;
alter table public.customers add column if not exists next_of_kin_name text;
alter table public.customers add column if not exists next_of_kin_phone text;
alter table public.customers add column if not exists next_of_kin_relationship text;
alter table public.customers add column if not exists next_of_kin_national_id text;
alter table public.customers add column if not exists next_of_kin_gender text;
alter table public.customers add column if not exists next_of_kin_location text;
alter table public.customers add column if not exists next_of_kin_occupation text;
alter table public.customers add column if not exists next_of_kin_passport_photo_url text;
alter table public.customers add column if not exists next_of_kin_id_front_url text;
alter table public.customers add column if not exists next_of_kin_id_back_url text;
alter table public.customers add column if not exists next_of_kin_otp_hash text;
alter table public.customers add column if not exists next_of_kin_otp_expires_at timestamptz;
alter table public.customers add column if not exists next_of_kin_otp_sent_at timestamptz;
alter table public.customers add column if not exists next_of_kin_otp_verified_at timestamptz;
alter table public.customers add column if not exists next_of_kin_otp_status text not null default 'not_sent';
alter table public.customers add column if not exists customer_phone_verified_at timestamptz;
alter table public.customers add column if not exists customer_activation_otp_hash text;
alter table public.customers add column if not exists customer_activation_otp_expires_at timestamptz;
alter table public.customers add column if not exists customer_activation_otp_sent_at timestamptz;
alter table public.customers add column if not exists customer_activation_otp_verified_at timestamptz;
alter table public.customers add column if not exists customer_activation_otp_status text not null default 'not_sent';
alter table public.customers add column if not exists next_of_kin_verified_at timestamptz;
alter table public.customers add column if not exists application_status text not null default 'active';
alter table public.customers add column if not exists screening_reason text;
alter table public.customers add column if not exists screened_at timestamptz;
alter table public.customers add column if not exists screened_by uuid references auth.users(id) on delete set null;
alter table public.agent_notifications add column if not exists agent_id text;
alter table public.agent_notifications add column if not exists customer_id text references public.customers(id) on delete cascade;
alter table public.customer_applications add column if not exists product_id text;
alter table public.customer_applications add column if not exists verification jsonb not null default '{}'::jsonb;
alter table public.customers drop constraint if exists customers_status_check;
alter table public.customers add constraint customers_status_check
  check (status in ('active', 'defaulted', 'paid', 'not_registered', 'next_of_kin_pending', 'pending_screening', 'rejected'));
alter table public.customers drop constraint if exists customers_application_status_check;
alter table public.customers add constraint customers_application_status_check
  check (application_status in ('draft', 'next_of_kin_pending', 'pending_screening', 'info_required', 'approved', 'rejected', 'active'));
alter table public.customers drop constraint if exists customers_next_of_kin_otp_status_check;
alter table public.customers add constraint customers_next_of_kin_otp_status_check
  check (next_of_kin_otp_status in ('not_sent', 'sent', 'verified', 'expired', 'failed'));
alter table public.customers drop constraint if exists customers_activation_otp_status_check;
alter table public.customers add constraint customers_activation_otp_status_check
  check (customer_activation_otp_status in ('not_sent', 'sent', 'verified', 'expired', 'failed'));
alter table public.customer_applications drop constraint if exists customer_applications_status_check;
alter table public.customer_applications add constraint customer_applications_status_check
  check (status in ('next_of_kin_pending', 'pending_screening', 'info_required', 'approved', 'rejected'));
alter table public.customers drop constraint if exists customers_agent_required_kyc_check;
alter table public.customers add constraint customers_agent_required_kyc_check
  check (
    source_portal <> 'agent'
    or (
      nullif(trim(customer_name), '') is not null
      and nullif(trim(customer_phone), '') is not null
      and nullif(trim(national_id), '') is not null
      and date_of_birth is not null
      and nullif(trim(gender), '') is not null
      and nullif(trim(location), '') is not null
      and nullif(trim(occupation), '') is not null
      and nullif(trim(passport_photo_url), '') is not null
      and nullif(trim(id_front_url), '') is not null
      and nullif(trim(id_back_url), '') is not null
      and nullif(trim(next_of_kin_name), '') is not null
      and nullif(trim(next_of_kin_phone), '') is not null
      and nullif(trim(next_of_kin_relationship), '') is not null
      and nullif(trim(next_of_kin_national_id), '') is not null
      and nullif(trim(next_of_kin_gender), '') is not null
      and nullif(trim(next_of_kin_location), '') is not null
      and nullif(trim(next_of_kin_occupation), '') is not null
      and nullif(trim(next_of_kin_passport_photo_url), '') is not null
      and nullif(trim(next_of_kin_id_front_url), '') is not null
      and nullif(trim(next_of_kin_id_back_url), '') is not null
      and nullif(trim(product_type), '') is not null
      and nullif(trim(coalesce(product_model, bike_model)), '') is not null
      and (nullif(trim(serial_number), '') is not null or nullif(trim(chassis_number), '') is not null)
      and total_payable > 0
      and paid_amount >= 0
      and paid_amount <= total_payable
      and daily_installment > 0
      and due_date is not null
    )
  );
alter table public.admin_profiles drop constraint if exists admin_profiles_required_fields;
alter table public.admin_profiles add constraint admin_profiles_required_fields
  check (
    nullif(trim(full_name), '') is not null
    and nullif(trim(email), '') is not null
  ) not valid;
alter table public.admin_profiles drop constraint if exists admin_profiles_role_check;
alter table public.admin_profiles add constraint admin_profiles_role_check
  check (role in ('admin', 'super_admin', 'back_office_officer'));
alter table public.agents drop constraint if exists agents_required_fields;
alter table public.agents add constraint agents_required_fields
  check (
    nullif(trim(agent_code), '') is not null
    and nullif(trim(full_name), '') is not null
    and nullif(trim(phone), '') is not null
    and nullif(trim(email), '') is not null
    and nullif(trim(national_id), '') is not null
    and nullif(trim(region), '') is not null
  ) not valid;
alter table public.inventory_products add column if not exists product_type text not null default 'product';
alter table public.inventory_products add column if not exists product_model text;
alter table public.inventory_products add column if not exists total_payable numeric(14,2) not null default 0;
alter table public.inventory_products add column if not exists serial_number text;
alter table public.inventory_products add column if not exists chassis_number text;
alter table public.inventory_products add column if not exists imei_1 text;
alter table public.inventory_products add column if not exists imei_2 text;
alter table public.inventory_products add column if not exists locker_id text;
alter table public.inventory_products add column if not exists locker_provider text not null default 'honor' check (locker_provider in ('honor', 'trustonic'));
alter table public.inventory_products add column if not exists branch text;
alter table public.inventory_products add column if not exists assigned_agent_id text;
alter table public.inventory_products add column if not exists assigned_agent_code text;
alter table public.inventory_products add column if not exists assigned_customer_id text;
update public.inventory_products
  set imei_1 = coalesce(imei_1, serial_number),
      imei_2 = coalesce(imei_2, chassis_number)
where product_type = 'phone';
update public.inventory_products
  set locker_provider = coalesce(nullif(trim(locker_provider), ''), 'honor')
where nullif(trim(locker_provider), '') is null;
update public.inventory_products
  set serial_number = null,
      chassis_number = null
where product_type = 'phone';
alter table public.inventory_products drop constraint if exists inventory_products_status_check;
alter table public.inventory_products add constraint inventory_products_status_check
  check (status in ('available', 'assigned', 'reserved', 'sold', 'maintenance', 'inactive'));
alter table public.inventory_products drop constraint if exists inventory_products_required_fields;
alter table public.inventory_products add constraint inventory_products_required_fields
  check (
    nullif(trim(product_type), '') is not null
    and nullif(trim(product_model), '') is not null
    and nullif(trim(branch), '') is not null
    and (
      product_type <> 'phone'
      or nullif(trim(imei_1), '') is not null
    )
    and (
      product_type <> 'bike'
      or nullif(trim(serial_number), '') is not null
    )
  ) not valid;
alter table public.inventory_products drop constraint if exists inventory_products_phone_imei_check;
alter table public.inventory_products add constraint inventory_products_phone_imei_check
  check (
    product_type <> 'phone'
    or (
      nullif(trim(imei_1), '') is not null
      and char_length(regexp_replace(imei_1, '\D', '', 'g')) = 15
      and (nullif(trim(imei_2), '') is null or char_length(regexp_replace(imei_2, '\D', '', 'g')) = 15)
    )
  ) not valid;
alter table public.inventory_products drop constraint if exists inventory_products_bike_serial_check;
alter table public.inventory_products add constraint inventory_products_bike_serial_check
  check (
    product_type <> 'bike'
    or (
      nullif(trim(serial_number), '') is not null
      and (nullif(trim(chassis_number), '') is null or length(trim(chassis_number)) >= 6)
    )
  ) not valid;

update public.inventory_phone_profiles p
  set imei_1 = coalesce(p.imei_1, ip.imei_1, ip.serial_number),
      imei_2 = coalesce(p.imei_2, ip.imei_2, ip.chassis_number),
      locker_id = coalesce(p.locker_id, ip.locker_id),
      locker_provider = coalesce(nullif(trim(p.locker_provider), ''), nullif(trim(ip.locker_provider), ''), 'honor'),
      source_portal = coalesce(p.source_portal, ip.source_portal, 'admin'),
      updated_at = now()
from public.inventory_products ip
where p.product_id = ip.id
  and ip.product_type = 'phone';

insert into public.inventory_phone_profiles (
  product_id,
  imei_1,
  imei_2,
  locker_id,
  locker_provider,
  source_portal,
  created_at,
  updated_at
)
select
  ip.id,
  coalesce(ip.imei_1, ip.serial_number),
  coalesce(ip.imei_2, ip.chassis_number),
  ip.locker_id,
  coalesce(nullif(trim(ip.locker_provider), ''), 'honor'),
  ip.source_portal,
  ip.created_at,
  ip.updated_at
from public.inventory_products ip
where ip.product_type = 'phone'
on conflict (product_id) do update set
  imei_1 = excluded.imei_1,
  imei_2 = excluded.imei_2,
  locker_id = excluded.locker_id,
  locker_provider = coalesce(excluded.locker_provider, public.inventory_phone_profiles.locker_provider, 'honor'),
  source_portal = excluded.source_portal,
  updated_at = excluded.updated_at;

update public.inventory_bike_profiles p
  set serial_number = coalesce(p.serial_number, ip.serial_number),
      chassis_number = coalesce(p.chassis_number, ip.chassis_number),
      source_portal = coalesce(p.source_portal, ip.source_portal, 'admin'),
      updated_at = now()
from public.inventory_products ip
where p.product_id = ip.id
  and ip.product_type in ('bike', 'product');

insert into public.inventory_bike_profiles (
  product_id,
  serial_number,
  chassis_number,
  source_portal,
  created_at,
  updated_at
)
select
  ip.id,
  coalesce(ip.serial_number, ip.imei_1),
  coalesce(ip.chassis_number, ip.imei_2),
  ip.source_portal,
  ip.created_at,
  ip.updated_at
from public.inventory_products ip
where ip.product_type in ('bike', 'product')
on conflict (product_id) do update set
  serial_number = excluded.serial_number,
  chassis_number = excluded.chassis_number,
  source_portal = excluded.source_portal,
  updated_at = excluded.updated_at;
alter table public.customers drop constraint if exists customers_required_fields;
alter table public.customers add constraint customers_required_fields
  check (
    nullif(trim(customer_name), '') is not null
    and nullif(trim(customer_phone), '') is not null
    and nullif(trim(national_id), '') is not null
    and nullif(trim(product_type), '') is not null
    and nullif(trim(product_model), '') is not null
    and nullif(trim(serial_number), '') is not null
    and nullif(trim(next_of_kin_name), '') is not null
    and nullif(trim(next_of_kin_phone), '') is not null
    and nullif(trim(next_of_kin_relationship), '') is not null
    and total_payable > 0
    and daily_installment > 0
  ) not valid;
alter table public.payments add column if not exists product_type text not null default 'bike';
alter table public.payments add column if not exists product_model text;
alter table public.payments add column if not exists chassis_number text;
alter table public.payments add column if not exists provider_reference text;
alter table public.payments add column if not exists provider_transaction_id text;
alter table public.payments add column if not exists provider_account_reference text;
alter table public.payments add column if not exists provider_payer_phone text;
alter table public.payments add column if not exists provider_payer_phone_raw text;
alter table public.payments add column if not exists provider_paid_at timestamptz;
update public.payments set reconciliation_status = coalesce(reconciliation_status, 'matched');
alter table public.payments drop constraint if exists payments_required_fields;
alter table public.payments add constraint payments_required_fields
  check (
    nullif(trim(customer_name), '') is not null
    and nullif(trim(customer_phone), '') is not null
    and nullif(trim(product_type), '') is not null
    and nullif(trim(product_model), '') is not null
    and nullif(trim(serial_number), '') is not null
    and nullif(trim(agent_name), '') is not null
    and nullif(trim(agent_id), '') is not null
    and total_payable > 0
  ) not valid;
alter table public.payments drop constraint if exists payments_verified_by_check;
alter table public.payments add constraint payments_verified_by_check
  check (
    reconciliation_status <> 'matched'
    or verified_at is null
    or verified_by is not null
  ) not valid;
alter table public.commissions add column if not exists product_type text not null default 'product';
alter table public.commissions add column if not exists product_model text;
alter table public.commissions add column if not exists serial_number text;
alter table public.commissions add column if not exists chassis_number text;
alter table public.commissions add column if not exists payout_status text not null default 'not_requested';
alter table public.commissions add column if not exists payout_requested_at timestamptz;
alter table public.commissions add column if not exists payout_completed_at timestamptz;
alter table public.commissions add column if not exists payout_reference text;
alter table public.commissions add column if not exists provider_response jsonb not null default '{}'::jsonb;
alter table public.commissions add column if not exists finance_approved_at timestamptz;
alter table public.commissions add column if not exists finance_approval_reference text;
alter table public.commissions add column if not exists follow_up_sent_at timestamptz;
alter table public.reconciliation add column if not exists provider_amount numeric(14,2) not null default 0;
alter table public.payment_requests add column if not exists backend_reference text;
alter table public.payment_requests add column if not exists source_portal text not null default 'customer';
alter table public.payment_requests add column if not exists provider_response jsonb not null default '{}'::jsonb;
alter table public.password_reset_requests add column if not exists source_portal text not null default 'customer';
alter table public.password_reset_requests add column if not exists requested_email text;
alter table public.password_reset_requests add column if not exists normalized_email text;
alter table public.password_reset_requests add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.password_reset_requests add column if not exists registered_phone text;
alter table public.password_reset_requests add column if not exists otp_hash text;
alter table public.password_reset_requests add column if not exists otp_expires_at timestamptz;
alter table public.password_reset_requests add column if not exists otp_verified_at timestamptz;
alter table public.password_reset_requests add column if not exists reset_token_hash text;
alter table public.password_reset_requests add column if not exists reset_token_expires_at timestamptz;
alter table public.password_reset_requests add column if not exists reset_token_used_at timestamptz;
alter table public.password_reset_requests add column if not exists used_at timestamptz;
alter table public.password_reset_requests add column if not exists attempts integer not null default 0;
alter table public.password_reset_requests add column if not exists provider_response jsonb not null default '{}'::jsonb;
alter table public.sms_delivery_reports add column if not exists provider text not null default 'africastalking';
alter table public.sms_delivery_reports add column if not exists recipient_phone text not null default '';
alter table public.sms_delivery_reports add column if not exists source_portal text not null default 'api';
alter table public.sms_delivery_reports add column if not exists request_id text;
alter table public.sms_delivery_reports add column if not exists sender_mode text;
alter table public.sms_delivery_reports add column if not exists sender_id text;
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
alter table public.sms_delivery_reports drop constraint if exists sms_delivery_reports_delivery_status_check;
alter table public.sms_delivery_reports add constraint sms_delivery_reports_delivery_status_check
  check (delivery_status in ('submitted', 'queued', 'delivered', 'failed', 'rejected', 'unknown'));
alter table public.sms_logs drop constraint if exists sms_logs_delivery_status_check;
alter table public.sms_logs add constraint sms_logs_delivery_status_check
  check (delivery_status in ('provider_accepted', 'sent', 'delivered', 'failed', 'rejected', 'expired', 'blacklisted', 'invalid_phone_number', 'unknown'));
alter table public.password_reset_requests drop column if exists otp_code;
alter table public.agents add column if not exists source_portal text not null default 'agent';
alter table public.agents add column if not exists agent_name text;
alter table public.agent_tasks add column if not exists completed_at timestamptz;
alter table public.agent_tasks add column if not exists source_portal text not null default 'agent';

drop view if exists public.customer_portal_summary;

alter table public.customers drop column if exists imei;
alter table public.payments drop column if exists imei;
alter table public.commissions drop column if exists imei;
alter table public.inventory_products drop column if exists imei;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.capture_inventory_product_backup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product_id text;
  v_product_type text;
  v_source_portal text;
  v_snapshot jsonb;
  v_product jsonb;
  v_phone_profile jsonb;
  v_bike_profile jsonb;
begin
  if tg_op = 'DELETE' then
    v_product_id := old.id;
    v_product_type := coalesce(nullif(trim(old.product_type), ''), 'product');
    v_source_portal := coalesce(old.source_portal, 'system');
    v_product := to_jsonb(old);
  else
    v_product_id := new.id;
    v_product_type := coalesce(nullif(trim(new.product_type), ''), 'product');
    v_source_portal := coalesce(new.source_portal, 'system');
    v_product := to_jsonb(new);
  end if;

  select to_jsonb(p)
    into v_phone_profile
  from public.inventory_phone_profiles p
  where p.product_id = v_product_id;

  select to_jsonb(b)
    into v_bike_profile
  from public.inventory_bike_profiles b
  where b.product_id = v_product_id;

  v_snapshot := jsonb_build_object(
    'operation', lower(tg_op),
    'product', v_product,
    'phone_profile', v_phone_profile,
    'bike_profile', v_bike_profile,
    'captured_at', now()
  );

  insert into public.inventory_product_backups (
    product_id,
    product_type,
    action,
    snapshot,
    source_portal
  ) values (
    v_product_id,
    v_product_type,
    lower(tg_op),
    v_snapshot,
    v_source_portal
  );

  insert into public.inventory_replication_outbox (
    product_id,
    product_type,
    event_type,
    payload,
    status,
    source_portal
  ) values (
    case when tg_op = 'DELETE' then null else v_product_id end,
    v_product_type,
    'inventory_product.' || lower(tg_op),
    v_snapshot,
    'pending',
    v_source_portal
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create or replace function public.sync_inventory_product_profiles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product_type text;
  v_source_portal text;
  v_phone_profile public.inventory_phone_profiles%rowtype;
  v_bike_profile public.inventory_bike_profiles%rowtype;
begin
  if tg_op = 'DELETE' then
    delete from public.inventory_phone_profiles
    where product_id = old.id;

    delete from public.inventory_bike_profiles
    where product_id = old.id;

    return old;
  end if;

  v_product_type := coalesce(nullif(trim(new.product_type), ''), 'product');
  v_source_portal := coalesce(new.source_portal, 'admin');

  if v_product_type = 'phone' then
    select *
      into v_phone_profile
    from public.inventory_phone_profiles
    where product_id = new.id;

    insert into public.inventory_phone_profiles (
      product_id,
      imei_1,
      imei_2,
      locker_id,
      locker_provider,
      storage_gb,
      ram_gb,
      color,
      sim_slot_count,
      lock_status,
      locker_sync_status,
      locker_last_synced_at,
      locker_last_error,
      last_lock_request_at,
      honor_last_response,
      source_portal,
      created_at,
      updated_at
    )
    values (
      new.id,
      coalesce(nullif(trim(new.imei_1), ''), nullif(trim(new.serial_number), ''), v_phone_profile.imei_1),
      coalesce(nullif(trim(new.imei_2), ''), nullif(trim(new.chassis_number), ''), v_phone_profile.imei_2),
      nullif(trim(new.locker_id), ''),
      coalesce(nullif(trim(new.locker_provider), ''), nullif(trim(v_phone_profile.locker_provider), ''), 'honor'),
      coalesce(v_phone_profile.storage_gb, null),
      coalesce(v_phone_profile.ram_gb, null),
      coalesce(v_phone_profile.color, null),
      coalesce(v_phone_profile.sim_slot_count, 2),
      'pending',
      'pending',
      null,
      null,
      null,
      null,
      v_source_portal,
      coalesce(v_phone_profile.created_at, new.created_at, now()),
      now()
    )
    on conflict (product_id) do update set
      imei_1 = excluded.imei_1,
      imei_2 = excluded.imei_2,
      locker_id = excluded.locker_id,
      locker_provider = coalesce(nullif(trim(excluded.locker_provider), ''), public.inventory_phone_profiles.locker_provider, 'honor'),
      storage_gb = coalesce(excluded.storage_gb, public.inventory_phone_profiles.storage_gb),
      ram_gb = coalesce(excluded.ram_gb, public.inventory_phone_profiles.ram_gb),
      color = coalesce(excluded.color, public.inventory_phone_profiles.color),
      sim_slot_count = coalesce(excluded.sim_slot_count, public.inventory_phone_profiles.sim_slot_count),
      lock_status = public.inventory_phone_profiles.lock_status,
      locker_sync_status = public.inventory_phone_profiles.locker_sync_status,
      locker_last_synced_at = public.inventory_phone_profiles.locker_last_synced_at,
      locker_last_error = public.inventory_phone_profiles.locker_last_error,
      last_lock_request_at = public.inventory_phone_profiles.last_lock_request_at,
      honor_last_response = public.inventory_phone_profiles.honor_last_response,
      source_portal = excluded.source_portal,
      updated_at = now();

    delete from public.inventory_bike_profiles
    where product_id = new.id;
  elsif v_product_type in ('bike', 'product') then
    select *
      into v_bike_profile
    from public.inventory_bike_profiles
    where product_id = new.id;

    insert into public.inventory_bike_profiles (
      product_id,
      serial_number,
      chassis_number,
      engine_number,
      frame_number,
      registration_number,
      tracker_id,
      color,
      odometer_km,
      service_due_date,
      mechanical_status,
      source_portal,
      created_at,
      updated_at
    )
    values (
      new.id,
      coalesce(nullif(trim(new.serial_number), ''), nullif(trim(new.imei_1), ''), v_bike_profile.serial_number),
      coalesce(nullif(trim(new.chassis_number), ''), nullif(trim(new.imei_2), ''), v_bike_profile.chassis_number),
      coalesce(v_bike_profile.engine_number, null),
      coalesce(v_bike_profile.frame_number, null),
      coalesce(v_bike_profile.registration_number, null),
      coalesce(v_bike_profile.tracker_id, null),
      coalesce(v_bike_profile.color, null),
      coalesce(v_bike_profile.odometer_km, 0),
      coalesce(v_bike_profile.service_due_date, null),
      coalesce(v_bike_profile.mechanical_status, 'ready'),
      v_source_portal,
      coalesce(v_bike_profile.created_at, new.created_at, now()),
      now()
    )
    on conflict (product_id) do update set
      serial_number = excluded.serial_number,
      chassis_number = excluded.chassis_number,
      engine_number = coalesce(excluded.engine_number, public.inventory_bike_profiles.engine_number),
      frame_number = coalesce(excluded.frame_number, public.inventory_bike_profiles.frame_number),
      registration_number = coalesce(excluded.registration_number, public.inventory_bike_profiles.registration_number),
      tracker_id = coalesce(excluded.tracker_id, public.inventory_bike_profiles.tracker_id),
      color = coalesce(excluded.color, public.inventory_bike_profiles.color),
      odometer_km = coalesce(excluded.odometer_km, public.inventory_bike_profiles.odometer_km),
      service_due_date = coalesce(excluded.service_due_date, public.inventory_bike_profiles.service_due_date),
      mechanical_status = coalesce(excluded.mechanical_status, public.inventory_bike_profiles.mechanical_status),
      source_portal = excluded.source_portal,
      updated_at = now();

    delete from public.inventory_phone_profiles
    where product_id = new.id;
  else
    delete from public.inventory_phone_profiles
    where product_id = new.id;

    delete from public.inventory_bike_profiles
    where product_id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists customers_set_updated_at on public.customers;
create trigger customers_set_updated_at before update on public.customers
for each row execute function public.set_updated_at();

drop trigger if exists customer_applications_set_updated_at on public.customer_applications;
create trigger customer_applications_set_updated_at before update on public.customer_applications
for each row execute function public.set_updated_at();

drop trigger if exists agents_set_updated_at on public.agents;
create trigger agents_set_updated_at before update on public.agents
for each row execute function public.set_updated_at();

drop trigger if exists admin_profiles_set_updated_at on public.admin_profiles;
create trigger admin_profiles_set_updated_at before update on public.admin_profiles
for each row execute function public.set_updated_at();

drop trigger if exists branches_set_updated_at on public.branches;
create trigger branches_set_updated_at before update on public.branches
for each row execute function public.set_updated_at();

drop trigger if exists inventory_products_set_updated_at on public.inventory_products;
create trigger inventory_products_set_updated_at before update on public.inventory_products
for each row execute function public.set_updated_at();

drop trigger if exists inventory_phone_profiles_set_updated_at on public.inventory_phone_profiles;
create trigger inventory_phone_profiles_set_updated_at before update on public.inventory_phone_profiles
for each row execute function public.set_updated_at();

drop trigger if exists inventory_bike_profiles_set_updated_at on public.inventory_bike_profiles;
create trigger inventory_bike_profiles_set_updated_at before update on public.inventory_bike_profiles
for each row execute function public.set_updated_at();

drop trigger if exists inventory_replication_outbox_set_updated_at on public.inventory_replication_outbox;
create trigger inventory_replication_outbox_set_updated_at before update on public.inventory_replication_outbox
for each row execute function public.set_updated_at();
drop trigger if exists inventory_products_capture_backup on public.inventory_products;
create trigger inventory_products_capture_backup after insert or update or delete on public.inventory_products
for each row execute function public.capture_inventory_product_backup();

drop trigger if exists inventory_products_sync_profiles on public.inventory_products;
create trigger inventory_products_sync_profiles after insert or update or delete on public.inventory_products
for each row execute function public.sync_inventory_product_profiles();

drop trigger if exists payments_set_updated_at on public.payments;
create trigger payments_set_updated_at before update on public.payments
for each row execute function public.set_updated_at();

drop trigger if exists commissions_set_updated_at on public.commissions;
create trigger commissions_set_updated_at before update on public.commissions
for each row execute function public.set_updated_at();

drop trigger if exists agent_payout_requests_set_updated_at on public.agent_payout_requests;
create trigger agent_payout_requests_set_updated_at before update on public.agent_payout_requests
for each row execute function public.set_updated_at();

drop trigger if exists agent_tasks_set_updated_at on public.agent_tasks;
create trigger agent_tasks_set_updated_at before update on public.agent_tasks
for each row execute function public.set_updated_at();

drop trigger if exists finance_notifications_set_updated_at on public.finance_notifications;
create trigger finance_notifications_set_updated_at before update on public.finance_notifications
for each row execute function public.set_updated_at();

drop trigger if exists payment_requests_set_updated_at on public.payment_requests;
create trigger payment_requests_set_updated_at before update on public.payment_requests
for each row execute function public.set_updated_at();

drop trigger if exists password_reset_requests_set_updated_at on public.password_reset_requests;
create trigger password_reset_requests_set_updated_at before update on public.password_reset_requests
for each row execute function public.set_updated_at();

drop trigger if exists sms_delivery_reports_set_updated_at on public.sms_delivery_reports;
create trigger sms_delivery_reports_set_updated_at before update on public.sms_delivery_reports
for each row execute function public.set_updated_at();

drop trigger if exists sms_logs_set_updated_at on public.sms_logs;
create trigger sms_logs_set_updated_at before update on public.sms_logs
for each row execute function public.set_updated_at();

drop trigger if exists reconciliation_set_updated_at on public.reconciliation;
create trigger reconciliation_set_updated_at before update on public.reconciliation
for each row execute function public.set_updated_at();

create unique index if not exists idx_customers_auth_user_unique on public.customers (auth_user_id) where auth_user_id is not null;
create index if not exists idx_customers_email on public.customers (lower(email));
create index if not exists idx_customers_agent on public.customers (lower(agent_name), lower(agent_id));
create index if not exists idx_customers_phone on public.customers (customer_phone);
create index if not exists idx_customers_national_id on public.customers (national_id) where nullif(trim(national_id), '') is not null;
create index if not exists idx_customers_status_due on public.customers (status, due_date);
create index if not exists idx_customers_application_status on public.customers (application_status, created_at desc);
create index if not exists idx_customers_activation_otp on public.customers (customer_activation_otp_status, customer_activation_otp_expires_at desc);
create index if not exists idx_customers_search_name on public.customers using gin (lower(customer_name) gin_trgm_ops);
create index if not exists idx_customers_search_phone on public.customers using gin (customer_phone gin_trgm_ops);
create index if not exists idx_payments_customer on public.payments (customer_id);
create index if not exists idx_payments_date on public.payments (date desc);
create index if not exists idx_payments_agent on public.payments (lower(agent_name), lower(agent_id));
create index if not exists idx_payments_status_date on public.payments (status, date desc);
create index if not exists idx_payments_source_date on public.payments (source_portal, date desc);
create index if not exists idx_payments_product_date on public.payments (product_type, date desc);
create index if not exists idx_payments_receipt on public.payments (receipt);
create index if not exists idx_payments_provider_reference on public.payments (provider_reference);
create unique index if not exists idx_payments_provider_transaction_unique
  on public.payments (provider_transaction_id)
  where provider_transaction_id is not null and provider_transaction_id <> '';
create unique index if not exists idx_payments_provider_reference_unique
  on public.payments (provider_reference)
  where provider_reference is not null and provider_reference <> '';
create index if not exists idx_payments_provider_account on public.payments (provider_account_reference);
create index if not exists idx_payments_provider_paid_at on public.payments (provider_paid_at desc);
create index if not exists idx_payments_chassis_number on public.payments (chassis_number);
create index if not exists idx_payments_search_customer on public.payments using gin (lower(customer_name) gin_trgm_ops);
create index if not exists idx_commissions_agent on public.commissions (lower(agent_code), lower(agent_name));
create index if not exists idx_commissions_status on public.commissions (status);
create index if not exists idx_commissions_status_earned on public.commissions (status, earned_at desc);
create index if not exists idx_commissions_payment on public.commissions (payment_id);
create index if not exists idx_commissions_product on public.commissions (product_type, earned_at desc);
create index if not exists idx_commissions_chassis_number on public.commissions (chassis_number);
create index if not exists idx_commissions_payout_status on public.commissions (payout_status, payout_requested_at desc);
create unique index if not exists idx_agent_payout_requests_commission_unique on public.agent_payout_requests (commission_id);
create index if not exists idx_agent_payout_requests_status_requested on public.agent_payout_requests (status, requested_at desc);
create index if not exists idx_agent_payout_requests_agent on public.agent_payout_requests (lower(agent_code), lower(agent_name));
create index if not exists idx_reconciliation_date on public.reconciliation (date desc);
create index if not exists idx_reconciliation_status_date on public.reconciliation (status, date desc);
create index if not exists idx_reconciliation_receipt on public.reconciliation (receipt);
create index if not exists idx_agent_notifications_agent on public.agent_notifications (lower(agent_code), lower(agent_name));
create index if not exists idx_agent_notifications_status_created on public.agent_notifications (status, created_at desc);
create index if not exists idx_agent_notifications_customer on public.agent_notifications (customer_id, created_at desc);
create unique index if not exists idx_agents_auth_user_unique on public.agents (auth_user_id) where auth_user_id is not null;
create unique index if not exists idx_agents_code_unique on public.agents (agent_code);
create unique index if not exists idx_agents_email_unique on public.agents (lower(email));
create index if not exists idx_agents_status_region on public.agents (status, region);
create index if not exists idx_agent_tasks_agent_status on public.agent_tasks (agent_id, status, created_at desc);
create index if not exists idx_agent_tasks_customer on public.agent_tasks (customer_id, created_at desc);
create index if not exists idx_finance_notifications_status_created on public.finance_notifications (status, created_at desc);
create unique index if not exists idx_inventory_products_imei_1 on public.inventory_products (imei_1) where nullif(trim(imei_1), '') is not null;
create unique index if not exists idx_inventory_products_imei_2 on public.inventory_products (imei_2) where nullif(trim(imei_2), '') is not null;
create unique index if not exists idx_inventory_products_locker_id on public.inventory_products (locker_id) where nullif(trim(locker_id), '') is not null;
create index if not exists idx_inventory_phone_profiles_locker_sync on public.inventory_phone_profiles (locker_sync_status, updated_at desc);
create index if not exists idx_inventory_phone_profiles_device_status on public.inventory_phone_profiles (device_status, last_known_honor_status, updated_at desc);
alter table public.inventory_phone_profiles
  add column if not exists last_lock_command_at timestamptz;

alter table public.inventory_phone_profiles
  add column if not exists last_unlock_command_at timestamptz;

create index if not exists idx_inventory_phone_profiles_last_command_at on public.inventory_phone_profiles (last_lock_command_at desc, last_unlock_command_at desc);
create index if not exists idx_inventory_bike_profiles_mechanical_status on public.inventory_bike_profiles (mechanical_status, updated_at desc);
create index if not exists idx_inventory_product_backups_product_created on public.inventory_product_backups (product_id, created_at desc);
create index if not exists idx_inventory_product_backups_type_created on public.inventory_product_backups (product_type, created_at desc);
create index if not exists idx_inventory_product_backups_action_created on public.inventory_product_backups (action, created_at desc);
create index if not exists idx_inventory_replication_outbox_status_created on public.inventory_replication_outbox (status, created_at desc);
create index if not exists idx_inventory_replication_outbox_product_created on public.inventory_replication_outbox (product_id, created_at desc);
create index if not exists idx_inventory_replication_outbox_type_created on public.inventory_replication_outbox (product_type, created_at desc);
create index if not exists idx_finance_notifications_type_created on public.finance_notifications (type, created_at desc);
create index if not exists idx_finance_notifications_customer on public.finance_notifications (customer_id, created_at desc);
create index if not exists idx_payment_requests_customer_created on public.payment_requests (customer_id, created_at desc);
create index if not exists idx_payment_requests_status_created on public.payment_requests (status, created_at desc);
create index if not exists idx_payment_requests_provider_reference on public.payment_requests (provider_reference);
create index if not exists idx_customer_notifications_customer_created on public.customer_notifications (customer_id, created_at desc);
create index if not exists idx_customer_notifications_status_created on public.customer_notifications (status, created_at desc);
create index if not exists idx_customers_next_reminder_due on public.customers (next_reminder_due, last_reminder_sent_at);
create index if not exists idx_password_reset_requests_email_created on public.password_reset_requests (lower(email), created_at desc);
create index if not exists idx_password_reset_requests_normalized_email_created on public.password_reset_requests (lower(normalized_email), created_at desc) where normalized_email is not null;
create index if not exists idx_password_reset_requests_registered_phone_created on public.password_reset_requests (registered_phone, created_at desc) where registered_phone is not null;
create index if not exists idx_password_reset_requests_status_expires on public.password_reset_requests (status, otp_expires_at desc);
create index if not exists idx_sms_delivery_reports_status_reported on public.sms_delivery_reports (delivery_status, last_reported_at desc);
create index if not exists idx_sms_delivery_reports_phone_reported on public.sms_delivery_reports (recipient_phone, last_reported_at desc);
create index if not exists idx_sms_delivery_reports_provider_reported on public.sms_delivery_reports (provider, last_reported_at desc);
create unique index if not exists idx_sms_logs_message_id_unique on public.sms_logs (message_id);
create index if not exists idx_sms_logs_phone_created on public.sms_logs (phone, created_at desc);
create index if not exists idx_sms_logs_status_created on public.sms_logs (delivery_status, created_at desc);
create index if not exists idx_sms_logs_request_id on public.sms_logs (request_id);
create unique index if not exists idx_admin_profiles_auth_user_unique on public.admin_profiles (auth_user_id);
create unique index if not exists idx_admin_profiles_email_unique on public.admin_profiles (lower(email));
create index if not exists idx_admin_profiles_status on public.admin_profiles (status, created_at desc);
create index if not exists idx_branches_status on public.branches (status, name);
create index if not exists idx_inventory_products_status on public.inventory_products (status, created_at desc);
create index if not exists idx_inventory_products_type_model on public.inventory_products (product_type, product_model);
create index if not exists idx_inventory_products_serial on public.inventory_products (serial_number);
create index if not exists idx_inventory_products_chassis on public.inventory_products (chassis_number);
create index if not exists idx_inventory_products_locker_provider on public.inventory_products (locker_provider);
create index if not exists idx_admin_audit_logs_created on public.admin_audit_logs (created_at desc);
create index if not exists idx_admin_audit_logs_target on public.admin_audit_logs (target_table, target_id);
create index if not exists idx_customer_applications_status on public.customer_applications (status, created_at desc);
create index if not exists idx_customer_applications_customer on public.customer_applications (customer_id);
create index if not exists idx_customer_applications_national_id on public.customer_applications (national_id);

create table if not exists public.phone_locker_integrations (
  id text primary key default ('PLI-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  locker_id text not null unique,
  locker_provider text not null default 'honor' check (locker_provider in ('honor', 'trustonic')),
  app_id text not null,
  app_key text,
  sync_base_url text not null,
  sync_enabled boolean not null default true,
  last_sync_status text not null default 'pending' check (last_sync_status in ('pending', 'synced', 'failed')),
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Central SMS ledger. The primary key is claimed before a provider request,
-- making callback retries and concurrent workers idempotent.
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
  status text not null default 'processing'
    check (status in ('processing', 'sent', 'failed')),
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
  updated_at timestamptz not null default now()
);

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

drop trigger if exists sms_send_locks_set_updated_at on public.sms_send_locks;
create trigger sms_send_locks_set_updated_at before update on public.sms_send_locks
for each row execute function public.set_updated_at();

drop trigger if exists sms_send_locks_normalize_event on public.sms_send_locks;
create trigger sms_send_locks_normalize_event
before insert or update on public.sms_send_locks
for each row execute function public.normalize_sms_send_event();

create unique index if not exists idx_sms_send_locks_id_unique
  on public.sms_send_locks (id);
create unique index if not exists idx_sms_send_locks_event_unique
  on public.sms_send_locks (event_type, event_id)
  where event_id <> '';
create index if not exists idx_sms_send_locks_content_cooldown
  on public.sms_send_locks (phone_number, message_hash, created_at desc);
create index if not exists idx_sms_send_locks_customer_created
  on public.sms_send_locks (customer_id, created_at desc)
  where customer_id is not null;
create index if not exists idx_sms_send_locks_status_expires
  on public.sms_send_locks (status, expires_at desc);

alter table public.sms_send_locks enable row level security;
revoke all on table public.sms_send_locks from anon, authenticated;

create table if not exists public.scheduler_locks (
  lock_name text primary key,
  holder_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  locked_at timestamptz not null default now(),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_scheduler_locks_expires_at on public.scheduler_locks (expires_at);
alter table public.scheduler_locks enable row level security;

create table if not exists public.trustonic_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  external_event_id text,
  tenant_id text,
  event_type text not null default 'unknown',
  payload jsonb not null default '{}'::jsonb,
  raw_body text not null,
  source_headers jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'failed', 'delivered', 'dead_letter')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz default now(),
  last_attempt_at timestamptz,
  delivered_at timestamptz,
  last_http_status integer check (last_http_status is null or last_http_status between 100 and 599),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_trustonic_webhook_events_delivery
  on public.trustonic_webhook_events (status, next_attempt_at, created_at)
  where status in ('pending', 'failed');
create index if not exists idx_trustonic_webhook_events_tenant_created
  on public.trustonic_webhook_events (tenant_id, created_at desc);

drop trigger if exists trustonic_webhook_events_set_updated_at on public.trustonic_webhook_events;
create trigger trustonic_webhook_events_set_updated_at
before update on public.trustonic_webhook_events
for each row execute function public.set_updated_at();

alter table public.trustonic_webhook_events enable row level security;
revoke all on table public.trustonic_webhook_events from anon, authenticated;
grant all on table public.trustonic_webhook_events to service_role;

create or replace function public.claim_scheduler_lock(
  p_lock_name text,
  p_holder_id text,
  p_ttl_seconds integer default 900,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  acquired boolean,
  lock_name text,
  holder_id text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expires_at timestamptz := now() + make_interval(secs => greatest(coalesce(p_ttl_seconds, 900), 60));
begin
  if nullif(trim(p_lock_name), '') is null or nullif(trim(p_holder_id), '') is null then
    acquired := false;
    lock_name := null;
    holder_id := null;
    expires_at := null;
    return next;
    return;
  end if;

  insert into public.scheduler_locks as sl (lock_name, holder_id, metadata, locked_at, expires_at, updated_at)
  values (trim(p_lock_name), trim(p_holder_id), coalesce(p_metadata, '{}'::jsonb), now(), v_expires_at, now())
  on conflict on constraint scheduler_locks_pkey do update
    set holder_id = excluded.holder_id,
        metadata = excluded.metadata,
        locked_at = excluded.locked_at,
        expires_at = excluded.expires_at,
        updated_at = excluded.updated_at
  where sl.expires_at < now()
     or sl.holder_id = excluded.holder_id;

  acquired := found;
  lock_name := trim(p_lock_name);
  holder_id := trim(p_holder_id);
  expires_at := v_expires_at;
  return next;
end;
$$;

create or replace function public.release_scheduler_lock(
  p_lock_name text,
  p_holder_id text
)
returns table (
  released boolean,
  lock_name text,
  holder_id text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.scheduler_locks as sl
  where sl.lock_name = trim(p_lock_name)
    and sl.holder_id = trim(p_holder_id)
  returning true, sl.lock_name, sl.holder_id
  into released, lock_name, holder_id;

  if not found then
    released := false;
    lock_name := trim(p_lock_name);
    holder_id := trim(p_holder_id);
    return next;
    return;
  end if;

  return next;
end;
$$;

alter table public.inventory_phone_profiles
  add column if not exists locker_app_id text;

alter table public.inventory_phone_profiles
  add column if not exists locker_provider text not null default 'honor' check (locker_provider in ('honor', 'trustonic'));

alter table public.inventory_phone_profiles
  add column if not exists provider_state text;

alter table public.inventory_phone_profiles
  add column if not exists provider_lock_status text;

alter table public.inventory_phone_profiles
  add column if not exists provider_task_id text;

alter table public.inventory_phone_profiles
  add column if not exists provider_request_id text;

alter table public.inventory_phone_profiles
  add column if not exists provider_response jsonb not null default '{}'::jsonb;

alter table public.inventory_phone_profiles
  add column if not exists provider_error_code text;

alter table public.inventory_phone_profiles
  add column if not exists provider_error_message text;

alter table public.inventory_phone_profiles
  add column if not exists locker_app_key text;

alter table public.inventory_phone_profiles
  add column if not exists locker_sync_payload jsonb not null default '{}'::jsonb;

alter table public.inventory_phone_profiles
  add column if not exists locker_last_request_at timestamptz;

alter table public.inventory_phone_profiles
  add column if not exists last_lock_request_at timestamptz;

alter table public.inventory_phone_profiles
  add column if not exists last_lock_command_at timestamptz;

alter table public.inventory_phone_profiles
  add column if not exists last_unlock_command_at timestamptz;

alter table public.inventory_phone_profiles
  add column if not exists last_command_action text;

alter table public.inventory_phone_profiles
  add column if not exists sync_status text not null default 'pending' check (sync_status in ('pending', 'synced', 'failed', 'unknown'));

alter table public.inventory_phone_profiles
  add column if not exists command_status text not null default 'unknown' check (command_status in ('unknown', 'pending', 'success', 'failed', 'skipped'));

alter table public.inventory_phone_profiles
  add column if not exists last_provider_sync_at timestamptz;

alter table public.inventory_phone_profiles
  add column if not exists last_command_at timestamptz;

alter table public.inventory_phone_profiles
  add column if not exists last_verified_at timestamptz;

alter table public.inventory_phone_profiles
  add column if not exists unlock_until_at timestamptz;

alter table public.inventory_phone_profiles
  add column if not exists final_device_state text;

alter table public.inventory_phone_profiles
  add column if not exists honor_task_id text;

alter table public.inventory_phone_profiles
  add column if not exists honor_lock_status text;

alter table public.inventory_phone_profiles
  add column if not exists last_known_honor_status text;

alter table public.inventory_phone_profiles
  add column if not exists device_status text;

alter table public.inventory_phone_profiles
  add column if not exists honor_last_response jsonb;

alter table public.inventory_phone_profiles
  add column if not exists lock_status text not null default 'pending' check (lock_status in ('pending', 'synced', 'failed', 'locked', 'unlocked', 'registered', 'unknown'));

alter table public.phone_locker_integrations
  add column if not exists locker_provider text not null default 'honor' check (locker_provider in ('honor', 'trustonic'));

update public.inventory_phone_profiles
  set locker_provider = coalesce(nullif(trim(locker_provider), ''), 'honor')
where nullif(trim(locker_provider), '') is null;

update public.inventory_phone_profiles
  set provider_state = coalesce(nullif(trim(provider_state), ''), nullif(trim(honor_lock_status), ''), nullif(trim(lock_status), ''), nullif(trim(device_status), ''), nullif(trim(last_known_honor_status), '')),
      provider_lock_status = coalesce(nullif(trim(provider_lock_status), ''), nullif(trim(honor_lock_status), ''), nullif(trim(lock_status), ''), nullif(trim(device_status), ''), nullif(trim(last_known_honor_status), '')),
      provider_task_id = coalesce(nullif(trim(provider_task_id), ''), nullif(trim(honor_task_id), '')),
      provider_request_id = coalesce(nullif(trim(provider_request_id), ''), nullif(trim(provider_task_id), ''), nullif(trim(honor_task_id), '')),
      provider_response = coalesce(provider_response, honor_last_response, '{}'::jsonb),
      provider_error_code = coalesce(nullif(trim(provider_error_code), ''), nullif(trim(locker_last_error), '')),
      provider_error_message = coalesce(nullif(trim(provider_error_message), ''), nullif(trim(locker_last_error), '')),
      sync_status = coalesce(nullif(trim(sync_status), ''), nullif(trim(locker_sync_status), ''), 'pending'),
      command_status = coalesce(nullif(trim(command_status), ''), case when locker_sync_status = 'failed' then 'failed' when lock_status in ('locked', 'unlocked', 'registered') then 'success' else 'unknown' end),
      last_provider_sync_at = coalesce(last_provider_sync_at, locker_last_synced_at, last_sync_at),
      last_command_at = coalesce(last_command_at, locker_last_request_at, last_lock_request_at, last_lock_command_at, last_unlock_command_at),
      last_verified_at = coalesce(last_verified_at, locker_last_synced_at, last_sync_at),
      final_device_state = coalesce(nullif(trim(final_device_state), ''), nullif(trim(provider_lock_status), ''), nullif(trim(honor_lock_status), ''), nullif(trim(lock_status), ''), nullif(trim(device_status), '')),
      lock_status = coalesce(nullif(trim(lock_status), ''), nullif(trim(provider_lock_status), ''), nullif(trim(honor_lock_status), ''), nullif(trim(device_status), ''), 'pending'),
      honor_lock_status = coalesce(nullif(trim(honor_lock_status), ''), nullif(trim(provider_lock_status), ''), nullif(trim(lock_status), ''), nullif(trim(device_status), '')),
      device_status = coalesce(nullif(trim(device_status), ''), nullif(trim(provider_lock_status), ''), nullif(trim(final_device_state), ''), nullif(trim(lock_status), '')),
      last_known_honor_status = coalesce(nullif(trim(last_known_honor_status), ''), nullif(trim(provider_lock_status), ''), nullif(trim(final_device_state), ''), nullif(trim(lock_status), ''));

update public.phone_locker_integrations
  set locker_provider = coalesce(nullif(trim(locker_provider), ''), 'honor')
where nullif(trim(locker_provider), '') is null;

create index if not exists idx_phone_locker_integrations_status
  on public.phone_locker_integrations (last_sync_status, updated_at desc);

create index if not exists idx_inventory_phone_profiles_locker_app_id
  on public.inventory_phone_profiles (locker_app_id)
  where nullif(trim(locker_app_id), '') is not null;

create index if not exists idx_inventory_phone_profiles_locker_provider
  on public.inventory_phone_profiles (locker_provider);

create index if not exists idx_phone_locker_integrations_provider
  on public.phone_locker_integrations (locker_provider);

drop view if exists public.inventory_phone_feed;

create or replace view public.inventory_phone_feed as
select
  ip.id,
  ip.product_type,
  ip.product_model,
  ip.serial_number,
  ip.chassis_number,
  ip.imei_1,
  ip.imei_2,
  ip.locker_id,
  p.locker_provider,
  ip.branch,
  ip.assigned_customer_id,
  ip.assigned_agent_id,
  ip.assigned_agent_code,
  ip.status,
  ip.source_portal,
  ip.created_at,
  ip.updated_at,
  p.storage_gb,
  p.ram_gb,
  p.color,
  p.sim_slot_count,
  p.locker_sync_status,
  p.locker_last_synced_at,
  p.locker_last_error,
  p.last_lock_request_at,
  p.lock_status,
  p.honor_last_response
from public.inventory_products ip
left join public.inventory_phone_profiles p on p.product_id = ip.id
where ip.product_type = 'phone';

drop view if exists public.inventory_bike_feed;

create or replace view public.inventory_bike_feed as
select
  ip.id,
  ip.product_type,
  ip.product_model,
  ip.serial_number,
  ip.chassis_number,
  ip.imei_1,
  ip.imei_2,
  ip.locker_id,
  ip.branch,
  ip.assigned_customer_id,
  ip.assigned_agent_id,
  ip.assigned_agent_code,
  ip.status,
  ip.source_portal,
  ip.created_at,
  ip.updated_at,
  b.engine_number,
  b.frame_number,
  b.registration_number,
  b.tracker_id,
  b.color,
  b.odometer_km,
  b.service_due_date,
  b.mechanical_status
from public.inventory_products ip
left join public.inventory_bike_profiles b on b.product_id = ip.id
where ip.product_type in ('bike', 'product');

insert into public.inventory_product_backups (
  product_id,
  product_type,
  action,
  snapshot,
  source_portal
)
select
  ip.id,
  ip.product_type,
  'insert',
  jsonb_build_object(
    'operation', 'initial_snapshot',
    'product', to_jsonb(ip),
    'phone_profile', to_jsonb(php),
    'bike_profile', to_jsonb(bbp),
    'captured_at', now()
  ),
  coalesce(ip.source_portal, 'system')
from public.inventory_products ip
left join public.inventory_phone_profiles php on php.product_id = ip.id
left join public.inventory_bike_profiles bbp on bbp.product_id = ip.id
where not exists (
  select 1
  from public.inventory_product_backups backups
  where backups.product_id = ip.id
    and backups.action = 'insert'
);

create or replace view public.customer_portal_summary as
select
  c.id as customer_id,
  c.auth_user_id,
  c.customer_name,
  c.customer_phone,
  c.email,
  c.national_id,
  c.product_type,
  coalesce(c.product_model, c.bike_model) as product_model,
  c.serial_number,
  c.chassis_number,
  c.agent_name,
  c.agent_id,
  c.total_payable,
  c.daily_installment,
  c.due_date,
  c.final_payment_date,
  c.last_payment_date,
  c.status,
  c.overdue_days,
  coalesce(sum(
    case when p.status in ('paid', 'completed')
      then case
        when coalesce(p.deposit_credit, 0) + coalesce(p.paygo_payment, 0) > 0
          then coalesce(p.deposit_credit, 0) + coalesce(p.paygo_payment, 0)
        else coalesce(p.paid_amount, 0)
      end
      else 0
    end
  ), 0) as total_paid,
  greatest(c.total_payable - coalesce(sum(
    case when p.status in ('paid', 'completed')
      then case
        when coalesce(p.deposit_credit, 0) + coalesce(p.paygo_payment, 0) > 0
          then coalesce(p.deposit_credit, 0) + coalesce(p.paygo_payment, 0)
        else coalesce(p.paid_amount, 0)
      end
      else 0
    end
  ), 0), 0) as balance,
  greatest(c.total_payable - coalesce(sum(
    case when p.status in ('paid', 'completed')
      then case
        when coalesce(p.deposit_credit, 0) + coalesce(p.paygo_payment, 0) > 0
          then coalesce(p.deposit_credit, 0) + coalesce(p.paygo_payment, 0)
        else coalesce(p.paid_amount, 0)
      end
      else 0
    end
  ), 0), 0) as computed_balance
from public.customers c
left join public.payments p on p.customer_id = c.id
group by c.id;

create or replace function public.finance_dashboard_summary(days_back integer default 30, scope_product_type text default null)
returns jsonb
language sql
stable
set search_path = public
as $$
  with payment_summary as (
    select
      coalesce(sum(deposit_credit + paygo_payment), 0) as total_collected,
      count(*) filter (where date::date = current_date) as today_collections,
      count(*) filter (where status = 'unpaid') as unpaid_payments
    from public.payments p
    where coalesce(scope_product_type, '') = '' or p.product_type = scope_product_type
  ),
  customer_summary as (
    select
      coalesce(sum(total_payable) filter (where total_payable > 0), 0) as expected_amount,
      coalesce(sum(balance) filter (where balance > 0), 0) as pending_payments,
      coalesce(sum(balance) filter (where overdue_days > 0 or status = 'defaulted'), 0) as overdue_amount,
      count(*) filter (where status <> 'paid') as active_accounts
    from public.customers c
    where coalesce(scope_product_type, '') = '' or c.product_type = scope_product_type
  ),
  commission_summary as (
    select
      coalesce(sum(amount) filter (where status <> 'paid'), 0) as unpaid_commissions,
      count(*) filter (where status = 'earned') as pending_commissions
    from public.commissions c
    where coalesce(scope_product_type, '') = '' or c.product_type = scope_product_type
  ),
  reconciliation_summary as (
    select count(*) filter (where r.status <> 'matched') as reconciliation_flags
    from public.reconciliation r
    left join public.payments p on p.id = r.payment_id
    where coalesce(scope_product_type, '') = '' or p.product_type = scope_product_type
  ),
  trend_summary as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object('date', day::text, 'amount', amount, 'records', records)
        order by day
      ),
      '[]'::jsonb
    ) as trend
    from (
      select
        date::date as day,
        coalesce(sum(deposit_credit + paygo_payment), 0) as amount,
        count(*) as records
      from public.payments p
      where p.date >= current_date - make_interval(days => greatest(days_back, 1))
        and (coalesce(scope_product_type, '') = '' or p.product_type = scope_product_type)
      group by date::date
    ) daily
  )
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'total_collected', payment_summary.total_collected,
      'expected_amount', customer_summary.expected_amount,
      'expected_collection', customer_summary.expected_amount,
      'pending_payments', customer_summary.pending_payments,
      'overdue_amount', customer_summary.overdue_amount,
      'reconciliation_flags', reconciliation_summary.reconciliation_flags,
      'unpaid_commissions', commission_summary.unpaid_commissions,
      'active_accounts', customer_summary.active_accounts,
      'today_collections', payment_summary.today_collections,
      'unpaid_payments', payment_summary.unpaid_payments,
      'pending_commissions', commission_summary.pending_commissions
    ),
    'trend', trend_summary.trend
  )
  from payment_summary, customer_summary, commission_summary, reconciliation_summary, trend_summary;
$$;

alter table public.customers enable row level security;
alter table public.agents enable row level security;
alter table public.payments enable row level security;
alter table public.commissions enable row level security;
alter table public.agent_payout_requests enable row level security;
alter table public.reconciliation enable row level security;
alter table public.agent_notifications enable row level security;
alter table public.agent_tasks enable row level security;
alter table public.finance_notifications enable row level security;
alter table public.payment_requests enable row level security;
alter table public.customer_notifications enable row level security;
alter table public.password_reset_requests enable row level security;
alter table public.sms_delivery_reports enable row level security;
alter table public.sms_logs enable row level security;
alter table public.customer_applications enable row level security;
alter table public.admin_profiles enable row level security;
alter table public.system_settings enable row level security;
alter table public.branches enable row level security;
alter table public.inventory_products enable row level security;
alter table public.inventory_phone_profiles enable row level security;
alter table public.inventory_bike_profiles enable row level security;
alter table public.inventory_product_backups enable row level security;
alter table public.inventory_replication_outbox enable row level security;
alter table public.admin_audit_logs enable row level security;

create table if not exists public.api_rate_limits (
  rate_key text primary key,
  request_count integer not null default 0,
  reset_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_api_rate_limits_reset_at
  on public.api_rate_limits (reset_at);

create or replace function public.consume_api_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns table(allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_count integer;
  v_reset_at timestamptz;
begin
  if p_key is null or length(trim(p_key)) = 0 then
    return query select false, p_window_seconds;
    return;
  end if;

  insert into public.api_rate_limits (rate_key, request_count, reset_at, updated_at)
  values (p_key, 1, v_now + make_interval(secs => greatest(p_window_seconds, 1)), v_now)
  on conflict (rate_key) do nothing;

  if found then
    return query select true, 0;
    return;
  end if;

  select request_count, reset_at
    into v_count, v_reset_at
  from public.api_rate_limits
  where rate_key = p_key
  for update;

  if v_reset_at <= v_now then
    update public.api_rate_limits
    set request_count = 1,
        reset_at = v_now + make_interval(secs => greatest(p_window_seconds, 1)),
        updated_at = v_now
    where rate_key = p_key;

    return query select true, 0;
    return;
  end if;

  if v_count < greatest(p_limit, 1) then
    update public.api_rate_limits
    set request_count = request_count + 1,
        updated_at = v_now
    where rate_key = p_key;

    return query select true, 0;
    return;
  end if;

  return query select false, greatest(1, ceil(extract(epoch from (v_reset_at - v_now)))::integer);
end;
$$;

alter table public.api_rate_limits enable row level security;

revoke all on table public.customers from anon, authenticated;
revoke all on table public.agents from anon, authenticated;
revoke all on table public.payments from anon, authenticated;
revoke all on table public.commissions from anon, authenticated;
revoke all on table public.agent_payout_requests from anon, authenticated;
revoke all on table public.reconciliation from anon, authenticated;
revoke all on table public.agent_notifications from anon, authenticated;
revoke all on table public.agent_tasks from anon, authenticated;
revoke all on table public.finance_notifications from anon, authenticated;
revoke all on table public.payment_requests from anon, authenticated;
revoke all on table public.customer_notifications from anon, authenticated;
revoke all on table public.password_reset_requests from anon, authenticated;
revoke all on table public.sms_delivery_reports from anon, authenticated;
revoke all on table public.sms_logs from anon, authenticated;
revoke all on table public.customer_applications from anon, authenticated;
revoke all on table public.admin_profiles from anon, authenticated;
revoke all on table public.system_settings from anon, authenticated;
revoke all on table public.branches from anon, authenticated;
revoke all on table public.inventory_products from anon, authenticated;
revoke all on table public.inventory_phone_profiles from anon, authenticated;
revoke all on table public.inventory_bike_profiles from anon, authenticated;
revoke all on table public.inventory_product_backups from anon, authenticated;
revoke all on table public.inventory_replication_outbox from anon, authenticated;
revoke all on table public.inventory_phone_feed from anon, authenticated;
revoke all on table public.inventory_bike_feed from anon, authenticated;
revoke all on table public.admin_audit_logs from anon, authenticated;
revoke all on table public.trustonic_webhook_events from anon, authenticated;
revoke all on table public.scheduler_locks from anon, authenticated;
revoke all on table public.customer_portal_summary from anon, authenticated;
revoke all on table public.api_rate_limits from public, anon, authenticated;
revoke all on function public.claim_scheduler_lock(text, text, integer, jsonb) from public, anon, authenticated;
revoke all on function public.release_scheduler_lock(text, text) from public, anon, authenticated;
revoke all on function public.consume_api_rate_limit(text, integer, integer) from public, anon, authenticated;
grant all on table public.api_rate_limits to service_role;
grant all on table public.system_settings to service_role;
grant all on table public.inventory_phone_profiles to service_role;
grant all on table public.inventory_bike_profiles to service_role;
grant all on table public.inventory_product_backups to service_role;
grant all on table public.inventory_replication_outbox to service_role;
grant all on table public.trustonic_webhook_events to service_role;
grant all on table public.scheduler_locks to service_role;
grant select on table public.inventory_phone_feed to service_role;
grant select on table public.inventory_bike_feed to service_role;
grant execute on function public.claim_scheduler_lock(text, text, integer, jsonb) to service_role;
grant execute on function public.release_scheduler_lock(text, text) to service_role;
grant execute on function public.consume_api_rate_limit(text, integer, integer) to service_role;

-- Portals should access these tables through secured server-side APIs using SUPABASE_SERVICE_ROLE_KEY.
-- Add user-facing RLS policies later only if a portal reads Supabase directly from the browser.
