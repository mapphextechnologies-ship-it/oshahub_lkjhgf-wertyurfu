-- Starter workspaces include one receptionist and three washers (four staff total).
-- Store the role-specific caps in the plan so invitations can enforce them server-side.
update public.carwash_plans
set feature_flags = coalesce(feature_flags, '{}'::jsonb) || jsonb_build_object(
  'staff', 4,
  'receptionists', 1,
  'washers', 3,
  'description', '1 receptionist, 3 washers; core operations and washer app'
)
where name = 'Starter'
   or feature_flags->>'tier' = 'Starter'
   or name like 'Starter · %';

create or replace function public.carwash_create_staff_invite(
  target_tenant uuid,
  target_phone text,
  target_role text
)
returns text
language plpgsql
security definer
set search_path=pg_catalog,extensions,public,pg_temp
as $$
declare
  actor public.carwash_memberships%rowtype;
  plan_features jsonb := '{}'::jsonb;
  raw_token text;
  normalized_phone text;
  digits text;
  role_limit integer;
  staff_limit integer;
  role_count integer;
  staff_count integer;
begin
  select * into actor
  from public.carwash_memberships
  where user_id=auth.uid() and tenant_id=target_tenant
    and role='BUSINESS_ADMIN' and status='ACTIVE'
  limit 1;
  if not found or not public.carwash_can_operate(target_tenant) then
    raise exception 'Active business administrator access is required.' using errcode='42501';
  end if;

  perform public.carwash_consume_rate_limit('STAFF_INVITE',10,3600);
  digits:=regexp_replace(coalesce(target_phone,''),'[^0-9]','','g');
  if digits ~ '^254[17][0-9]{8}$' then digits:='0'||substr(digits,4); end if;
  if digits !~ '^0[17][0-9]{8}$' then
    raise exception 'Enter a valid Kenyan mobile number beginning with 01 or 07.' using errcode='22023';
  end if;
  normalized_phone:=digits;
  if target_role is null or target_role not in ('RECEPTIONIST','WASHER') then
    raise exception 'Choose a staff portal managed by the business.' using errcode='22023';
  end if;

  -- Serialize invitations per tenant so two concurrent requests cannot exceed a cap.
  perform 1 from public.carwash_tenants where id=target_tenant for update;
  if not found then raise exception 'Business account not found.' using errcode='P0002'; end if;

  select coalesce(p.feature_flags, '{}'::jsonb) into plan_features
  from public.carwash_subscriptions s
  join public.carwash_plans p on p.id=s.plan_id
  where s.tenant_id=target_tenant
  order by s.starts_at desc, s.created_at desc
  limit 1;

  staff_limit:=coalesce(nullif(plan_features->>'staff','')::integer,-1);
  role_limit:=case target_role
    when 'RECEPTIONIST' then coalesce(nullif(plan_features->>'receptionists','')::integer,-1)
    when 'WASHER' then coalesce(nullif(plan_features->>'washers','')::integer,-1)
  end;

  select
    count(*) filter (where m.role=target_role)::integer,
    count(*)::integer
  into role_count, staff_count
  from public.carwash_memberships m
  where m.tenant_id=target_tenant
    and m.role in ('RECEPTIONIST','WASHER')
    and m.status in ('ACTIVE','PENDING');

  select role_count + count(*)::integer
  into role_count
  from public.carwash_staff_invitations i
  where i.tenant_id=target_tenant and i.role=target_role
    and i.status='PENDING' and i.expires_at>now();

  select staff_count + count(*)::integer
  into staff_count
  from public.carwash_staff_invitations i
  where i.tenant_id=target_tenant and i.role in ('RECEPTIONIST','WASHER')
    and i.status='PENDING' and i.expires_at>now();

  if role_limit >= 0 and role_count >= role_limit then
    raise exception 'This plan allows up to % % account(s). Change the business plan to add more.',
      role_limit, case target_role when 'RECEPTIONIST' then 'receptionist' else 'washer' end
      using errcode='22023';
  end if;
  if staff_limit >= 0 and staff_count >= staff_limit then
    raise exception 'This plan allows up to % team accounts. Change the business plan to add more.', staff_limit
      using errcode='22023';
  end if;

  raw_token:=encode(gen_random_bytes(32),'hex');
  insert into public.carwash_staff_invitations(tenant_id,invited_by,phone,role,token_hash)
    values(target_tenant,actor.id,normalized_phone,target_role,encode(digest(raw_token,'sha256'),'hex'));
  insert into public.carwash_audit_logs(tenant_id,actor_user_id,action,entity_type,details)
    values(target_tenant,auth.uid(),'STAFF_INVITATION_CREATED','STAFF_INVITATION',
      jsonb_build_object('phone',normalized_phone,'role',target_role));
  return raw_token;
end;
$$;

revoke all on function public.carwash_create_staff_invite(uuid,text,text) from public,anon;
grant execute on function public.carwash_create_staff_invite(uuid,text,text) to authenticated;

notify pgrst,'reload schema';
