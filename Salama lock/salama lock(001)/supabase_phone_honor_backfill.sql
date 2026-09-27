-- Honor phone backfill and verification helper
-- Run this after supabase.sql if older phone records were inserted as bike/product rows.

begin;

-- Normalize existing phone inventory rows so the Honor sync code can lock them.
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

alter table public.inventory_phone_profiles
  add column if not exists last_lock_request_at timestamptz;

alter table public.inventory_phone_profiles
  add column if not exists honor_last_response jsonb;

alter table public.inventory_phone_profiles
  add column if not exists locker_provider text not null default 'honor' check (locker_provider in ('honor', 'trustonic'));

alter table public.inventory_phone_profiles
  add column if not exists lock_status text not null default 'pending' check (lock_status in ('pending', 'synced', 'failed', 'locked', 'unlocked', 'registered'));

-- Rebuild phone profile rows from the inventory table.
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
  coalesce(nullif(trim(ip.imei_1), ''), nullif(trim(ip.serial_number), '')),
  nullif(trim(ip.imei_2), ''),
  nullif(trim(ip.locker_id), ''),
  coalesce(nullif(trim(ip.locker_provider), ''), 'honor'),
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
  source_portal = excluded.source_portal,
  updated_at = excluded.updated_at;

-- Preserve existing locker state while filling any missing provider/status metadata.
update public.inventory_phone_profiles
set
  locker_provider = coalesce(nullif(trim(locker_provider), ''), 'honor'),
  locker_sync_status = coalesce(nullif(trim(locker_sync_status), ''), 'pending'),
  last_lock_request_at = coalesce(last_lock_request_at, locker_last_request_at),
  lock_status = coalesce(nullif(lock_status, ''), honor_lock_status, locker_sync_status, 'pending'),
  updated_at = now()
where product_id in (
  select id
  from public.inventory_products
  where product_type = 'phone'
);

commit;

-- Sanity check: show phone rows that still cannot be imported into Honor.
select
  id,
  product_model,
  imei_1,
  imei_2,
  locker_id,
  status
from public.inventory_products
where product_type = 'phone'
  and (
    nullif(trim(imei_1), '') is null
    or char_length(regexp_replace(imei_1, '\D', '', 'g')) <> 15
  );
