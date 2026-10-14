-- Allow one customer-requested extension per tenant, while keeping direct
-- Super Admin trial grants available as an administrative override.

alter table public.carwash_tenants
  add column if not exists trial_extension_used_at timestamptz;

-- Preserve extension grants that happened before this marker was introduced.
update public.carwash_tenants t
set trial_extension_used_at = coalesce(t.trial_extension_used_at, history.used_at)
from (
  select tenant_id, max(granted_at) as used_at
  from (
    select r.tenant_id, coalesce(r.reviewed_at, r.created_at) as granted_at
    from public.carwash_billing_requests r
    where r.request_type = 'TRIAL_EXTENSION' and r.status = 'APPROVED'
    union all
    select (a.details->>'tenant_id')::uuid as tenant_id,
      coalesce(nullif(a.details->>'new_starts_at','')::timestamptz, a.created_at) as granted_at
    from public.carwash_audit_logs a
    where a.action = 'TRIAL_GRANTED' and a.details ? 'tenant_id'
  ) grants
  group by tenant_id
) history
where t.id = history.tenant_id;

create or replace function public.carwash_guard_one_trial_extension()
returns trigger
language plpgsql security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare
  extension_used_at timestamptz;
  should_check boolean := false;
begin
  if new.request_type <> 'TRIAL_EXTENSION' then return new; end if;
  if tg_op = 'INSERT' then
    should_check := new.status in ('PENDING','APPROVED');
  elsif tg_op = 'UPDATE' then
    should_check := new.status = 'APPROVED' and old.status is distinct from new.status;
  end if;
  if not should_check then return new; end if;

  select t.trial_extension_used_at into extension_used_at
  from public.carwash_tenants t where t.id = new.tenant_id for update;
  if extension_used_at is not null or exists (
    select 1 from public.carwash_billing_requests r
    where r.tenant_id = new.tenant_id and r.request_type = 'TRIAL_EXTENSION'
      and r.status = 'APPROVED' and r.id <> new.id
  ) then
    raise exception 'This business has already used its one-time extra 7-day trial.'
      using errcode='22023';
  end if;
  return new;
end;
$$;

create or replace function public.carwash_mark_trial_extension_used()
returns trigger
language plpgsql security definer
set search_path=pg_catalog,public,pg_temp
as $$
begin
  if tg_table_name = 'carwash_billing_requests' then
    if tg_op = 'INSERT' and new.request_type = 'TRIAL_EXTENSION' and new.status = 'APPROVED' then
      update public.carwash_tenants
      set trial_extension_used_at = coalesce(trial_extension_used_at, new.reviewed_at, now())
      where id = new.tenant_id;
    elsif tg_op = 'UPDATE' and new.request_type = 'TRIAL_EXTENSION' and new.status = 'APPROVED'
      and old.status is distinct from new.status then
      update public.carwash_tenants
      set trial_extension_used_at = coalesce(trial_extension_used_at, new.reviewed_at, now())
      where id = new.tenant_id;
    end if;
  elsif tg_table_name = 'carwash_subscriptions' and new.status = 'TRIAL' then
    -- The first trial is created without a previous subscription. A later
    -- Super Admin trial grant is an override and consumes the customer's one
    -- extension entitlement, but the admin grant itself remains unrestricted.
    if exists (
      select 1 from public.carwash_subscriptions s
      where s.tenant_id = new.tenant_id and s.id <> new.id
    ) then
      update public.carwash_tenants
      set trial_extension_used_at = coalesce(trial_extension_used_at, new.starts_at, now())
      where id = new.tenant_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists carwash_guard_one_trial_extension on public.carwash_billing_requests;
create trigger carwash_guard_one_trial_extension
before insert or update of status on public.carwash_billing_requests
for each row execute function public.carwash_guard_one_trial_extension();

drop trigger if exists carwash_mark_extension_from_request on public.carwash_billing_requests;
create trigger carwash_mark_extension_from_request
after insert or update of status on public.carwash_billing_requests
for each row execute function public.carwash_mark_trial_extension_used();

drop trigger if exists carwash_mark_extension_from_admin_trial on public.carwash_subscriptions;
create trigger carwash_mark_extension_from_admin_trial
after insert on public.carwash_subscriptions
for each row execute function public.carwash_mark_trial_extension_used();

revoke all on function public.carwash_guard_one_trial_extension() from public,anon,authenticated;
revoke all on function public.carwash_mark_trial_extension_used() from public,anon,authenticated;

notify pgrst,'reload schema';
