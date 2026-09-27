-- Customer account to Honor registered device mapping
-- Use this to resolve the Honor registeredId from the customer/payment account reference.

begin;

create table if not exists public.customer_device_mappings (
  id bigserial primary key,
  customer_account text not null,
  customer_id text,
  product_id text,
  registered_id text not null,
  source_portal text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_customer_device_mappings_customer_account
  on public.customer_device_mappings (customer_account);

create unique index if not exists idx_customer_device_mappings_registered_id
  on public.customer_device_mappings (registered_id);

create index if not exists idx_customer_device_mappings_customer_id
  on public.customer_device_mappings (customer_id);

create index if not exists idx_customer_device_mappings_product_id
  on public.customer_device_mappings (product_id);

delete from public.customer_device_mappings;

with source as (
  select
    coalesce(nullif(trim(c.national_id), ''), c.id::text) as customer_account,
    c.id::text as customer_id,
    ip.id::text as product_id,
    coalesce(nullif(trim(ip.imei_1), ''), nullif(trim(ip.serial_number), ''), nullif(trim(ip.locker_id), '')) as registered_id,
    'backfill'::text as source_portal,
    coalesce(ip.created_at, now()) as created_at,
    now() as updated_at
  from public.customers c
  join public.inventory_products ip
    on ip.assigned_customer_id = c.id
   and ip.product_type = 'phone'
  where coalesce(nullif(trim(c.national_id), ''), c.id::text) is not null
    and coalesce(nullif(trim(ip.imei_1), ''), nullif(trim(ip.serial_number), ''), nullif(trim(ip.locker_id), '')) is not null
),
account_dedup as (
  select distinct on (customer_account)
    customer_account,
    customer_id,
    product_id,
    registered_id,
    source_portal,
    created_at,
    updated_at
  from source
  order by customer_account, updated_at desc, created_at desc, product_id
),
device_dedup as (
  select distinct on (registered_id)
  customer_account,
  customer_id,
  product_id,
  registered_id,
  source_portal,
  created_at,
  updated_at
  from account_dedup
  order by registered_id, updated_at desc, created_at desc, customer_account
)
insert into public.customer_device_mappings (
  customer_account,
  customer_id,
  product_id,
  registered_id,
  source_portal,
  created_at,
  updated_at
)
select
  customer_account,
  customer_id,
  product_id,
  registered_id,
  source_portal,
  created_at,
  updated_at
from device_dedup
on conflict (customer_account) do update
set
  customer_id = excluded.customer_id,
  product_id = excluded.product_id,
  registered_id = excluded.registered_id,
  source_portal = excluded.source_portal,
  updated_at = excluded.updated_at;

commit;
