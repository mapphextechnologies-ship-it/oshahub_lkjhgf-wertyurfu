-- Scheduler lock repair migration.
-- Run this on deployed databases to remove the legacy overload and recreate
-- the canonical lock functions with unambiguous column references.

drop function if exists public.claim_scheduler_lock(text, text, jsonb, integer);

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
