-- SALAMA LOCK Paygo Honor phone setup
-- Run this in the Supabase SQL Editor after supabase.sql for existing projects.
-- This script normalizes phone inventory rows, rebuilds phone profiles, and adds a health check
-- so Honor import/lock calls can work from www.SALAMA LOCKpay.com.

begin;

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

alter table public.inventory_products
  add column if not exists product_type text not null default 'product';

alter table public.inventory_products
  add column if not exists product_model text;

alter table public.inventory_products
  add column if not exists serial_number text;

alter table public.inventory_products
  add column if not exists chassis_number text;

alter table public.inventory_products
  add column if not exists imei_1 text;

alter table public.inventory_products
  add column if not exists imei_2 text;

alter table public.inventory_products
  add column if not exists locker_id text;

alter table public.inventory_products
  add column if not exists locker_provider text not null default 'honor' check (locker_provider in ('honor', 'trustonic'));

alter table public.inventory_products
  add column if not exists branch text;

alter table public.inventory_products
  add column if not exists assigned_customer_id text;

alter table public.inventory_products
  add column if not exists assigned_agent_id text;

alter table public.inventory_products
  add column if not exists assigned_agent_code text;

alter table public.inventory_products
  drop constraint if exists inventory_products_product_type_check;

alter table public.inventory_products
  add constraint inventory_products_product_type_check
  check (product_type in ('product', 'bike', 'phone'));

alter table public.inventory_products
  drop constraint if exists inventory_products_phone_imei_check;

alter table public.inventory_products
  add constraint inventory_products_phone_imei_check
  check (
    product_type <> 'phone'
    or (
      nullif(trim(imei_1), '') is not null
      and char_length(regexp_replace(imei_1, '\D', '', 'g')) = 15
      and (nullif(trim(imei_2), '') is null or char_length(regexp_replace(imei_2, '\D', '', 'g')) = 15)
    )
  );

alter table public.inventory_products
  drop constraint if exists inventory_products_bike_serial_check;

alter table public.inventory_products
  add constraint inventory_products_bike_serial_check
  check (
    product_type <> 'bike'
    or (
      nullif(trim(serial_number), '') is not null
      and (nullif(trim(chassis_number), '') is null or length(trim(chassis_number)) >= 6)
    )
  );

alter table public.inventory_phone_profiles
  add column if not exists locker_app_id text;

alter table public.inventory_phone_profiles
  add column if not exists locker_provider text not null default 'honor' check (locker_provider in ('honor', 'trustonic'));

alter table public.inventory_phone_profiles
  add column if not exists locker_app_key text;

alter table public.inventory_phone_profiles
  add column if not exists locker_sync_payload jsonb not null default '{}'::jsonb;

alter table public.inventory_phone_profiles
  add column if not exists locker_last_request_at timestamptz;

alter table public.inventory_phone_profiles
  add column if not exists last_lock_request_at timestamptz;

alter table public.inventory_phone_profiles
  add column if not exists honor_task_id text;

alter table public.inventory_phone_profiles
  add column if not exists honor_lock_status text;

alter table public.inventory_phone_profiles
  add column if not exists honor_last_response jsonb;

alter table public.inventory_phone_profiles
  add column if not exists lock_status text not null default 'pending' check (lock_status in ('pending', 'synced', 'failed', 'locked', 'unlocked', 'registered'));

alter table public.inventory_phone_profiles
  add column if not exists locker_sync_status text not null default 'pending';

alter table public.inventory_phone_profiles
  add column if not exists locker_last_synced_at timestamptz;

alter table public.inventory_phone_profiles
  add column if not exists locker_last_error text;

alter table public.phone_locker_integrations
  add column if not exists locker_provider text not null default 'honor' check (locker_provider in ('honor', 'trustonic'));

create index if not exists idx_phone_locker_integrations_status
  on public.phone_locker_integrations (last_sync_status, updated_at desc);

create index if not exists idx_inventory_phone_profiles_locker_app_id
  on public.inventory_phone_profiles (locker_app_id)
  where nullif(trim(locker_app_id), '') is not null;

create index if not exists idx_inventory_products_locker_provider
  on public.inventory_products (locker_provider);

create index if not exists idx_inventory_phone_profiles_locker_provider
  on public.inventory_phone_profiles (locker_provider);

create index if not exists idx_phone_locker_integrations_provider
  on public.phone_locker_integrations (locker_provider);

create unique index if not exists idx_inventory_products_imei_1
  on public.inventory_products (imei_1)
  where nullif(trim(imei_1), '') is not null;

create unique index if not exists idx_inventory_products_imei_2
  on public.inventory_products (imei_2)
  where nullif(trim(imei_2), '') is not null;

create unique index if not exists idx_inventory_products_locker_id
  on public.inventory_products (locker_id)
  where nullif(trim(locker_id), '') is not null;

-- Normalize existing phone rows.
update public.inventory_products
set
  product_type = 'phone',
  imei_1 = coalesce(nullif(trim(imei_1), ''), nullif(trim(serial_number), '')),
  imei_2 = coalesce(nullif(trim(imei_2), ''), nullif(trim(chassis_number), '')),
  locker_provider = coalesce(nullif(trim(locker_provider), ''), 'honor'),
  serial_number = null,
  chassis_number = null,
  status = case
    when status in ('available', 'assigned', 'reserved', 'sold', 'maintenance', 'inactive') then status
    else 'available'
  end,
  updated_at = now()
where
  product_type = 'phone'
  or (
    nullif(trim(imei_1), '') is not null
    and char_length(regexp_replace(imei_1, '\D', '', 'g')) = 15
  );

-- Rebuild phone profile rows from inventory_products.
insert into public.inventory_phone_profiles (
  product_id,
  imei_1,
  imei_2,
  locker_id,
  locker_provider,
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
select
  ip.id,
  coalesce(nullif(trim(ip.imei_1), ''), nullif(trim(ip.serial_number), '')),
  nullif(trim(ip.imei_2), ''),
  nullif(trim(ip.locker_id), ''),
  coalesce(nullif(trim(ip.locker_provider), ''), 'honor'),
  'pending',
  'pending',
  null,
  null,
  null,
  null,
  coalesce(ip.source_portal, 'admin'),
  ip.created_at,
  now()
from public.inventory_products ip
where ip.product_type = 'phone'
on conflict (product_id) do update set
  imei_1 = excluded.imei_1,
  imei_2 = excluded.imei_2,
  locker_id = excluded.locker_id,
  locker_provider = coalesce(excluded.locker_provider, public.inventory_phone_profiles.locker_provider, 'honor'),
  lock_status = public.inventory_phone_profiles.lock_status,
  locker_sync_status = public.inventory_phone_profiles.locker_sync_status,
  locker_last_synced_at = public.inventory_phone_profiles.locker_last_synced_at,
  locker_last_error = public.inventory_phone_profiles.locker_last_error,
  last_lock_request_at = public.inventory_phone_profiles.last_lock_request_at,
  honor_last_response = public.inventory_phone_profiles.honor_last_response,
  source_portal = excluded.source_portal,
  updated_at = excluded.updated_at;

update public.inventory_phone_profiles
set
  locker_provider = coalesce(nullif(trim(locker_provider), ''), 'honor'),
  locker_sync_status = coalesce(nullif(trim(locker_sync_status), ''), 'pending'),
  last_lock_request_at = coalesce(last_lock_request_at, locker_last_request_at),
  lock_status = coalesce(nullif(trim(lock_status), ''), nullif(trim(honor_lock_status), ''), nullif(trim(locker_sync_status), ''), 'pending'),
  updated_at = now()
where product_id in (
  select id
  from public.inventory_products
  where product_type = 'phone'
);

alter table public.customers
  drop constraint if exists customers_agent_required_kyc_check;

alter table public.customers
  add constraint customers_agent_required_kyc_check
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

-- Backfill agent customer rows from the inventory rows they were created from.
update public.customers c
set
  product_type = coalesce(nullif(trim(c.product_type), ''), ip.product_type, 'bike'),
  product_model = coalesce(nullif(trim(c.product_model), ''), nullif(trim(ip.product_model), '')),
  bike_model = case
    when coalesce(nullif(trim(c.product_type), ''), ip.product_type, 'bike') = 'bike'
      then coalesce(nullif(trim(c.bike_model), ''), nullif(trim(ip.product_model), ''))
    else c.bike_model
  end,
  serial_number = coalesce(
    nullif(trim(c.serial_number), ''),
    case
      when ip.product_type = 'phone' then nullif(trim(ip.imei_1), '')
      else nullif(trim(ip.serial_number), '')
    end,
    nullif(trim(ip.serial_number), ''),
    nullif(trim(ip.imei_1), '')
  ),
  chassis_number = coalesce(
    nullif(trim(c.chassis_number), ''),
    case
      when ip.product_type = 'phone' then nullif(trim(ip.imei_2), '')
      else nullif(trim(ip.chassis_number), '')
    end,
    nullif(trim(ip.chassis_number), ''),
    nullif(trim(ip.imei_2), '')
  ),
  updated_at = now()
from public.customer_applications a
join public.inventory_products ip
  on ip.id = a.product_id
where c.id = a.customer_id
  and c.source_portal = 'agent';

drop view if exists public.honor_phone_inventory_ready;
drop view if exists public.honor_phone_inventory_health;

create view public.honor_phone_inventory_health as
select
  ip.id,
  ip.product_model,
  ip.product_type,
  ip.status,
  ip.imei_1,
  ip.imei_2,
  ip.locker_id,
  p.locker_sync_status,
  p.last_lock_request_at,
  p.lock_status,
  p.honor_task_id,
  p.honor_lock_status,
  p.honor_last_response,
  case
    when nullif(trim(ip.imei_1), '') is null then 'missing_imei_1'
    when char_length(regexp_replace(ip.imei_1, '\D', '', 'g')) <> 15 then 'invalid_imei_1'
    when p.product_id is null then 'missing_phone_profile'
    else 'ready'
  end as honor_ready_status
from public.inventory_products ip
left join public.inventory_phone_profiles p
  on p.product_id = ip.id
where ip.product_type = 'phone';

create view public.honor_phone_inventory_ready as
select *
from public.honor_phone_inventory_health
where honor_ready_status = 'ready';

create or replace function public.honor_phone_inventory_health_check()
returns table (
  id text,
  product_model text,
  imei_1 text,
  imei_2 text,
  locker_id text,
  honor_ready_status text,
  honor_task_id text,
  honor_lock_status text,
  lock_status text
)
language sql
stable
set search_path = public
as $$
  select
    id,
    product_model,
    imei_1,
    imei_2,
    locker_id,
    honor_ready_status,
    honor_task_id,
    honor_lock_status,
    lock_status
  from public.honor_phone_inventory_health
  order by honor_ready_status, id;
$$;

commit;

-- Run this query after the script to see any phone rows that still need fixing.
select *
from public.honor_phone_inventory_health
where honor_ready_status <> 'ready'
order by id;
