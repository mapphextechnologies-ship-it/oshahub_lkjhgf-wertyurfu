-- Provide explicit, audited Super Admin mutations for tenant and plan records.
create or replace function public.carwash_update_platform_tenant(
  target_tenant uuid,
  p_name text,
  p_owner_name text,
  p_status text
)
returns public.carwash_tenants
language plpgsql
security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare tenant_row public.carwash_tenants%rowtype;
begin
  if not public.carwash_is_platform_admin() then
    raise exception 'Platform administrator access is required.' using errcode='42501';
  end if;
  if length(trim(coalesce(p_name,''))) not between 2 and 120
    or length(trim(coalesce(p_owner_name,''))) not between 2 and 120
    or p_status not in ('TRIAL','ACTIVE','EXPIRING SOON','EXPIRED','SUSPENDED','CANCELLED') then
    raise exception 'Check the business name, owner name and access status.' using errcode='22023';
  end if;

  update public.carwash_tenants
  set name=trim(p_name),owner_name=trim(p_owner_name),status=p_status
  where id=target_tenant
  returning * into tenant_row;
  if not found then
    raise exception 'Business not found.' using errcode='P0002';
  end if;

  insert into public.carwash_audit_logs(actor_user_id,action,entity_type,entity_id,details)
  values(auth.uid(),'PLATFORM_TENANT_UPDATED','TENANT',tenant_row.id::text,
    jsonb_build_object('name',tenant_row.name,'owner_name',tenant_row.owner_name,'status',tenant_row.status));
  return tenant_row;
end;
$$;

create or replace function public.carwash_update_platform_plan(
  target_plan uuid,
  p_name text,
  p_price_kes numeric,
  p_duration_days integer,
  p_feature_flags jsonb
)
returns public.carwash_plans
language plpgsql
security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare plan_row public.carwash_plans%rowtype;
begin
  if not public.carwash_is_platform_admin() then
    raise exception 'Platform administrator access is required.' using errcode='42501';
  end if;
  if length(trim(coalesce(p_name,''))) not between 2 and 120
    or p_price_kes is null or p_price_kes<0
    or p_duration_days is null or p_duration_days<1
    or jsonb_typeof(coalesce(p_feature_flags,'{}'::jsonb))<>'object' then
    raise exception 'Check the plan name, price, duration and features.' using errcode='22023';
  end if;

  update public.carwash_plans
  set name=trim(p_name),price_kes=p_price_kes,duration_days=p_duration_days,feature_flags=p_feature_flags
  where id=target_plan
  returning * into plan_row;
  if not found then
    raise exception 'Plan not found.' using errcode='P0002';
  end if;

  insert into public.carwash_audit_logs(actor_user_id,action,entity_type,entity_id,details)
  values(auth.uid(),'PLATFORM_PLAN_UPDATED','PLAN',plan_row.id::text,
    jsonb_build_object('name',plan_row.name,'price_kes',plan_row.price_kes,'duration_days',plan_row.duration_days,'feature_flags',plan_row.feature_flags));
  return plan_row;
end;
$$;

-- Keep deleting requests separate from approved tenant records.
create or replace function public.carwash_delete_business_requests(p_request_ids uuid[])
returns integer
language plpgsql
security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare deleted_count integer;
begin
  if not public.carwash_is_platform_admin() then
    raise exception 'Platform administrator access is required.' using errcode='42501';
  end if;
  if coalesce(cardinality(p_request_ids),0)<1 or cardinality(p_request_ids)>250 then
    raise exception 'Select between 1 and 250 requests.' using errcode='22023';
  end if;
  delete from public.carwash_access_requests where id=any(p_request_ids);
  get diagnostics deleted_count=row_count;
  insert into public.carwash_audit_logs(actor_user_id,action,entity_type,details)
  values(auth.uid(),'BUSINESS_REQUESTS_DELETED','ACCESS_REQUEST',jsonb_build_object('deleted_count',deleted_count,'request_ids',to_jsonb(p_request_ids)));
  return deleted_count;
end;
$$;

create or replace function public.carwash_delete_unused_plans(p_plan_ids uuid[])
returns integer
language plpgsql
security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare deleted_count integer;
begin
  if not public.carwash_is_platform_admin() then
    raise exception 'Platform administrator access is required.' using errcode='42501';
  end if;
  if coalesce(cardinality(p_plan_ids),0)<1 or cardinality(p_plan_ids)>100 then
    raise exception 'Select between 1 and 100 plans.' using errcode='22023';
  end if;
  delete from public.carwash_plans p
  where p.id=any(p_plan_ids)
    and not exists(select 1 from public.carwash_subscriptions s where s.plan_id=p.id)
    and not exists(select 1 from public.carwash_subscription_payments sp where sp.plan_id=p.id)
    and not exists(select 1 from public.carwash_billing_requests br where br.plan_id=p.id);
  get diagnostics deleted_count=row_count;
  insert into public.carwash_audit_logs(actor_user_id,action,entity_type,details)
  values(auth.uid(),'UNUSED_PLANS_DELETED','PLAN',jsonb_build_object('deleted_count',deleted_count,'plan_ids',to_jsonb(p_plan_ids)));
  return deleted_count;
end;
$$;

revoke all on function public.carwash_update_platform_tenant(uuid,text,text,text) from public,anon;
revoke all on function public.carwash_update_platform_plan(uuid,text,numeric,integer,jsonb) from public,anon;
revoke all on function public.carwash_delete_business_requests(uuid[]) from public,anon;
revoke all on function public.carwash_delete_unused_plans(uuid[]) from public,anon;
grant execute on function public.carwash_update_platform_tenant(uuid,text,text,text) to authenticated;
grant execute on function public.carwash_update_platform_plan(uuid,text,numeric,integer,jsonb) to authenticated;
grant execute on function public.carwash_delete_business_requests(uuid[]) to authenticated;
grant execute on function public.carwash_delete_unused_plans(uuid[]) to authenticated;
notify pgrst,'reload schema';
