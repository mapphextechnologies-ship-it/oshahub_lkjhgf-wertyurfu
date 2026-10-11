-- Allow Super Admin to delete plans only while no subscription, payment, or billing request references them.
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

revoke all on function public.carwash_delete_unused_plans(uuid[]) from public,anon;
grant execute on function public.carwash_delete_unused_plans(uuid[]) to authenticated;
notify pgrst, 'reload schema';
