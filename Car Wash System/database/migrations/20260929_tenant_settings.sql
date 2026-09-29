-- Apply this migration to an existing OshaHub Carwash Supabase project.
-- The full database/carwash.sql also includes these changes.
alter table public.carwash_tenants
  add column if not exists settings jsonb not null
  default '{"branch":"Main branch","loyaltyRate":1}'::jsonb;

create or replace function public.carwash_update_tenant_settings(
  target_tenant uuid,
  p_business_name text,
  p_branch text,
  p_loyalty_rate numeric
)
returns public.carwash_tenants
language plpgsql
security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare
  actor public.carwash_memberships%rowtype;
  tenant_row public.carwash_tenants%rowtype;
begin
  select * into actor
  from public.carwash_memberships
  where user_id=auth.uid()
    and tenant_id=target_tenant
    and role='BUSINESS_ADMIN'
    and status='ACTIVE'
  limit 1;

  if not found or not public.carwash_can_operate(target_tenant) then
    raise exception 'Active business administrator access is required.' using errcode='42501';
  end if;
  if length(trim(coalesce(p_business_name,''))) not between 2 and 120
    or length(trim(coalesce(p_branch,''))) not between 2 and 120
    or p_loyalty_rate<0 or p_loyalty_rate>100 then
    raise exception 'Enter a valid business name, branch and loyalty rate.' using errcode='22023';
  end if;

  update public.carwash_tenants
  set name=trim(p_business_name),
      settings=jsonb_build_object('branch',trim(p_branch),'loyaltyRate',p_loyalty_rate)
  where id=target_tenant
  returning * into tenant_row;

  insert into public.carwash_audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,details)
  values(target_tenant,auth.uid(),'TENANT_SETTINGS_UPDATED','TENANT',target_tenant::text,tenant_row.settings);
  return tenant_row;
end;
$$;

revoke all on function public.carwash_update_tenant_settings(uuid,text,text,numeric) from public,anon;
grant execute on function public.carwash_update_tenant_settings(uuid,text,text,numeric) to authenticated;
notify pgrst, 'reload schema';
