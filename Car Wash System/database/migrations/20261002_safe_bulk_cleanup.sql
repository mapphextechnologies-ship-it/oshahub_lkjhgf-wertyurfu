-- Allow cleanup of request rows without deleting their approved business account.
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
  perform public.carwash_consume_rate_limit('REQUEST_DELETE',30,3600);
  delete from public.carwash_access_requests where id=any(p_request_ids);
  get diagnostics deleted_count=row_count;
  insert into public.carwash_audit_logs(actor_user_id,action,entity_type,details)
    values(auth.uid(),'BUSINESS_REQUESTS_DELETED','ACCESS_REQUEST',jsonb_build_object('deleted_count',deleted_count,'request_ids',to_jsonb(p_request_ids)));
  return deleted_count;
end;
$$;

revoke all on function public.carwash_delete_business_requests(uuid[]) from public,anon;
grant execute on function public.carwash_delete_business_requests(uuid[]) to authenticated;

create or replace function public.carwash_consume_rate_limit(p_action text,p_limit integer,p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare actor_id uuid:=auth.uid(); bucket timestamptz; used_count integer;
begin
  if actor_id is null then raise exception 'Sign in before continuing.' using errcode='42501'; end if;
  if p_action not in ('BUSINESS_REQUEST','BUSINESS_REVIEW','STAFF_INVITE','STAFF_ACCEPT','REQUEST_DELETE','PLAN_ACTIVATE','ADMIN_SETTINGS','ORDER_DELETE','SERVICE_DELETE') or p_limit<1 or p_window_seconds<1 then
    raise exception 'Invalid rate limit.' using errcode='22023';
  end if;
  bucket:=to_timestamp(floor(extract(epoch from clock_timestamp())/p_window_seconds)*p_window_seconds);
  insert into public.carwash_rpc_rate_limits(user_id,action,bucket_start,request_count) values(actor_id,p_action,bucket,1)
    on conflict(user_id,action,bucket_start) do update set request_count=public.carwash_rpc_rate_limits.request_count+1
    returning request_count into used_count;
  if used_count>p_limit then raise exception 'Too many requests. Please wait before trying again.' using errcode='P0001'; end if;
  return true;
end;
$$;
revoke all on function public.carwash_consume_rate_limit(text,integer,integer) from public,anon,authenticated;

-- Only unpaid jobs that have not entered the wash or financial ledger may be deleted.
create or replace function public.carwash_delete_unpaid_orders(target_tenant uuid,p_order_ids uuid[])
returns integer
language plpgsql
security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare deleted_count integer;
begin
  if not public.carwash_has_tenant_access(target_tenant,array['BUSINESS_ADMIN','RECEPTIONIST']) then
    raise exception 'Business administrator or receptionist access is required.' using errcode='42501';
  end if;
  if not public.carwash_can_operate(target_tenant) then
    raise exception 'An active paid workspace is required to delete wash orders.' using errcode='42501';
  end if;
  if coalesce(cardinality(p_order_ids),0)<1 or cardinality(p_order_ids)>100 then
    raise exception 'Select between 1 and 100 wash orders.' using errcode='22023';
  end if;
  perform public.carwash_consume_rate_limit('ORDER_DELETE',30,3600);
  delete from public.carwash_orders o
  where o.tenant_id=target_tenant and o.id=any(p_order_ids)
    and o.status in ('WAITING','ASSIGNED') and o.payment_status='UNPAID'
    and not exists(select 1 from public.carwash_payments p where p.order_id=o.id and p.tenant_id=o.tenant_id)
    and not exists(select 1 from public.carwash_commission_ledger c where c.order_id=o.id and c.tenant_id=o.tenant_id);
  get diagnostics deleted_count=row_count;
  insert into public.carwash_audit_logs(tenant_id,actor_user_id,action,entity_type,details)
    values(target_tenant,auth.uid(),'UNPAID_WASH_ORDERS_DELETED','ORDER',jsonb_build_object('deleted_count',deleted_count,'order_ids',to_jsonb(p_order_ids)));
  return deleted_count;
end;
$$;

revoke all on function public.carwash_delete_unpaid_orders(uuid,uuid[]) from public,anon;
grant execute on function public.carwash_delete_unpaid_orders(uuid,uuid[]) to authenticated;

-- Services referenced by past orders stay in the service catalogue history.
create or replace function public.carwash_delete_unused_services(target_tenant uuid,p_service_ids uuid[])
returns integer
language plpgsql
security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare deleted_count integer;
begin
  if not public.carwash_has_tenant_access(target_tenant,array['BUSINESS_ADMIN']) then
    raise exception 'Business administrator access is required.' using errcode='42501';
  end if;
  if not public.carwash_can_operate(target_tenant) then
    raise exception 'An active paid workspace is required to delete services.' using errcode='42501';
  end if;
  if coalesce(cardinality(p_service_ids),0)<1 or cardinality(p_service_ids)>100 then
    raise exception 'Select between 1 and 100 services.' using errcode='22023';
  end if;
  perform public.carwash_consume_rate_limit('SERVICE_DELETE',30,3600);
  delete from public.carwash_services s
  where s.tenant_id=target_tenant and s.id=any(p_service_ids)
    and not exists(select 1 from public.carwash_order_services os where os.service_id=s.id and os.tenant_id=s.tenant_id);
  get diagnostics deleted_count=row_count;
  insert into public.carwash_audit_logs(tenant_id,actor_user_id,action,entity_type,details)
    values(target_tenant,auth.uid(),'UNUSED_SERVICES_DELETED','SERVICE',jsonb_build_object('deleted_count',deleted_count,'service_ids',to_jsonb(p_service_ids)));
  return deleted_count;
end;
$$;

revoke all on function public.carwash_delete_unused_services(uuid,uuid[]) from public,anon;
grant execute on function public.carwash_delete_unused_services(uuid,uuid[]) to authenticated;

notify pgrst,'reload schema';
