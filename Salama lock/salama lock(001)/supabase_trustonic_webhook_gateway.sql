begin;

create extension if not exists pgcrypto;

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

create table if not exists public.scheduler_locks (
  lock_name text primary key,
  holder_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  locked_at timestamptz not null default now(),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_scheduler_locks_expires_at on public.scheduler_locks (expires_at);

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

alter table public.scheduler_locks enable row level security;
revoke all on table public.scheduler_locks from anon, authenticated;
revoke all on function public.claim_scheduler_lock(text, text, integer, jsonb) from public, anon, authenticated;
revoke all on function public.release_scheduler_lock(text, text) from public, anon, authenticated;
grant all on table public.scheduler_locks to service_role;
grant execute on function public.claim_scheduler_lock(text, text, integer, jsonb) to service_role;
grant execute on function public.release_scheduler_lock(text, text) to service_role;

commit;
