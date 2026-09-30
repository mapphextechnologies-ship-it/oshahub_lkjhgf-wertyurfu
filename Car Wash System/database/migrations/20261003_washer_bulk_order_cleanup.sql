-- Allow washers to remove only their own unstarted, unpaid wash orders.
-- Business administrators and receptionists retain their existing bulk cleanup access.
create or replace function public.carwash_delete_unpaid_orders(target_tenant uuid,p_order_ids uuid[])
returns integer
language plpgsql
security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare deleted_count integer;
begin
  if not public.carwash_has_tenant_access(target_tenant,array['BUSINESS_ADMIN','RECEPTIONIST','WASHER']) then
    raise exception 'Active workspace staff access is required.' using errcode='42501';
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
    and not exists(select 1 from public.carwash_commission_ledger c where c.order_id=o.id and c.tenant_id=o.tenant_id)
    and (
      public.carwash_has_tenant_access(target_tenant,array['BUSINESS_ADMIN','RECEPTIONIST'])
      or public.carwash_is_assigned_worker(o.id,target_tenant)
    );
  get diagnostics deleted_count=row_count;
  insert into public.carwash_audit_logs(tenant_id,actor_user_id,action,entity_type,details)
    values(target_tenant,auth.uid(),'UNPAID_WASH_ORDERS_DELETED','ORDER',jsonb_build_object('deleted_count',deleted_count,'order_ids',to_jsonb(p_order_ids)));
  return deleted_count;
end;
$$;

revoke all on function public.carwash_delete_unpaid_orders(uuid,uuid[]) from public,anon;
grant execute on function public.carwash_delete_unpaid_orders(uuid,uuid[]) to authenticated;
notify pgrst, 'reload schema';
