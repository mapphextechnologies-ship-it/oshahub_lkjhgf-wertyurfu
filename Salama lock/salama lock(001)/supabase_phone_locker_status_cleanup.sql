-- Cleanup for inventory_phone_profiles lock status values.
-- Run this once in Supabase SQL editor after deploying the code fix.

begin;

with normalized as (
  select
    product_id,
    case
      when lower(coalesce(lock_status, '')) in ('pending', 'synced', 'failed', 'locked', 'unlocked', 'registered') then lower(lock_status)
      when lower(coalesce(honor_lock_status, '')) in ('pending', 'synced', 'failed', 'locked', 'unlocked', 'registered') then lower(honor_lock_status)
      when lower(coalesce(locker_sync_payload->>'honorLockStatus', '')) in ('pending', 'synced', 'failed', 'locked', 'unlocked', 'registered') then lower(locker_sync_payload->>'honorLockStatus')
      when lower(coalesce(locker_sync_payload->>'action', '')) = 'unlock' then 'unlocked'
      when lower(coalesce(locker_sync_payload->>'action', '')) = 'lock' then 'locked'
      when lower(coalesce(locker_sync_payload->>'action', '')) = 'register' then 'registered'
      when lower(coalesce(locker_sync_status, '')) = 'failed' or nullif(trim(coalesce(locker_last_error, '')), '') is not null then 'failed'
      else 'synced'
    end as fixed_lock_status
  from public.inventory_phone_profiles
)
update public.inventory_phone_profiles p
set
  lock_status = n.fixed_lock_status,
  honor_lock_status = case
    when nullif(trim(coalesce(p.honor_lock_status, '')), '') is null then n.fixed_lock_status
    when trim(coalesce(p.honor_lock_status, '')) ~ '^[0-9]+$' then n.fixed_lock_status
    when lower(coalesce(p.honor_lock_status, '')) not in ('pending', 'synced', 'failed', 'locked', 'unlocked', 'registered') then n.fixed_lock_status
    else lower(p.honor_lock_status)
  end,
  updated_at = now()
from normalized n
where p.product_id = n.product_id
  and (
    p.lock_status is null
    or lower(coalesce(p.lock_status, '')) not in ('pending', 'synced', 'failed', 'locked', 'unlocked', 'registered')
    or trim(coalesce(p.lock_status, '')) ~ '^[0-9]+$'
  );

commit;
