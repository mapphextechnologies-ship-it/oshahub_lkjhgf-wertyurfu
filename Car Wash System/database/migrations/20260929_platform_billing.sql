-- Record plan payments confirmed by a platform administrator so billing totals
-- reflect real confirmed transactions instead of estimates from active tenants.
-- carwash.sql revokes CREATE from PUBLIC; explicitly retain it for the
-- Supabase database owner so future owner-run migrations can create objects.
grant usage, create on schema public to postgres;

-- Apply from the Supabase SQL Editor as postgres (or the public schema owner).
-- Keep CREATE unavailable to anon/authenticated; they are application roles.
do $$
begin
  if not has_schema_privilege(current_user, 'public', 'CREATE') then
    raise exception 'Role % cannot create objects in public. Re-run this migration as postgres or the public schema owner.', current_user
      using errcode = '42501';
  end if;
end;
$$;

create table if not exists public.carwash_subscription_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.carwash_tenants(id) on delete restrict,
  subscription_id uuid not null references public.carwash_subscriptions(id) on delete restrict,
  plan_id uuid not null references public.carwash_plans(id) on delete restrict,
  amount_kes numeric(12,2) not null check (amount_kes >= 0),
  method text not null check (method in ('CASH','CARD','M-PESA','BANK TRANSFER')),
  external_reference text,
  confirmed_by uuid not null references auth.users(id),
  paid_at timestamptz not null default now()
);
create index if not exists carwash_subscription_payments_time on public.carwash_subscription_payments(paid_at desc);
alter table public.carwash_subscription_payments enable row level security;
drop policy if exists cw_subscription_payments_read on public.carwash_subscription_payments;
create policy cw_subscription_payments_read on public.carwash_subscription_payments for select
  using (public.carwash_is_platform_admin() or public.carwash_has_tenant_access(tenant_id,array['BUSINESS_ADMIN']));
revoke all on public.carwash_subscription_payments from public,anon,authenticated;
grant select on public.carwash_subscription_payments to authenticated;

drop function if exists public.carwash_activate_tenant_plan(uuid,uuid);
create or replace function public.carwash_activate_tenant_plan(
  target_tenant uuid,
  target_plan uuid,
  payment_method text default 'M-PESA',
  payment_reference text default null
)
returns public.carwash_subscriptions
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare
  plan_row public.carwash_plans%rowtype;
  tenant_row public.carwash_tenants%rowtype;
  subscription_row public.carwash_subscriptions%rowtype;
begin
  if not public.carwash_is_platform_admin() then
    raise exception 'Platform administrator access is required.' using errcode='42501';
  end if;
  perform public.carwash_consume_rate_limit('PLAN_ACTIVATE',60,3600);
  if payment_method not in ('CASH','CARD','M-PESA','BANK TRANSFER') then
    raise exception 'Choose a supported business payment method.' using errcode='22023';
  end if;
  select * into tenant_row from public.carwash_tenants where id=target_tenant for update;
  if not found then raise exception 'Business account not found.' using errcode='P0002'; end if;
  select * into plan_row from public.carwash_plans where id=target_plan and active;
  if not found then raise exception 'Choose an active subscription plan.' using errcode='22023'; end if;
  insert into public.carwash_subscriptions(tenant_id,plan_id,starts_at,ends_at,status,auto_renew)
    values(target_tenant,target_plan,now(),now()+make_interval(days=>plan_row.duration_days),'ACTIVE',false)
    returning * into subscription_row;
  insert into public.carwash_subscription_payments(tenant_id,subscription_id,plan_id,amount_kes,method,external_reference,confirmed_by)
    values(target_tenant,subscription_row.id,target_plan,plan_row.price_kes,payment_method,nullif(trim(payment_reference),''),auth.uid());
  update public.carwash_tenants set status='ACTIVE' where id=target_tenant;
  insert into public.carwash_user_messages(user_id,kind,subject,body,reference_key)
    select m.user_id,'SYSTEM','Business plan activated',
      'Your '||plan_row.name||' plan for '||tenant_row.name||' is active until '||to_char(subscription_row.ends_at at time zone 'Africa/Nairobi','DD Mon YYYY HH24:MI')||'.',
      'PLAN_ACTIVATED:'||subscription_row.id::text
    from public.carwash_memberships m where m.tenant_id=target_tenant and m.status='ACTIVE'
    on conflict (user_id,reference_key) where reference_key is not null do nothing;
  insert into public.carwash_audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,details)
    values(target_tenant,auth.uid(),'TENANT_PLAN_ACTIVATED','SUBSCRIPTION',subscription_row.id::text,
      jsonb_build_object('plan_id',target_plan,'ends_at',subscription_row.ends_at,'amount_kes',plan_row.price_kes,'method',payment_method));
  return subscription_row;
end;
$$;
revoke all on function public.carwash_activate_tenant_plan(uuid,uuid,text,text) from public,anon;
grant execute on function public.carwash_activate_tenant_plan(uuid,uuid,text,text) to authenticated;
