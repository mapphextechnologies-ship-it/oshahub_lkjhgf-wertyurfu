-- Let each active workspace member update only their own profile fields.
create or replace function public.carwash_update_own_profile(
  target_membership uuid,
  p_full_name text,
  p_phone text,
  p_branch text
)
returns public.carwash_memberships
language plpgsql
security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare membership_row public.carwash_memberships%rowtype;
begin
  select * into membership_row
  from public.carwash_memberships
  where id=target_membership
    and user_id=auth.uid()
    and tenant_id is not null
    and role in ('BUSINESS_ADMIN','RECEPTIONIST','WASHER')
    and status='ACTIVE'
  for update;
  if not found then
    raise exception 'An active workspace membership is required.' using errcode='42501';
  end if;
  if length(trim(coalesce(p_full_name,''))) not between 2 and 120
    or length(trim(coalesce(p_branch,''))) not between 2 and 120
    or (nullif(trim(coalesce(p_phone,'')),'') is not null
      and length(trim(p_phone)) not between 7 and 30) then
    raise exception 'Enter a valid name, phone number and branch.' using errcode='22023';
  end if;

  update public.carwash_memberships
  set full_name=trim(p_full_name),
      phone=nullif(trim(coalesce(p_phone,'')),''),
      branch=trim(p_branch)
  where id=membership_row.id
  returning * into membership_row;

  insert into public.carwash_audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,details)
  values(membership_row.tenant_id,auth.uid(),'OWN_PROFILE_UPDATED','MEMBERSHIP',membership_row.id::text,
    jsonb_build_object('full_name',membership_row.full_name,'phone',membership_row.phone,'branch',membership_row.branch));
  return membership_row;
end;
$$;

revoke all on function public.carwash_update_own_profile(uuid,text,text,text) from public,anon;
grant execute on function public.carwash_update_own_profile(uuid,text,text,text) to authenticated;
notify pgrst,'reload schema';
