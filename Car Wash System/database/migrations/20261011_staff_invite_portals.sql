-- Restore the staff invite RPC on existing Supabase projects and store Kenyan mobile numbers locally.
create or replace function public.carwash_create_staff_invite(target_tenant uuid,target_phone text,target_role text)
returns text language plpgsql security definer set search_path=pg_catalog,extensions,public,pg_temp as $$
declare actor public.carwash_memberships%rowtype; raw_token text; normalized_phone text; digits text;
begin
  select * into actor from public.carwash_memberships where user_id=auth.uid() and tenant_id=target_tenant and role='BUSINESS_ADMIN' and status='ACTIVE' limit 1;
  if not found or not public.carwash_can_operate(target_tenant) then raise exception 'Active business administrator access is required.' using errcode='42501'; end if;
  perform public.carwash_consume_rate_limit('STAFF_INVITE',10,3600);
  digits:=regexp_replace(coalesce(target_phone,''),'[^0-9]','','g');
  if digits ~ '^2547[0-9]{8}$' then digits:='0'||substr(digits,4); end if;
  if digits !~ '^07[0-9]{8}$' then raise exception 'Enter a valid Kenyan mobile number beginning with 07.' using errcode='22023'; end if;
  normalized_phone:=digits;
  if target_role is null or target_role not in ('RECEPTIONIST','WASHER') then raise exception 'Choose a staff portal managed by the business.' using errcode='22023'; end if;
  raw_token:=encode(gen_random_bytes(32),'hex');
  insert into public.carwash_staff_invitations(tenant_id,invited_by,phone,role,token_hash)
    values(target_tenant,actor.id,normalized_phone,target_role,encode(digest(raw_token,'sha256'),'hex'));
  insert into public.carwash_audit_logs(tenant_id,actor_user_id,action,entity_type,details)
    values(target_tenant,auth.uid(),'STAFF_INVITATION_CREATED','STAFF_INVITATION',jsonb_build_object('phone',normalized_phone,'role',target_role));
  return raw_token;
end;
$$;
revoke all on function public.carwash_create_staff_invite(uuid,text,text) from public,anon;
grant execute on function public.carwash_create_staff_invite(uuid,text,text) to authenticated;
