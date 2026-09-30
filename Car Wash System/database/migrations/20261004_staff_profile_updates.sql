-- Permit business administrators to update staff display names and branches.
-- Role, authentication identity and audit history remain protected.
create or replace function public.carwash_update_staff_profile(target_membership uuid,p_full_name text,p_branch text)
returns public.carwash_memberships
language plpgsql
security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare staff_row public.carwash_memberships%rowtype; actor public.carwash_memberships%rowtype;
begin
  select * into staff_row from public.carwash_memberships where id=target_membership for update;
  if not found then raise exception 'Team member not found.' using errcode='P0002'; end if;
  select * into actor from public.carwash_memberships
  where user_id=auth.uid() and tenant_id=staff_row.tenant_id and role='BUSINESS_ADMIN' and status='ACTIVE'
  limit 1;
  if not found or not public.carwash_can_operate(staff_row.tenant_id) then
    raise exception 'Active business administrator access is required.' using errcode='42501';
  end if;
  if staff_row.role not in ('RECEPTIONIST','WASHER') then
    raise exception 'Only reception and washer profiles can be edited here.' using errcode='42501';
  end if;
  if length(trim(coalesce(p_full_name,''))) not between 2 and 120
    or length(trim(coalesce(p_branch,''))) not between 2 and 120 then
    raise exception 'Enter a valid team member name and branch.' using errcode='22023';
  end if;
  update public.carwash_memberships
  set full_name=trim(p_full_name),branch=trim(p_branch)
  where id=target_membership returning * into staff_row;
  insert into public.carwash_audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,details)
  values(staff_row.tenant_id,auth.uid(),'STAFF_PROFILE_UPDATED','MEMBERSHIP',staff_row.id::text,
    jsonb_build_object('full_name',staff_row.full_name,'branch',staff_row.branch));
  return staff_row;
end;
$$;

revoke all on function public.carwash_update_staff_profile(uuid,text,text) from public,anon;
grant execute on function public.carwash_update_staff_profile(uuid,text,text) to authenticated;
notify pgrst, 'reload schema';
