-- OshaHub's one-time onboarding fee and updated public monthly pricing.
-- Charge the setup fee with the first paid subscription only.
update public.carwash_plans set price_kes=3900 where name='Starter';
update public.carwash_plans set price_kes=7900 where name='Growth';
update public.carwash_plans set price_kes=14900 where name='Enterprise';

alter table public.carwash_subscription_payments
  add column if not exists plan_amount_kes numeric(12,2) not null default 0,
  add column if not exists onboarding_fee_kes numeric(12,2) not null default 0;
update public.carwash_subscription_payments
set plan_amount_kes=amount_kes
where plan_amount_kes=0 and amount_kes>0;

alter table public.carwash_billing_requests
  add column if not exists plan_amount_kes numeric(12,2) not null default 0,
  add column if not exists onboarding_fee_kes numeric(12,2) not null default 0;
update public.carwash_billing_requests r
set plan_amount_kes=p.price_kes,
    onboarding_fee_kes=case when not exists(select 1 from public.carwash_subscription_payments x where x.tenant_id=r.tenant_id) then 5000 else 0 end
from public.carwash_plans p
where r.plan_id=p.id and r.request_type='PLAN_PURCHASE' and r.status='PENDING';

create or replace function public.carwash_request_billing_action(
  p_request_type text,p_plan_id uuid default null,p_payment_method text default null,p_payment_reference text default null
)
returns public.carwash_billing_requests language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare actor public.carwash_memberships%rowtype; plan_row public.carwash_plans%rowtype; request_row public.carwash_billing_requests%rowtype; current_sub public.carwash_subscriptions%rowtype; setup_fee numeric(12,2):=0;
begin
  select * into actor from public.carwash_memberships where user_id=auth.uid() and tenant_id is not null and role='BUSINESS_ADMIN' and status='ACTIVE' limit 1;
  if not found then raise exception 'An active business administrator is required.' using errcode='42501'; end if;
  if p_request_type not in ('TRIAL_EXTENSION','PLAN_PURCHASE') then raise exception 'Unknown billing request.' using errcode='22023'; end if;
  if p_request_type='TRIAL_EXTENSION' then
    if exists(select 1 from public.carwash_billing_requests where tenant_id=actor.tenant_id and request_type='TRIAL_EXTENSION') then
      raise exception 'The free 7-day extension has already been requested for this business.' using errcode='23505';
    end if;
  else
    select * into plan_row from public.carwash_plans where id=p_plan_id and active;
    if not found then raise exception 'Choose an available plan.' using errcode='22023'; end if;
    if p_payment_method not in ('M-PESA','BANK TRANSFER','CARD','CASH') or length(trim(coalesce(p_payment_reference,''))) not between 4 and 120 then
      raise exception 'Enter the payment method and transaction/reference number.' using errcode='22023';
    end if;
    if not exists(select 1 from public.carwash_subscription_payments where tenant_id=actor.tenant_id) then setup_fee:=5000; end if;
  end if;
  select * into current_sub from public.carwash_subscriptions where tenant_id=actor.tenant_id order by starts_at desc,created_at desc limit 1;
  if p_request_type='TRIAL_EXTENSION' and (not found or current_sub.status not in ('TRIAL','EXPIRED') or exists(select 1 from public.carwash_subscription_payments where tenant_id=actor.tenant_id)) then
    raise exception 'The free extension is available once during the initial trial and before any paid plan.' using errcode='22023';
  end if;
  insert into public.carwash_billing_requests(tenant_id,user_id,request_type,plan_id,payment_method,payment_reference,plan_amount_kes,onboarding_fee_kes)
    values(actor.tenant_id,auth.uid(),p_request_type,p_plan_id,p_payment_method,nullif(trim(p_payment_reference),''),coalesce(plan_row.price_kes,0),setup_fee) returning * into request_row;
  insert into public.carwash_audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,details)
    values(actor.tenant_id,auth.uid(),'BILLING_REQUEST_SUBMITTED','BILLING_REQUEST',request_row.id::text,jsonb_build_object('request_type',p_request_type,'plan_id',p_plan_id,'plan_amount_kes',request_row.plan_amount_kes,'onboarding_fee_kes',setup_fee));
  return request_row;
end;
$$;

create or replace function public.carwash_review_billing_request(p_request_id uuid,p_approve boolean)
returns public.carwash_billing_requests language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare request_row public.carwash_billing_requests%rowtype; tenant_row public.carwash_tenants%rowtype; plan_row public.carwash_plans%rowtype; subscription_row public.carwash_subscriptions%rowtype;
begin
  if not public.carwash_is_platform_admin() then raise exception 'Platform administrator access is required.' using errcode='42501'; end if;
  select * into request_row from public.carwash_billing_requests where id=p_request_id for update;
  if not found or request_row.status<>'PENDING' then raise exception 'This billing request is no longer pending.' using errcode='23514'; end if;
  select * into tenant_row from public.carwash_tenants where id=request_row.tenant_id for update;
  if p_approve and request_row.request_type='TRIAL_EXTENSION' then
    select * into subscription_row from public.carwash_subscriptions where tenant_id=request_row.tenant_id order by starts_at desc,created_at desc limit 1 for update;
    if not found or subscription_row.status not in ('TRIAL','EXPIRED') then raise exception 'The initial trial cannot be extended in its current state.' using errcode='22023'; end if;
    update public.carwash_subscriptions set ends_at=greatest(ends_at,now())+interval '7 days',status='TRIAL',grace_until=null where id=subscription_row.id returning * into subscription_row;
    update public.carwash_tenants set status='TRIAL' where id=tenant_row.id;
    insert into public.carwash_user_messages(user_id,kind,subject,body,reference_key)
      select m.user_id,'SYSTEM','Your free trial was extended','OshaHub approved an extra 7 days for '||tenant_row.name||'. Your trial now ends '||to_char(subscription_row.ends_at at time zone 'Africa/Nairobi','DD Mon YYYY HH24:MI')||'.','TRIAL_EXTENSION:'||request_row.id::text
      from public.carwash_memberships m where m.tenant_id=tenant_row.id and m.status='ACTIVE'
      on conflict(user_id,reference_key) where reference_key is not null do nothing;
  elsif p_approve then
    select * into plan_row from public.carwash_plans where id=request_row.plan_id and active;
    if not found then raise exception 'The requested plan is no longer available.' using errcode='22023'; end if;
    if exists(select 1 from public.carwash_subscription_payments where tenant_id=tenant_row.id) then request_row.onboarding_fee_kes:=0; end if;
    request_row.plan_amount_kes:=plan_row.price_kes;
    insert into public.carwash_subscriptions(tenant_id,plan_id,starts_at,ends_at,status,auto_renew)
      values(tenant_row.id,plan_row.id,now(),now()+make_interval(days=>plan_row.duration_days),'ACTIVE',false) returning * into subscription_row;
    insert into public.carwash_subscription_payments(tenant_id,subscription_id,plan_id,amount_kes,plan_amount_kes,onboarding_fee_kes,method,external_reference,confirmed_by)
      values(tenant_row.id,subscription_row.id,plan_row.id,plan_row.price_kes+request_row.onboarding_fee_kes,plan_row.price_kes,request_row.onboarding_fee_kes,request_row.payment_method,request_row.payment_reference,auth.uid());
    update public.carwash_tenants set status='ACTIVE' where id=tenant_row.id;
    insert into public.carwash_user_messages(user_id,kind,subject,body,reference_key)
      select m.user_id,'SYSTEM','Payment confirmed and plan active','Your payment of KES '||(plan_row.price_kes+request_row.onboarding_fee_kes)::text||' was confirmed, including a KES '||request_row.onboarding_fee_kes::text||' one-time onboarding fee. The '||plan_row.name||' plan for '||tenant_row.name||' is active until '||to_char(subscription_row.ends_at at time zone 'Africa/Nairobi','DD Mon YYYY HH24:MI')||'.','BILLING_ACTIVATED:'||request_row.id::text
      from public.carwash_memberships m where m.tenant_id=tenant_row.id and m.status='ACTIVE'
      on conflict(user_id,reference_key) where reference_key is not null do nothing;
  else
    insert into public.carwash_user_messages(user_id,kind,subject,body,reference_key)
      select m.user_id,'SYSTEM','Billing request needs attention','OshaHub could not approve the billing request for '||tenant_row.name||'. Please contact support or submit corrected payment details.','BILLING_DECLINED:'||request_row.id::text
      from public.carwash_memberships m where m.tenant_id=tenant_row.id and m.status='ACTIVE'
      on conflict(user_id,reference_key) where reference_key is not null do nothing;
  end if;
  update public.carwash_billing_requests set status=case when p_approve then 'APPROVED' else 'DECLINED' end,reviewed_by=auth.uid(),reviewed_at=now(),plan_amount_kes=request_row.plan_amount_kes,onboarding_fee_kes=request_row.onboarding_fee_kes where id=p_request_id returning * into request_row;
  insert into public.carwash_audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,details)
    values(tenant_row.id,auth.uid(),case when p_approve then 'BILLING_REQUEST_APPROVED' else 'BILLING_REQUEST_DECLINED' end,'BILLING_REQUEST',request_row.id::text,jsonb_build_object('request_type',request_row.request_type,'plan_amount_kes',request_row.plan_amount_kes,'onboarding_fee_kes',request_row.onboarding_fee_kes));
  return request_row;
end;
$$;

create or replace function public.carwash_activate_tenant_plan(target_tenant uuid,target_plan uuid,payment_method text default 'M-PESA',payment_reference text default null)
returns public.carwash_subscriptions language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare plan_row public.carwash_plans%rowtype; tenant_row public.carwash_tenants%rowtype; subscription_row public.carwash_subscriptions%rowtype; setup_fee numeric(12,2):=0;
begin
  if not public.carwash_is_platform_admin() then raise exception 'Platform administrator access is required.' using errcode='42501'; end if;
  perform public.carwash_consume_rate_limit('PLAN_ACTIVATE',60,3600);
  if payment_method not in ('CASH','CARD','M-PESA','BANK TRANSFER') then raise exception 'Choose a supported business payment method.' using errcode='22023'; end if;
  select * into tenant_row from public.carwash_tenants where id=target_tenant for update;
  if not found then raise exception 'Business account not found.' using errcode='P0002'; end if;
  select * into plan_row from public.carwash_plans where id=target_plan and active;
  if not found then raise exception 'Choose an active subscription plan.' using errcode='22023'; end if;
  if not exists(select 1 from public.carwash_subscription_payments where tenant_id=target_tenant) then setup_fee:=5000; end if;
  insert into public.carwash_subscriptions(tenant_id,plan_id,starts_at,ends_at,status,auto_renew) values(target_tenant,target_plan,now(),now()+make_interval(days=>plan_row.duration_days),'ACTIVE',false) returning * into subscription_row;
  insert into public.carwash_subscription_payments(tenant_id,subscription_id,plan_id,amount_kes,plan_amount_kes,onboarding_fee_kes,method,external_reference,confirmed_by)
    values(target_tenant,subscription_row.id,target_plan,plan_row.price_kes+setup_fee,plan_row.price_kes,setup_fee,payment_method,nullif(trim(payment_reference),''),auth.uid());
  update public.carwash_tenants set status='ACTIVE' where id=target_tenant;
  insert into public.carwash_user_messages(user_id,kind,subject,body,reference_key)
    select m.user_id,'SYSTEM','Business plan activated','Your payment of KES '||(plan_row.price_kes+setup_fee)::text||' was confirmed for '||tenant_row.name||', including a KES '||setup_fee::text||' one-time onboarding fee. Your '||plan_row.name||' plan is active until '||to_char(subscription_row.ends_at at time zone 'Africa/Nairobi','DD Mon YYYY HH24:MI')||'.','PLAN_ACTIVATED:'||subscription_row.id::text
    from public.carwash_memberships m where m.tenant_id=target_tenant and m.status='ACTIVE'
    on conflict(user_id,reference_key) where reference_key is not null do nothing;
  insert into public.carwash_audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,details)
    values(target_tenant,auth.uid(),'TENANT_PLAN_ACTIVATED','SUBSCRIPTION',subscription_row.id::text,jsonb_build_object('plan_id',target_plan,'ends_at',subscription_row.ends_at,'amount_kes',plan_row.price_kes+setup_fee,'onboarding_fee_kes',setup_fee,'method',payment_method));
  return subscription_row;
end;
$$;
revoke all on function public.carwash_request_billing_action(text,uuid,text,text) from public,anon;
revoke all on function public.carwash_review_billing_request(uuid,boolean) from public,anon;
revoke all on function public.carwash_activate_tenant_plan(uuid,uuid,text,text) from public,anon;
grant execute on function public.carwash_request_billing_action(text,uuid,text,text) to authenticated;
grant execute on function public.carwash_review_billing_request(uuid,boolean) to authenticated;
grant execute on function public.carwash_activate_tenant_plan(uuid,uuid,text,text) to authenticated;
notify pgrst,'reload schema';
