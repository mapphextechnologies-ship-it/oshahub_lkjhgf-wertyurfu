-- Create idempotent in-app reminders before subscription expiry and a clear
-- restriction notice after expiry. Call on sign-in and while a workspace is open.
do $$
declare starter_plan uuid;
begin
  select id into starter_plan from public.carwash_plans where name='Starter' and active;
  if starter_plan is null and exists(select 1 from public.carwash_tenants t where t.status='TRIAL' and not exists(select 1 from public.carwash_subscriptions s where s.tenant_id=t.id)) then
    raise exception 'The Starter plan must be active to create trial subscriptions.' using errcode='22023';
  end if;
  if starter_plan is not null then
    insert into public.carwash_subscriptions(tenant_id,plan_id,starts_at,ends_at,status,auto_renew)
      select t.id,starter_plan,t.created_at,t.created_at+interval '7 days',
        case when t.created_at+interval '7 days' < now() then 'EXPIRED' else 'TRIAL' end,false
      from public.carwash_tenants t
      where t.status='TRIAL' and not exists(select 1 from public.carwash_subscriptions s where s.tenant_id=t.id);
    update public.carwash_tenants set status='EXPIRED'
      where status='TRIAL' and created_at+interval '7 days'<now();
  end if;
end;
$$;

create or replace function public.carwash_review_business_request(p_request uuid,p_approve boolean)
returns public.carwash_access_requests language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare request_row public.carwash_access_requests%rowtype; new_tenant uuid; admin_email text; trial_plan uuid;
begin
  if not public.carwash_is_platform_admin() then raise exception 'Platform administrator access is required.' using errcode='42501'; end if;
  perform public.carwash_consume_rate_limit('BUSINESS_REVIEW',60,3600);
  select * into request_row from public.carwash_access_requests where id=p_request for update;
  if not found then raise exception 'Registration request not found.' using errcode='P0002'; end if;
  if request_row.status not in ('PENDING','REJECTED') or (not p_approve and request_row.status='REJECTED') then
    raise exception 'This registration request cannot be reviewed from its current status.' using errcode='23514';
  end if;
  if p_approve then
    select id into trial_plan from public.carwash_plans where name='Starter' and active;
    if trial_plan is null then raise exception 'The Starter plan must be active before approving a business.' using errcode='22023'; end if;
    select email into admin_email from auth.users where id=request_row.user_id;
    insert into public.carwash_tenants(name,owner_name,status)
      values(request_row.tenant_name,request_row.owner_name,'TRIAL') returning id into new_tenant;
    insert into public.carwash_subscriptions(tenant_id,plan_id,starts_at,ends_at,status,auto_renew)
      values(new_tenant,trial_plan,now(),now()+interval '7 days','TRIAL',false);
    insert into public.carwash_memberships(user_id,tenant_id,role,full_name,status)
      values(request_row.user_id,new_tenant,'BUSINESS_ADMIN',request_row.owner_name,'ACTIVE');
    update public.carwash_access_requests set status='APPROVED',reviewed_by=auth.uid(),reviewed_at=now() where id=p_request returning * into request_row;
    insert into public.carwash_user_messages(user_id,kind,subject,body,reference_key)
      values(request_row.user_id,'ACCOUNT_APPROVED','Welcome to OshaHub · 7-day free trial','Welcome to OshaHub! '||request_row.tenant_name||' has a free 7-day trial starting today. Sign in with '||coalesce(admin_email,'your registered email')||' to open your workspace.','BUSINESS_APPROVED:'||p_request::text||':'||clock_timestamp()::text);
    insert into public.carwash_audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,details)
      values(new_tenant,auth.uid(),'BUSINESS_ACCOUNT_APPROVED','ACCESS_REQUEST',p_request::text,jsonb_build_object('tenant_name',request_row.tenant_name));
  else
    update public.carwash_access_requests set status='REJECTED',reviewed_by=auth.uid(),reviewed_at=now() where id=p_request returning * into request_row;
    insert into public.carwash_user_messages(user_id,kind,subject,body,reference_key)
      values(request_row.user_id,'ACCOUNT_REJECTED','Registration needs attention','Your business registration was not approved. Contact Carwash OS support if you need help.','BUSINESS_REJECTED:'||p_request::text||':'||clock_timestamp()::text);
    insert into public.carwash_audit_logs(actor_user_id,action,entity_type,entity_id,details)
      values(auth.uid(),'BUSINESS_ACCOUNT_REJECTED','ACCESS_REQUEST',p_request::text,'{}'::jsonb);
  end if;
  return request_row;
end;
$$;

create or replace function public.carwash_notify_billing_status(target_tenant uuid)
returns boolean language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare
  tenant_row public.carwash_tenants%rowtype;
  subscription_row public.carwash_subscriptions%rowtype;
  plan_name text;
  days_left integer;
  notice_key text;
  notice_subject text;
  notice_body text;
begin
  if not exists(select 1 from public.carwash_memberships m where m.user_id=auth.uid() and m.tenant_id=target_tenant and m.status='ACTIVE') then
    raise exception 'Active business membership is required.' using errcode='42501';
  end if;
  select * into tenant_row from public.carwash_tenants where id=target_tenant;
  select * into subscription_row from public.carwash_subscriptions s where s.tenant_id=target_tenant order by s.starts_at desc,s.created_at desc limit 1;
  if not found or subscription_row.status='CANCELLED' then return false; end if;
  if coalesce(subscription_row.grace_until>=now(),false) then return false; end if;
  days_left := (subscription_row.ends_at at time zone 'Africa/Nairobi')::date - (now() at time zone 'Africa/Nairobi')::date;
  if days_left > 7 then return false; end if;
  select name into plan_name from public.carwash_plans where id=subscription_row.plan_id;
  if subscription_row.ends_at < now() then
    notice_key := 'PLAN_OVERDUE:'||subscription_row.id::text;
    notice_subject := 'Workspace access restricted';
    notice_body := 'Your '||coalesce(plan_name,'business')||' plan has expired. '||tenant_row.name||' is now restricted to read-only access. Make a payment to continue using '||tenant_row.name||'. Contact the platform administrator to confirm payment and restore access.';
  else
    notice_key := 'PLAN_REMINDER:'||subscription_row.id::text||':'||case when days_left<=1 then '1' when days_left<=3 then '3' else '7' end;
    notice_subject := case when days_left=0 then 'Plan expires today' when days_left=1 then 'Plan expires tomorrow' else 'Plan renewal reminder' end;
    notice_body := case when days_left=0 then 'Your plan for '||tenant_row.name||' expires today. Make a payment to keep your workspace available.'
      when days_left=1 then 'Your plan for '||tenant_row.name||' expires tomorrow. Make a payment to avoid interruption to your workspace.'
      else 'Your plan for '||tenant_row.name||' expires in '||days_left||' days. Make a payment before it expires to keep your workspace available.' end;
  end if;
  insert into public.carwash_user_messages(user_id,kind,subject,body,reference_key)
    select m.user_id,'SYSTEM',notice_subject,notice_body,notice_key
    from public.carwash_memberships m where m.tenant_id=target_tenant and m.status='ACTIVE'
    on conflict (user_id,reference_key) where reference_key is not null do nothing;
  if subscription_row.ends_at < now() then
    update public.carwash_tenants set status='EXPIRED' where id=target_tenant and status in ('TRIAL','ACTIVE','EXPIRING SOON');
  end if;
  return subscription_row.ends_at < now();
end;
$$;
revoke all on function public.carwash_notify_billing_status(uuid) from public,anon;
grant execute on function public.carwash_notify_billing_status(uuid) to authenticated;
notify pgrst, 'reload schema';
