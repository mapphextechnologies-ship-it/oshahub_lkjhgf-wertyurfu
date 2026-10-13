-- Make staff invitations idempotent for a user who already belongs to the invited business.
-- The invitation token selects the exact tenant, even when the user belongs to other businesses.
create or replace function public.carwash_accept_staff_invitation(invite_token text,staff_name text)
returns public.carwash_memberships
language plpgsql
security definer
set search_path=pg_catalog,extensions,public,pg_temp
as $$
declare
  invite public.carwash_staff_invitations%rowtype;
  result public.carwash_memberships%rowtype;
  verified_at timestamptz;
begin
  if auth.uid() is null then raise exception 'Sign in before accepting an invitation.' using errcode='42501'; end if;
  perform public.carwash_consume_rate_limit('STAFF_ACCEPT',10,3600);
  if length(trim(coalesce(staff_name,''))) not between 2 and 120 or invite_token !~ '^[0-9a-fA-F]{64}$' then
    raise exception 'This staff invitation is invalid.' using errcode='22023';
  end if;
  select email_confirmed_at into verified_at from auth.users where id=auth.uid();
  if verified_at is null then raise exception 'Verify your email before accepting the staff invitation.' using errcode='42501'; end if;
  select * into invite from public.carwash_staff_invitations
  where token_hash=encode(digest(invite_token,'sha256'),'hex') and status='PENDING' and expires_at>now()
  for update;
  if not found then raise exception 'This staff invitation has expired or was already used.' using errcode='P0002'; end if;

  select * into result from public.carwash_memberships
  where user_id=auth.uid() and tenant_id=invite.tenant_id for update;
  if found then
    if result.role<>invite.role then
      raise exception 'This account already has a different role in this business.' using errcode='23505';
    end if;
    update public.carwash_memberships
    set full_name=trim(staff_name),phone=invite.phone,status='ACTIVE'
    where id=result.id returning * into result;
  else
    insert into public.carwash_memberships(user_id,tenant_id,role,full_name,phone,status)
    values(auth.uid(),invite.tenant_id,invite.role,trim(staff_name),invite.phone,'ACTIVE') returning * into result;
  end if;

  update public.carwash_staff_invitations
  set status='ACCEPTED',accepted_by=auth.uid(),accepted_at=now() where id=invite.id;
  insert into public.carwash_user_messages(user_id,kind,subject,body)
  values(auth.uid(),'ACCOUNT_APPROVED','Your staff account is active',
    'Your '||replace(invite.role,'_',' ')||' account at '||(select name from public.carwash_tenants where id=invite.tenant_id)||' is now active. Sign in to open that OshaHub workspace.');
  insert into public.carwash_audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,details)
  values(invite.tenant_id,auth.uid(),'STAFF_INVITATION_ACCEPTED','STAFF_INVITATION',invite.id::text,jsonb_build_object('role',invite.role));
  return result;
end;
$$;

revoke all on function public.carwash_accept_staff_invitation(text,text) from public,anon;
grant execute on function public.carwash_accept_staff_invitation(text,text) to authenticated;
notify pgrst, 'reload schema';
