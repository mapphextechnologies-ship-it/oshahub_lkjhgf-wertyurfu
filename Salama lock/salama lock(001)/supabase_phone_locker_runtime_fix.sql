-- SALAMA LOCK Paygo phone locker runtime fix
-- Run this after the app code is deployed if live phone-profile rows are missing
-- locker metadata or still need a safe backfill from inventory_products.

begin;

alter table public.inventory_products
  add column if not exists locker_provider text not null default 'honor' check (locker_provider in ('honor', 'trustonic'));

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
  add column if not exists sync_status text not null default 'pending' check (sync_status in ('pending', 'synced', 'failed'));

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
  add column if not exists locker_sync_status text not null default 'pending' check (locker_sync_status in ('pending', 'synced', 'failed'));

alter table public.inventory_phone_profiles
  add column if not exists locker_last_synced_at timestamptz;

alter table public.inventory_phone_profiles
  add column if not exists locker_last_error text;

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
  add column if not exists last_known_honor_status text;

alter table public.inventory_phone_profiles
  add column if not exists device_status text;

alter table public.inventory_phone_profiles
  add column if not exists honor_task_id text;

alter table public.inventory_phone_profiles
  add column if not exists honor_lock_status text;

alter table public.inventory_phone_profiles
  add column if not exists honor_last_response jsonb not null default '{}'::jsonb;

alter table public.inventory_phone_profiles
  add column if not exists lock_status text not null default 'pending' check (lock_status in ('pending', 'synced', 'failed', 'locked', 'unlocked', 'registered'));

alter table public.inventory_phone_profiles
  add column if not exists lock_reason text;

alter table public.inventory_phone_profiles
  add column if not exists locked_at timestamptz;

alter table public.inventory_phone_profiles
  add column if not exists unlocked_at timestamptz;

alter table public.inventory_phone_profiles
  add column if not exists last_sync_at timestamptz;

update public.inventory_products
set locker_provider = coalesce(nullif(trim(locker_provider), ''), 'honor')
where nullif(trim(locker_provider), '') is null;

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
  coalesce(ip.created_at, now()),
  now()
from public.inventory_products ip
where ip.product_type = 'phone'
on conflict (product_id) do nothing;

update public.inventory_phone_profiles p
set
  imei_1 = coalesce(nullif(trim(p.imei_1), ''), nullif(trim(ip.imei_1), ''), nullif(trim(ip.serial_number), '')),
  imei_2 = coalesce(nullif(trim(p.imei_2), ''), nullif(trim(ip.imei_2), ''), nullif(trim(ip.chassis_number), '')),
  locker_id = coalesce(nullif(trim(p.locker_id), ''), nullif(trim(ip.locker_id), '')),
  locker_provider = coalesce(nullif(trim(p.locker_provider), ''), nullif(trim(ip.locker_provider), ''), 'honor'),
  locker_sync_status = coalesce(nullif(trim(p.locker_sync_status), ''), 'pending'),
  locker_last_synced_at = coalesce(p.locker_last_synced_at, p.last_sync_at),
  locker_last_error = coalesce(nullif(trim(p.locker_last_error), ''), nullif(trim(p.provider_error_message), '')),
  provider_state = coalesce(nullif(trim(p.provider_state), ''), nullif(trim(p.honor_lock_status), ''), nullif(trim(p.lock_status), ''), nullif(trim(p.device_status), ''), nullif(trim(p.last_known_honor_status), '')),
  provider_lock_status = coalesce(nullif(trim(p.provider_lock_status), ''), nullif(trim(p.honor_lock_status), ''), nullif(trim(p.lock_status), ''), nullif(trim(p.device_status), ''), nullif(trim(p.last_known_honor_status), '')),
  provider_task_id = coalesce(nullif(trim(p.provider_task_id), ''), nullif(trim(p.honor_task_id), '')),
  provider_request_id = coalesce(nullif(trim(p.provider_request_id), ''), nullif(trim(p.locker_last_request_at::text), '')),
  provider_error_message = coalesce(nullif(trim(p.provider_error_message), ''), nullif(trim(p.locker_last_error), '')),
  sync_status = coalesce(nullif(trim(p.sync_status), ''), nullif(trim(p.locker_sync_status), ''), 'pending'),
  command_status = coalesce(nullif(trim(p.command_status), ''), case when p.locker_sync_status = 'failed' then 'failed' when p.lock_status in ('locked', 'unlocked', 'registered') then 'success' else 'unknown' end),
  last_provider_sync_at = coalesce(p.last_provider_sync_at, p.locker_last_synced_at, p.last_sync_at),
  last_command_at = coalesce(p.last_command_at, p.locker_last_request_at, p.last_lock_request_at),
  last_verified_at = coalesce(p.last_verified_at, p.locker_last_synced_at, p.last_sync_at),
  unlock_until_at = coalesce(p.unlock_until_at, null),
  final_device_state = coalesce(nullif(trim(p.final_device_state), ''), nullif(trim(p.provider_lock_status), ''), nullif(trim(p.honor_lock_status), ''), nullif(trim(p.lock_status), ''), nullif(trim(p.device_status), '')),
  lock_status = coalesce(nullif(trim(p.lock_status), ''), nullif(trim(p.provider_lock_status), ''), nullif(trim(p.honor_lock_status), ''), nullif(trim(p.device_status), ''), 'pending'),
  honor_lock_status = coalesce(nullif(trim(p.honor_lock_status), ''), nullif(trim(p.provider_lock_status), ''), nullif(trim(p.lock_status), ''), nullif(trim(p.device_status), '')),
  device_status = coalesce(nullif(trim(p.device_status), ''), nullif(trim(p.provider_lock_status), ''), nullif(trim(p.final_device_state), ''), nullif(trim(p.lock_status), '')),
  last_known_honor_status = coalesce(nullif(trim(p.last_known_honor_status), ''), nullif(trim(p.provider_lock_status), ''), nullif(trim(p.final_device_state), ''), nullif(trim(p.lock_status), '')),
  locker_last_request_at = coalesce(p.locker_last_request_at, p.last_lock_request_at),
  last_lock_request_at = coalesce(p.last_lock_request_at, p.locker_last_request_at),
  locker_sync_payload = coalesce(p.locker_sync_payload, '{}'::jsonb),
  honor_last_response = coalesce(p.honor_last_response, '{}'::jsonb),
  updated_at = now()
from public.inventory_products ip
where p.product_id = ip.id
  and ip.product_type = 'phone';

create or replace function public.normalize_phone_locker_status_text(value text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_value text := lower(trim(coalesce(value, '')));
begin
  if v_value in ('locked', 'lock', 'blocked', 'restricted', 'inactive', 'deactivated', 'expired', 'overdue', 'suspended', 'disabled', 'off') then
    return 'locked';
  end if;

  if v_value in ('unlocked', 'unlock', 'active', 'activated', 'ready', 'available', 'normal', 'released', 'freed', 'online', 'connected', 'on') then
    return 'unlocked';
  end if;

  if v_value in ('pending', 'queued', 'processing', 'running', 'submitted', 'waiting', 'transitioning', 'inprogress') then
    return 'pending';
  end if;

  if v_value in ('synced', 'sync', 'success', 'succeeded', 'completed', 'complete', 'done', 'ok') then
    return 'synced';
  end if;

  if v_value in ('failed', 'error', 'rejected', 'invalid', 'cancelled', 'canceled', 'denied', 'forbidden', 'unauthorized') then
    return 'failed';
  end if;

  if v_value = 'registered' then
    return 'registered';
  end if;

  return null;
end;
$$;

create or replace function public.normalize_inventory_phone_profile_lock_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text := lower(coalesce(new.last_command_action, ''));
  v_lock_status text;
begin
  v_lock_status := coalesce(
    public.normalize_phone_locker_status_text(new.lock_status),
    public.normalize_phone_locker_status_text(new.provider_lock_status),
    public.normalize_phone_locker_status_text(new.honor_lock_status),
    public.normalize_phone_locker_status_text(new.final_device_state),
    public.normalize_phone_locker_status_text(new.device_status),
    public.normalize_phone_locker_status_text(new.last_known_honor_status)
  );

  if v_lock_status is null then
    v_lock_status := case
      when v_action = 'unlock' then 'unlocked'
      when v_action = 'lock' then 'locked'
      when v_action = 'register' then 'registered'
      when v_action = 'sync' then 'synced'
      else 'pending'
    end;
  end if;

  new.lock_status := v_lock_status;
  new.provider_lock_status := coalesce(
    public.normalize_phone_locker_status_text(new.provider_lock_status),
    v_lock_status
  );
  new.honor_lock_status := coalesce(
    public.normalize_phone_locker_status_text(new.honor_lock_status),
    v_lock_status
  );
  new.final_device_state := coalesce(
    public.normalize_phone_locker_status_text(new.final_device_state),
    v_lock_status
  );
  new.last_known_honor_status := coalesce(
    public.normalize_phone_locker_status_text(new.last_known_honor_status),
    v_lock_status
  );

  return new;
end;
$$;

drop trigger if exists trg_inventory_phone_profiles_normalize_lock_status on public.inventory_phone_profiles;
create trigger trg_inventory_phone_profiles_normalize_lock_status
before insert or update on public.inventory_phone_profiles
for each row execute function public.normalize_inventory_phone_profile_lock_status();

commit;
