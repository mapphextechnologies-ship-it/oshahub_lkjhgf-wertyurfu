-- Repair trial renewal and billing request lifecycle, and make platform deletes recoverable.

alter table public.carwash_access_requests
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null;

alter table public.carwash_plans
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null;

-- A trial request can be submitted again after an earlier request is resolved.
drop index if exists public.carwash_billing_trial_extension_once;

drop policy if exists cw_access_requests_read on public.carwash_access_requests;
create policy cw_access_requests_read on public.carwash_access_requests for select
  using (deleted_at is null and (user_id=auth.uid() or public.carwash_is_platform_admin()));

drop policy if exists cw_plans_read on public.carwash_plans;
create policy cw_plans_read on public.carwash_plans for select
  using (deleted_at is null and (active or public.carwash_is_platform_admin()));

-- Audit rows are append-only. All writers are security-definer database workflows.
drop policy if exists cw_audit_insert on public.carwash_audit_logs;
revoke insert,update,delete on public.carwash_audit_logs from public,anon,authenticated;
grant select on public.carwash_audit_logs to authenticated;

create or replace function public.carwash_request_billing_action(
  p_request_type text,p_plan_id uuid default null,p_payment_method text default null,
  p_payment_reference text default null,p_branch_count integer default 1
)
returns public.carwash_billing_requests
language plpgsql security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare
  actor public.carwash_memberships%rowtype;
  plan_row public.carwash_plans%rowtype;
  request_row public.carwash_billing_requests%rowtype;
  current_sub public.carwash_subscriptions%rowtype;
  setup_fee numeric(12,2):=0;
begin
  select * into actor from public.carwash_memberships
  where user_id=auth.uid() and tenant_id is not null and role='BUSINESS_ADMIN' and status='ACTIVE'
  order by created_at limit 1;
  if not found then raise exception 'An active business administrator is required.' using errcode='42501'; end if;
  if p_request_type is null or p_request_type not in ('TRIAL_EXTENSION','PLAN_PURCHASE') then
    raise exception 'Unknown billing request.' using errcode='22023';
  end if;

  if p_request_type='TRIAL_EXTENSION' then
    select * into current_sub from public.carwash_subscriptions
    where tenant_id=actor.tenant_id order by starts_at desc,created_at desc limit 1;
    if not found
      or current_sub.status not in ('TRIAL','EXPIRED')
      or current_sub.ends_at>now()
      or coalesce(current_sub.grace_until>now(),false)
      or exists(select 1 from public.carwash_subscription_payments where tenant_id=actor.tenant_id) then
      raise exception 'A free trial request is available after the unpaid trial expires.' using errcode='22023';
    end if;
    if exists(select 1 from public.carwash_billing_requests
      where tenant_id=actor.tenant_id and status='PENDING') then
      raise exception 'A request is already awaiting review.' using errcode='23505';
    end if;
  else
    if exists(select 1 from public.carwash_billing_requests
      where tenant_id=actor.tenant_id and request_type='PLAN_PURCHASE' and status='PENDING') then
      raise exception 'A plan payment is already pending. Complete it or contact OshaHub support.' using errcode='23505';
    end if;
    select * into plan_row from public.carwash_plans
    where id=p_plan_id and active and deleted_at is null;
    if not found then raise exception 'Choose an available plan.' using errcode='22023'; end if;
    if p_payment_method<>'M-PESA' then raise exception 'Choose M-Pesa STK Push to pay online.' using errcode='22023'; end if;
    if p_branch_count not between 1 and 100 then raise exception 'Choose between 1 and 100 branches.' using errcode='22023'; end if;
    if coalesce((plan_row.feature_flags->>'branches')::integer,1)<>-1
      and p_branch_count>coalesce((plan_row.feature_flags->>'branches')::integer,1) then
      raise exception 'This plan does not include that many branches. Choose a plan with a higher branch allowance.' using errcode='22023';
    end if;
    if not exists(select 1 from public.carwash_subscription_payments where tenant_id=actor.tenant_id) then
      setup_fee:=8500*p_branch_count;
    end if;
  end if;

  insert into public.carwash_billing_requests(
    tenant_id,user_id,request_type,plan_id,payment_method,payment_reference,
    plan_amount_kes,onboarding_fee_kes,branch_count
  ) values (
    actor.tenant_id,auth.uid(),p_request_type,p_plan_id,p_payment_method,
    nullif(trim(p_payment_reference),''),coalesce(plan_row.price_kes,0),setup_fee,
    case when p_request_type='PLAN_PURCHASE' then p_branch_count else 1 end
  ) returning * into request_row;

  insert into public.carwash_audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,details)
  values(actor.tenant_id,auth.uid(),'BILLING_REQUEST_SUBMITTED','BILLING_REQUEST',request_row.id::text,
    jsonb_build_object('request_type',p_request_type,'plan_id',p_plan_id,
      'plan_amount_kes',request_row.plan_amount_kes,'onboarding_fee_kes',setup_fee,
      'branch_count',request_row.branch_count));
  return request_row;
end;
$$;

create or replace function public.carwash_review_billing_request(p_request_id uuid,p_approve boolean)
returns public.carwash_billing_requests
language plpgsql security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare
  request_row public.carwash_billing_requests%rowtype;
  tenant_row public.carwash_tenants%rowtype;
  plan_row public.carwash_plans%rowtype;
  subscription_row public.carwash_subscriptions%rowtype;
  old_subscription public.carwash_subscriptions%rowtype;
  trial_start timestamptz:=clock_timestamp();
begin
  if not public.carwash_is_platform_admin() then
    raise exception 'Platform administrator access is required.' using errcode='42501';
  end if;
  select * into request_row from public.carwash_billing_requests where id=p_request_id for update;
  if not found or request_row.status<>'PENDING' then
    raise exception 'This billing request is no longer pending.' using errcode='23514';
  end if;
  select * into tenant_row from public.carwash_tenants where id=request_row.tenant_id for update;
  if not found then raise exception 'Business account not found.' using errcode='P0002'; end if;

  if p_approve and request_row.request_type='PLAN_PURCHASE' then
    raise exception 'Plan purchases activate only after a successful M-Pesa STK Push callback.' using errcode='42501';
  elsif p_approve and request_row.request_type='TRIAL_EXTENSION' then
    select * into old_subscription from public.carwash_subscriptions
      where tenant_id=request_row.tenant_id order by starts_at desc,created_at desc limit 1 for update;
    if not found or old_subscription.status not in ('TRIAL','EXPIRED')
      or old_subscription.ends_at>trial_start
      or coalesce(old_subscription.grace_until>trial_start,false)
      or exists(select 1 from public.carwash_subscription_payments where tenant_id=request_row.tenant_id) then
      raise exception 'This unpaid trial is no longer eligible for an extension.' using errcode='22023';
    end if;
    update public.carwash_subscriptions set status='EXPIRED'
      where id=old_subscription.id and status<>'EXPIRED';
    insert into public.carwash_subscriptions(tenant_id,plan_id,starts_at,ends_at,status,auto_renew,branch_count)
      values(old_subscription.tenant_id,old_subscription.plan_id,trial_start,
        trial_start+interval '7 days','TRIAL',false,old_subscription.branch_count)
      returning * into subscription_row;
    update public.carwash_tenants set status='TRIAL' where id=tenant_row.id;
    insert into public.carwash_user_messages(user_id,kind,subject,body,reference_key)
      select m.user_id,'SYSTEM','Your new 7-day trial is active',
        'OshaHub approved a new 7-day trial for '||tenant_row.name||'. It ends '||
        to_char(subscription_row.ends_at at time zone 'Africa/Nairobi','DD Mon YYYY HH24:MI')||'.',
        'TRIAL_EXTENSION:'||request_row.id::text
      from public.carwash_memberships m where m.tenant_id=tenant_row.id and m.status='ACTIVE'
      on conflict(user_id,reference_key) where reference_key is not null do nothing;
    insert into public.carwash_audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,details)
      values(tenant_row.id,auth.uid(),'TRIAL_EXTENSION_GRANTED','SUBSCRIPTION',subscription_row.id::text,
        jsonb_build_object('request_id',request_row.id,'previous_subscription_id',old_subscription.id,
          'previous_status',old_subscription.status,'previous_starts_at',old_subscription.starts_at,
          'previous_ends_at',old_subscription.ends_at,'new_status',subscription_row.status,
          'new_starts_at',subscription_row.starts_at,'new_ends_at',subscription_row.ends_at));
  elsif not p_approve and request_row.request_type='PLAN_PURCHASE' then
    insert into public.carwash_user_messages(user_id,kind,subject,body,reference_key)
      select m.user_id,'SYSTEM','Plan request cancelled',
        'Your pending plan request for '||tenant_row.name||' was cancelled by OshaHub support.',
        'BILLING_DECLINED:'||request_row.id::text
      from public.carwash_memberships m where m.tenant_id=tenant_row.id and m.status='ACTIVE'
      on conflict(user_id,reference_key) where reference_key is not null do nothing;
  elsif not p_approve then
    insert into public.carwash_user_messages(user_id,kind,subject,body,reference_key)
      select m.user_id,'SYSTEM','Billing request needs attention',
        'OshaHub could not approve the billing request for '||tenant_row.name||'. Please contact support or submit a new request.',
        'BILLING_DECLINED:'||request_row.id::text
      from public.carwash_memberships m where m.tenant_id=tenant_row.id and m.status='ACTIVE'
      on conflict(user_id,reference_key) where reference_key is not null do nothing;
  end if;

  update public.carwash_billing_requests
  set status=case when p_approve then 'APPROVED' else 'DECLINED' end,
      reviewed_by=auth.uid(),reviewed_at=now()
  where id=p_request_id returning * into request_row;
  insert into public.carwash_audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,details)
    values(tenant_row.id,auth.uid(),case when p_approve then 'BILLING_REQUEST_APPROVED' else 'BILLING_REQUEST_DECLINED' end,
      'BILLING_REQUEST',request_row.id::text,
      jsonb_build_object('request_type',request_row.request_type,'previous_status','PENDING',
        'new_status',request_row.status,'reviewed_at',request_row.reviewed_at));
  return request_row;
end;
$$;

create or replace function public.carwash_update_platform_tenant(
  target_tenant uuid,p_name text,p_owner_name text,p_status text
)
returns public.carwash_tenants
language plpgsql security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare tenant_row public.carwash_tenants%rowtype; before_row public.carwash_tenants%rowtype;
begin
  if not public.carwash_is_platform_admin() then
    raise exception 'Platform administrator access is required.' using errcode='42501';
  end if;
  select * into before_row from public.carwash_tenants where id=target_tenant for update;
  if not found then raise exception 'Business not found.' using errcode='P0002'; end if;
  if length(trim(coalesce(p_name,''))) not between 2 and 120
    or length(trim(coalesce(p_owner_name,''))) not between 2 and 120
    or p_status not in ('TRIAL','ACTIVE','EXPIRING SOON','EXPIRED','SUSPENDED','CANCELLED')
    or (p_status='TRIAL' and before_row.status<>'TRIAL') then
    raise exception 'Check the business name, owner name and access status. Grant a trial with the dedicated trial action.' using errcode='22023';
  end if;
  update public.carwash_tenants set name=trim(p_name),owner_name=trim(p_owner_name),status=p_status
    where id=target_tenant returning * into tenant_row;
  insert into public.carwash_audit_logs(actor_user_id,action,entity_type,entity_id,details)
    values(auth.uid(),'PLATFORM_TENANT_UPDATED','TENANT',tenant_row.id::text,
      jsonb_build_object('before',jsonb_build_object('name',before_row.name,'owner_name',before_row.owner_name,'status',before_row.status),
        'after',jsonb_build_object('name',tenant_row.name,'owner_name',tenant_row.owner_name,'status',tenant_row.status)));
  return tenant_row;
end;
$$;

create or replace function public.carwash_grant_tenant_trial(target_tenant uuid)
returns public.carwash_subscriptions
language plpgsql security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare
  tenant_row public.carwash_tenants%rowtype;
  old_subscription public.carwash_subscriptions%rowtype;
  trial_plan uuid;
  trial_start timestamptz:=clock_timestamp();
  new_subscription public.carwash_subscriptions%rowtype;
begin
  if not public.carwash_is_platform_admin() then
    raise exception 'Platform administrator access is required.' using errcode='42501';
  end if;
  select * into tenant_row from public.carwash_tenants where id=target_tenant for update;
  if not found then raise exception 'Business not found.' using errcode='P0002'; end if;
  select * into old_subscription from public.carwash_subscriptions
    where tenant_id=target_tenant order by starts_at desc,created_at desc limit 1 for update;
  select id into trial_plan from public.carwash_plans
    where name='Starter' and active and deleted_at is null;
  if trial_plan is null then raise exception 'An active Starter plan is required to grant a trial.' using errcode='22023'; end if;
  if old_subscription.id is not null then
    update public.carwash_subscriptions set status='EXPIRED'
      where id=old_subscription.id and status<>'EXPIRED';
  end if;
  insert into public.carwash_subscriptions(tenant_id,plan_id,starts_at,ends_at,status,auto_renew,branch_count)
    values(target_tenant,trial_plan,trial_start,trial_start+interval '7 days','TRIAL',false,
      coalesce(old_subscription.branch_count,1)) returning * into new_subscription;
  update public.carwash_tenants set status='TRIAL' where id=target_tenant;
  insert into public.carwash_audit_logs(actor_user_id,action,entity_type,entity_id,details)
    values(auth.uid(),'TRIAL_GRANTED','SUBSCRIPTION',new_subscription.id::text,
      jsonb_build_object('tenant_id',target_tenant,'tenant_status_before',tenant_row.status,
        'previous_subscription_id',old_subscription.id,'previous_subscription_status',old_subscription.status,
        'previous_starts_at',old_subscription.starts_at,'previous_ends_at',old_subscription.ends_at,
        'new_subscription_id',new_subscription.id,'new_status',new_subscription.status,
        'new_starts_at',new_subscription.starts_at,'new_ends_at',new_subscription.ends_at,
        'tenant_status_after','TRIAL','admin_override',true));
  insert into public.carwash_user_messages(user_id,kind,subject,body,reference_key)
    select m.user_id,'SYSTEM','A new 7-day trial is active',
      'OshaHub granted a new 7-day trial for '||tenant_row.name||'. It ends '||
      to_char(new_subscription.ends_at at time zone 'Africa/Nairobi','DD Mon YYYY HH24:MI')||'.',
      'TRIAL_GRANTED:'||new_subscription.id::text
    from public.carwash_memberships m where m.tenant_id=target_tenant and m.status='ACTIVE'
    on conflict(user_id,reference_key) where reference_key is not null do nothing;
  return new_subscription;
end;
$$;

create or replace function public.carwash_update_platform_plan(
  target_plan uuid,p_name text,p_price_kes numeric,p_duration_days integer,p_feature_flags jsonb
)
returns public.carwash_plans language plpgsql security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare plan_row public.carwash_plans%rowtype; before_row public.carwash_plans%rowtype;
begin
  if not public.carwash_is_platform_admin() then
    raise exception 'Platform administrator access is required.' using errcode='42501';
  end if;
  select * into before_row from public.carwash_plans where id=target_plan and deleted_at is null for update;
  if not found then raise exception 'Plan not found.' using errcode='P0002'; end if;
  if length(trim(coalesce(p_name,''))) not between 2 and 120 or p_price_kes is null or p_price_kes<0
    or p_duration_days is null or p_duration_days<1
    or jsonb_typeof(coalesce(p_feature_flags,'{}'::jsonb))<>'object' then
    raise exception 'Check the plan name, price, duration and features.' using errcode='22023';
  end if;
  update public.carwash_plans set name=trim(p_name),price_kes=p_price_kes,
    duration_days=p_duration_days,feature_flags=p_feature_flags
    where id=target_plan returning * into plan_row;
  insert into public.carwash_audit_logs(actor_user_id,action,entity_type,entity_id,details)
    values(auth.uid(),'PLATFORM_PLAN_UPDATED','PLAN',plan_row.id::text,
      jsonb_build_object('before',jsonb_build_object('name',before_row.name,'price_kes',before_row.price_kes,
        'duration_days',before_row.duration_days,'feature_flags',before_row.feature_flags),
        'after',jsonb_build_object('name',plan_row.name,'price_kes',plan_row.price_kes,
        'duration_days',plan_row.duration_days,'feature_flags',plan_row.feature_flags)));
  return plan_row;
end;
$$;

create or replace function public.carwash_delete_business_requests(p_request_ids uuid[])
returns integer language plpgsql security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare changed_count integer;
begin
  if not public.carwash_is_platform_admin() then raise exception 'Platform administrator access is required.' using errcode='42501'; end if;
  if coalesce(cardinality(p_request_ids),0)<1 or cardinality(p_request_ids)>250 then
    raise exception 'Select between 1 and 250 requests.' using errcode='22023';
  end if;
  update public.carwash_access_requests set deleted_at=now(),deleted_by=auth.uid()
    where id=any(p_request_ids) and deleted_at is null;
  get diagnostics changed_count=row_count;
  insert into public.carwash_audit_logs(actor_user_id,action,entity_type,details)
    values(auth.uid(),'BUSINESS_REQUESTS_SOFT_DELETED','ACCESS_REQUEST',
      jsonb_build_object('count',changed_count,'request_ids',to_jsonb(p_request_ids)));
  return changed_count;
end;
$$;

create or replace function public.carwash_delete_unused_plans(p_plan_ids uuid[])
returns integer language plpgsql security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare changed_count integer;
begin
  if not public.carwash_is_platform_admin() then raise exception 'Platform administrator access is required.' using errcode='42501'; end if;
  if coalesce(cardinality(p_plan_ids),0)<1 or cardinality(p_plan_ids)>100 then
    raise exception 'Select between 1 and 100 plans.' using errcode='22023';
  end if;
  update public.carwash_plans p set deleted_at=now(),deleted_by=auth.uid()
  where p.id=any(p_plan_ids) and p.deleted_at is null
    and not exists(select 1 from public.carwash_subscriptions s where s.plan_id=p.id)
    and not exists(select 1 from public.carwash_subscription_payments sp where sp.plan_id=p.id)
    and not exists(select 1 from public.carwash_billing_requests br where br.plan_id=p.id);
  get diagnostics changed_count=row_count;
  insert into public.carwash_audit_logs(actor_user_id,action,entity_type,details)
    values(auth.uid(),'UNUSED_PLANS_SOFT_DELETED','PLAN',
      jsonb_build_object('count',changed_count,'plan_ids',to_jsonb(p_plan_ids)));
  return changed_count;
end;
$$;

create or replace function public.carwash_list_deleted_admin_records()
returns table(entity_type text,entity_id uuid,label text,deleted_at timestamptz,deleted_by uuid)
language plpgsql stable security definer
set search_path=pg_catalog,public,pg_temp
as $$
begin
  if not public.carwash_is_platform_admin() then
    raise exception 'Platform administrator access is required.' using errcode='42501';
  end if;
  return query
    select 'ACCESS_REQUEST'::text,r.id,r.tenant_name||' · '||r.owner_name,r.deleted_at,r.deleted_by
    from public.carwash_access_requests r where r.deleted_at is not null
    union all
    select 'PLAN'::text,p.id,p.name,p.deleted_at,p.deleted_by
    from public.carwash_plans p where p.deleted_at is not null
    order by 4 desc;
end;
$$;

create or replace function public.carwash_restore_admin_record(p_entity_type text,p_record_id uuid)
returns boolean language plpgsql security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare restored_count integer:=0; deleted_at_before_restore timestamptz;
begin
  if not public.carwash_is_platform_admin() then
    raise exception 'Platform administrator access is required.' using errcode='42501';
  end if;
  if p_entity_type='ACCESS_REQUEST' then
    select r.deleted_at into deleted_at_before_restore from public.carwash_access_requests r
      where r.id=p_record_id and r.deleted_at is not null for update;
    if not found then raise exception 'Deleted record not found.' using errcode='P0002'; end if;
    update public.carwash_access_requests set deleted_at=null,deleted_by=null
      where id=p_record_id and deleted_at is not null;
  elsif p_entity_type='PLAN' then
    select p.deleted_at into deleted_at_before_restore from public.carwash_plans p
      where p.id=p_record_id and p.deleted_at is not null for update;
    if not found then raise exception 'Deleted record not found.' using errcode='P0002'; end if;
    update public.carwash_plans set deleted_at=null,deleted_by=null
      where id=p_record_id and deleted_at is not null;
  else
    raise exception 'Choose a supported record type.' using errcode='22023';
  end if;
  get diagnostics restored_count=row_count;
  if restored_count=0 then raise exception 'Deleted record not found.' using errcode='P0002'; end if;
  insert into public.carwash_audit_logs(actor_user_id,action,entity_type,entity_id,details)
    values(auth.uid(),'ADMIN_RECORD_RESTORED',p_entity_type,p_record_id::text,
      jsonb_build_object('deleted_at_before_restore',deleted_at_before_restore));
  return true;
end;
$$;

create or replace function public.carwash_review_business_request(p_request uuid,p_approve boolean)
returns public.carwash_access_requests language plpgsql security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare request_row public.carwash_access_requests%rowtype; new_tenant uuid; admin_email text; trial_plan uuid;
begin
  if not public.carwash_is_platform_admin() then raise exception 'Platform administrator access is required.' using errcode='42501'; end if;
  perform public.carwash_consume_rate_limit('BUSINESS_REVIEW',60,3600);
  select * into request_row from public.carwash_access_requests where id=p_request for update;
  if not found or request_row.deleted_at is not null then raise exception 'Registration request not found.' using errcode='P0002'; end if;
  if request_row.status not in ('PENDING','REJECTED') or (not p_approve and request_row.status='REJECTED') then
    raise exception 'This registration request cannot be reviewed from its current status.' using errcode='23514';
  end if;
  if p_approve then
    select id into trial_plan from public.carwash_plans where name='Starter' and active and deleted_at is null;
    if trial_plan is null then raise exception 'The Starter plan must be active before approving a business.' using errcode='22023'; end if;
    select email into admin_email from auth.users where id=request_row.user_id;
    insert into public.carwash_tenants(name,owner_name,status)
      values(request_row.tenant_name,request_row.owner_name,'TRIAL') returning id into new_tenant;
    insert into public.carwash_subscriptions(tenant_id,plan_id,starts_at,ends_at,status,auto_renew)
      values(new_tenant,trial_plan,now(),now()+interval '7 days','TRIAL',false);
    insert into public.carwash_memberships(user_id,tenant_id,role,full_name,status)
      values(request_row.user_id,new_tenant,'BUSINESS_ADMIN',request_row.owner_name,'ACTIVE');
    update public.carwash_access_requests set status='APPROVED',reviewed_by=auth.uid(),reviewed_at=now()
      where id=p_request returning * into request_row;
    insert into public.carwash_user_messages(user_id,kind,subject,body,reference_key)
      values(request_row.user_id,'ACCOUNT_APPROVED','Welcome to OshaHub · 7-day free trial',
        'Welcome to OshaHub! '||request_row.tenant_name||' has a free 7-day trial starting today. Sign in to open your workspace.',
        'BUSINESS_APPROVED:'||p_request::text||':'||clock_timestamp()::text);
    insert into public.carwash_audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,details)
      values(new_tenant,auth.uid(),'BUSINESS_ACCOUNT_APPROVED','ACCESS_REQUEST',p_request::text,
        jsonb_build_object('tenant_name',request_row.tenant_name,'trial_starts_at',now(),'trial_ends_at',now()+interval '7 days'));
  else
    update public.carwash_access_requests set status='REJECTED',reviewed_by=auth.uid(),reviewed_at=now()
      where id=p_request returning * into request_row;
    insert into public.carwash_user_messages(user_id,kind,subject,body,reference_key)
      values(request_row.user_id,'ACCOUNT_REJECTED','Registration needs attention',
        'Your business registration was not approved. Contact OshaHub support if you need help.',
        'BUSINESS_REJECTED:'||p_request::text||':'||clock_timestamp()::text);
    insert into public.carwash_audit_logs(actor_user_id,action,entity_type,entity_id,details)
      values(auth.uid(),'BUSINESS_ACCOUNT_REJECTED','ACCESS_REQUEST',p_request::text,'{}'::jsonb);
  end if;
  return request_row;
end;
$$;

revoke all on function public.carwash_request_billing_action(text,uuid,text,text,integer) from public,anon;
revoke all on function public.carwash_review_billing_request(uuid,boolean) from public,anon;
revoke all on function public.carwash_update_platform_tenant(uuid,text,text,text) from public,anon;
revoke all on function public.carwash_update_platform_plan(uuid,text,numeric,integer,jsonb) from public,anon;
revoke all on function public.carwash_grant_tenant_trial(uuid) from public,anon;
revoke all on function public.carwash_delete_business_requests(uuid[]) from public,anon;
revoke all on function public.carwash_delete_unused_plans(uuid[]) from public,anon;
revoke all on function public.carwash_list_deleted_admin_records() from public,anon;
revoke all on function public.carwash_restore_admin_record(text,uuid) from public,anon;
revoke all on function public.carwash_review_business_request(uuid,boolean) from public,anon;
grant execute on function public.carwash_request_billing_action(text,uuid,text,text,integer) to authenticated;
grant execute on function public.carwash_review_billing_request(uuid,boolean) to authenticated;
grant execute on function public.carwash_update_platform_tenant(uuid,text,text,text) to authenticated;
grant execute on function public.carwash_update_platform_plan(uuid,text,numeric,integer,jsonb) to authenticated;
grant execute on function public.carwash_grant_tenant_trial(uuid) to authenticated;
grant execute on function public.carwash_delete_business_requests(uuid[]) to authenticated;
grant execute on function public.carwash_delete_unused_plans(uuid[]) to authenticated;
grant execute on function public.carwash_list_deleted_admin_records() to authenticated;
grant execute on function public.carwash_restore_admin_record(text,uuid) to authenticated;
grant execute on function public.carwash_review_business_request(uuid,boolean) to authenticated;

notify pgrst,'reload schema';
