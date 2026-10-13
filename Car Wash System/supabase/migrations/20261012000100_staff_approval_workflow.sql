-- Staff invitations register as pending memberships. A business admin activates them
-- from the tenant Staff screen after reviewing the new team member.
create or replace function public.carwash_accept_staff_invitation(invite_token text,staff_name text)
returns public.carwash_memberships
language plpgsql security definer
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
    where token_hash=encode(digest(invite_token,'sha256'),'hex')
      and ((status='PENDING' and expires_at>now()) or (status='ACCEPTED' and accepted_by=auth.uid())) for update;
  if not found then raise exception 'This staff invitation has expired or was already used.' using errcode='P0002'; end if;
  if invite.status='ACCEPTED' then
    select * into result from public.carwash_memberships where user_id=auth.uid() and tenant_id=invite.tenant_id;
    if found and result.role=invite.role then return result; end if;
    raise exception 'This staff invitation has already been used.' using errcode='P0002';
  end if;

  select * into result from public.carwash_memberships where user_id=auth.uid() and tenant_id=invite.tenant_id for update;
  if found then
    if result.role<>invite.role then raise exception 'This account already has a different role in this business.' using errcode='23505'; end if;
    update public.carwash_memberships
      set full_name=trim(staff_name),phone=invite.phone,
          status=case when result.status='ACTIVE' then 'ACTIVE' else 'PENDING' end
      where id=result.id returning * into result;
  else
    insert into public.carwash_memberships(user_id,tenant_id,role,full_name,phone,status)
      values(auth.uid(),invite.tenant_id,invite.role,trim(staff_name),invite.phone,'PENDING') returning * into result;
  end if;

  update public.carwash_staff_invitations set status='ACCEPTED',accepted_by=auth.uid(),accepted_at=now() where id=invite.id;
  if result.status='PENDING' then
    insert into public.carwash_user_messages(user_id,kind,subject,body,reference_key)
      values(auth.uid(),'ACCOUNT_PENDING','Wait for business approval',
        'Your registration is complete. The business must approve your '||replace(invite.role,'_',' ')||' account before you can sign in.',
        'STAFF_APPROVAL_PENDING:'||invite.id::text);
    insert into public.carwash_user_messages(user_id,kind,subject,body,reference_key)
      select m.user_id,'SYSTEM','Staff account awaiting approval',
        trim(staff_name)||' registered for the '||replace(invite.role,'_',' ')||' role. Review this request in your Staff workspace.',
        'STAFF_APPROVAL_REVIEW:'||invite.id::text
      from public.carwash_memberships m
      where m.tenant_id=invite.tenant_id and m.role='BUSINESS_ADMIN' and m.status='ACTIVE'
      on conflict(user_id,reference_key) where reference_key is not null do nothing;
  else
    insert into public.carwash_user_messages(user_id,kind,subject,body,reference_key)
      values(auth.uid(),'ACCOUNT_APPROVED','Your staff account is active',
        'Your '||replace(invite.role,'_',' ')||' account is already active. Sign in to open your OshaHub workspace.',
        'STAFF_INVITATION_ACTIVE:'||invite.id::text);
  end if;
  insert into public.carwash_audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,details)
    values(invite.tenant_id,auth.uid(),'STAFF_INVITATION_REGISTERED','STAFF_INVITATION',invite.id::text,jsonb_build_object('role',invite.role,'membership_status',result.status));
  return result;
end;
$$;
revoke all on function public.carwash_accept_staff_invitation(text,text) from public,anon;
grant execute on function public.carwash_accept_staff_invitation(text,text) to authenticated;

create or replace function public.carwash_update_staff_status(target_membership uuid,next_status text)
returns public.carwash_memberships language plpgsql security definer set search_path=pg_catalog,public as $$
declare staff_row public.carwash_memberships%rowtype; actor public.carwash_memberships%rowtype; previous_status text;
begin
  if next_status not in ('ACTIVE','SUSPENDED') then raise exception 'Choose a valid team status.' using errcode='22023'; end if;
  select * into staff_row from public.carwash_memberships where id=target_membership for update;
  if not found then raise exception 'Team member not found.' using errcode='P0002'; end if;
  select * into actor from public.carwash_memberships where user_id=auth.uid() and tenant_id=staff_row.tenant_id and role='BUSINESS_ADMIN' and status='ACTIVE' limit 1;
  if not found or not public.carwash_can_operate(staff_row.tenant_id) then raise exception 'Active business administrator access is required.' using errcode='42501'; end if;
  if staff_row.role not in ('RECEPTIONIST','WASHER') then raise exception 'Only invited team accounts can be changed here.' using errcode='42501'; end if;
  previous_status:=staff_row.status;
  update public.carwash_memberships set status=next_status where id=target_membership returning * into staff_row;
  if previous_status='PENDING' and next_status='ACTIVE' then
    insert into public.carwash_user_messages(user_id,kind,subject,body,reference_key)
      values(staff_row.user_id,'ACCOUNT_APPROVED','Your staff account is approved',
        'The business approved your '||replace(staff_row.role,'_',' ')||' account. You can now sign in to your OshaHub workspace.',
        'STAFF_APPROVED:'||staff_row.id::text)
      on conflict(user_id,reference_key) where reference_key is not null do nothing;
  end if;
  insert into public.carwash_audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,details)
    values(staff_row.tenant_id,auth.uid(),'STAFF_STATUS_CHANGED','MEMBERSHIP',staff_row.id::text,jsonb_build_object('status',next_status));
  return staff_row;
end;
$$;
revoke all on function public.carwash_update_staff_status(uuid,text) from public,anon;
grant execute on function public.carwash_update_staff_status(uuid,text) to authenticated;
notify pgrst,'reload schema';
