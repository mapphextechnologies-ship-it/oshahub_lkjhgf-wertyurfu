-- Split first-time onboarding from the plan charge and record Daraja STK Push attempts.
-- The onboarding payment starts the chosen plan term. The subscription amount is collected at renewal.

alter table public.carwash_billing_requests
  add column if not exists mpesa_phone text,
  add column if not exists mpesa_checkout_request_id text,
  add column if not exists mpesa_merchant_request_id text,
  add column if not exists mpesa_payment_status text not null default 'NOT_STARTED'
    check (mpesa_payment_status in ('NOT_STARTED','INITIATED','FAILED','PAID')),
  add column if not exists mpesa_expected_amount_kes numeric(12,2) not null default 0,
  add column if not exists mpesa_result_code text,
  add column if not exists mpesa_receipt text,
  add column if not exists mpesa_paid_amount_kes numeric(12,2),
  add column if not exists mpesa_paid_phone text,
  add column if not exists payment_stage text check (payment_stage in ('ONBOARDING','SUBSCRIPTION'));

alter table public.carwash_subscription_payments
  add column if not exists payment_stage text not null default 'LEGACY'
    check (payment_stage in ('LEGACY','ONBOARDING','SUBSCRIPTION')),
  alter column confirmed_by drop not null;
update public.carwash_subscription_payments
set payment_stage=case when onboarding_fee_kes>0 and plan_amount_kes=0 then 'ONBOARDING' else 'SUBSCRIPTION' end
where payment_stage='LEGACY';

create unique index if not exists carwash_billing_mpesa_checkout_unique
  on public.carwash_billing_requests(mpesa_checkout_request_id) where mpesa_checkout_request_id is not null;
create unique index if not exists carwash_subscription_payments_receipt_unique
  on public.carwash_subscription_payments(external_reference) where external_reference is not null;

-- STK Push collects only the first-time setup fee, then activates the selected period.
drop function if exists public.carwash_request_billing_action(text,uuid,text,text,integer);
create function public.carwash_request_billing_action(
  p_request_type text,p_plan_id uuid default null,p_payment_method text default null,
  p_payment_reference text default null,p_branch_count integer default 1
)
returns public.carwash_billing_requests language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare actor public.carwash_memberships%rowtype; plan_row public.carwash_plans%rowtype; request_row public.carwash_billing_requests%rowtype; current_sub public.carwash_subscriptions%rowtype; setup_fee numeric(12,2):=0;
begin
  select * into actor from public.carwash_memberships where user_id=auth.uid() and tenant_id is not null and role='BUSINESS_ADMIN' and status='ACTIVE' limit 1;
  if not found then raise exception 'An active business administrator is required.' using errcode='42501'; end if;
  if p_request_type not in ('TRIAL_EXTENSION','PLAN_PURCHASE') then raise exception 'Unknown billing request.' using errcode='22023'; end if;
  if p_request_type='TRIAL_EXTENSION' then
    if exists(select 1 from public.carwash_billing_requests where tenant_id=actor.tenant_id and request_type='TRIAL_EXTENSION') then raise exception 'The free 7-day extension has already been requested for this business.' using errcode='23505'; end if;
  else
    if exists(select 1 from public.carwash_billing_requests where tenant_id=actor.tenant_id and request_type='PLAN_PURCHASE' and status='PENDING') then raise exception 'A plan payment is already pending. Complete it or contact OshaHub support.' using errcode='23505'; end if;
    select * into plan_row from public.carwash_plans where id=p_plan_id and active;
    if not found then raise exception 'Choose an available plan.' using errcode='22023'; end if;
    if p_payment_method<>'M-PESA' then raise exception 'Choose M-Pesa STK Push to pay online.' using errcode='22023'; end if;
    if p_branch_count not between 1 and 100 then raise exception 'Choose between 1 and 100 branches.' using errcode='22023'; end if;
    if coalesce((plan_row.feature_flags->>'branches')::integer,1)<>-1 and p_branch_count>coalesce((plan_row.feature_flags->>'branches')::integer,1) then raise exception 'This plan does not include that many branches. Choose a plan with a higher branch allowance.' using errcode='22023'; end if;
    if not exists(select 1 from public.carwash_subscription_payments where tenant_id=actor.tenant_id) then setup_fee:=8500*p_branch_count; end if;
  end if;
  select * into current_sub from public.carwash_subscriptions where tenant_id=actor.tenant_id order by starts_at desc,created_at desc limit 1;
  if p_request_type='TRIAL_EXTENSION' and (not found or current_sub.status not in ('TRIAL','EXPIRED') or exists(select 1 from public.carwash_subscription_payments where tenant_id=actor.tenant_id)) then raise exception 'The free extension is available once during the initial trial and before any paid plan.' using errcode='22023'; end if;
  insert into public.carwash_billing_requests(tenant_id,user_id,request_type,plan_id,payment_method,payment_reference,plan_amount_kes,onboarding_fee_kes,branch_count)
    values(actor.tenant_id,auth.uid(),p_request_type,p_plan_id,p_payment_method,nullif(trim(p_payment_reference),''),coalesce(plan_row.price_kes,0),setup_fee,case when p_request_type='PLAN_PURCHASE' then p_branch_count else 1 end) returning * into request_row;
  insert into public.carwash_audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,details)
    values(actor.tenant_id,auth.uid(),'BILLING_REQUEST_SUBMITTED','BILLING_REQUEST',request_row.id::text,jsonb_build_object('request_type',p_request_type,'plan_id',p_plan_id,'plan_amount_kes',request_row.plan_amount_kes,'onboarding_fee_kes',setup_fee,'branch_count',request_row.branch_count));
  return request_row;
end;
$$;

-- Business users can create requests but only the authenticated Edge Function callback can mark M-Pesa paid.
create or replace function public.carwash_review_billing_request(p_request_id uuid,p_approve boolean)
returns public.carwash_billing_requests language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare request_row public.carwash_billing_requests%rowtype; tenant_row public.carwash_tenants%rowtype; plan_row public.carwash_plans%rowtype; subscription_row public.carwash_subscriptions%rowtype;
begin
  if not public.carwash_is_platform_admin() then raise exception 'Platform administrator access is required.' using errcode='42501'; end if;
  select * into request_row from public.carwash_billing_requests where id=p_request_id for update;
  if not found or request_row.status<>'PENDING' then raise exception 'This billing request is no longer pending.' using errcode='23514'; end if;
  if p_approve and request_row.request_type='PLAN_PURCHASE' then raise exception 'Plan purchases activate only after a successful M-Pesa STK Push callback.' using errcode='42501'; end if;
  select * into tenant_row from public.carwash_tenants where id=request_row.tenant_id for update;
  if p_approve and request_row.request_type='TRIAL_EXTENSION' then
    select * into subscription_row from public.carwash_subscriptions where tenant_id=request_row.tenant_id order by starts_at desc,created_at desc limit 1 for update;
    if not found or subscription_row.status not in ('TRIAL','EXPIRED') then raise exception 'The initial trial cannot be extended in its current state.' using errcode='22023'; end if;
    update public.carwash_subscriptions set ends_at=greatest(ends_at,now())+interval '7 days',status='TRIAL',grace_until=null where id=subscription_row.id returning * into subscription_row;
    update public.carwash_tenants set status='TRIAL' where id=tenant_row.id;
    insert into public.carwash_user_messages(user_id,kind,subject,body,reference_key) select m.user_id,'SYSTEM','Your free trial was extended','OshaHub approved an extra 7 days for '||tenant_row.name||'. Your trial now ends '||to_char(subscription_row.ends_at at time zone 'Africa/Nairobi','DD Mon YYYY HH24:MI')||'.','TRIAL_EXTENSION:'||request_row.id::text from public.carwash_memberships m where m.tenant_id=tenant_row.id and m.status='ACTIVE' on conflict(user_id,reference_key) where reference_key is not null do nothing;
  end if;
  if not p_approve and request_row.request_type='PLAN_PURCHASE' then
    update public.carwash_billing_requests set status='DECLINED',reviewed_by=auth.uid(),reviewed_at=now() where id=p_request_id returning * into request_row;
    insert into public.carwash_user_messages(user_id,kind,subject,body,reference_key) select m.user_id,'SYSTEM','Plan request cancelled','Your pending plan request for '||tenant_row.name||' was cancelled by OshaHub support.','BILLING_DECLINED:'||request_row.id::text from public.carwash_memberships m where m.tenant_id=tenant_row.id and m.status='ACTIVE' on conflict(user_id,reference_key) where reference_key is not null do nothing;
  elsif not p_approve then
    update public.carwash_billing_requests set status='DECLINED',reviewed_by=auth.uid(),reviewed_at=now() where id=p_request_id returning * into request_row;
  elsif request_row.request_type='TRIAL_EXTENSION' then
    update public.carwash_billing_requests set status='APPROVED',reviewed_by=auth.uid(),reviewed_at=now() where id=p_request_id returning * into request_row;
  end if;
  insert into public.carwash_audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,details)
    values(tenant_row.id,auth.uid(),case when p_approve then 'BILLING_REQUEST_APPROVED' else 'BILLING_REQUEST_DECLINED' end,'BILLING_REQUEST',request_row.id::text,jsonb_build_object('request_type',request_row.request_type,'branch_count',request_row.branch_count));
  return request_row;
end;
$$;

create or replace function public.carwash_complete_mpesa_billing(
  p_checkout_request_id text,p_amount_kes numeric,p_receipt text,p_phone text
)
returns public.carwash_billing_requests language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.carwash_billing_requests%rowtype; t public.carwash_tenants%rowtype; p public.carwash_plans%rowtype; current_sub public.carwash_subscriptions%rowtype; sub public.carwash_subscriptions%rowtype; starts timestamptz; plan_paid numeric(12,2):=0; setup_paid numeric(12,2):=0;
begin
  if auth.role()<>'service_role' then raise exception 'Payment callback service access is required.' using errcode='42501'; end if;
  select * into r from public.carwash_billing_requests where mpesa_checkout_request_id=p_checkout_request_id for update;
  if not found then raise exception 'No billing request is linked to this M-Pesa checkout.' using errcode='P0002'; end if;
  if r.mpesa_payment_status='PAID' then return r; end if;
  if r.status<>'PENDING' or r.payment_stage not in ('ONBOARDING','SUBSCRIPTION') then raise exception 'The billing request is not awaiting this M-Pesa payment.' using errcode='23514'; end if;
  if p_amount_kes<>r.mpesa_expected_amount_kes or nullif(trim(p_receipt),'') is null or p_phone<>r.mpesa_phone then raise exception 'M-Pesa callback details did not match the requested payment.' using errcode='22023'; end if;
  select * into t from public.carwash_tenants where id=r.tenant_id for update;
  select * into p from public.carwash_plans where id=r.plan_id and active;
  if not found then raise exception 'The selected subscription plan is no longer active.' using errcode='22023'; end if;
  if r.payment_stage='ONBOARDING' then
    if exists(select 1 from public.carwash_subscription_payments where tenant_id=r.tenant_id) then raise exception 'Onboarding has already been paid for this business.' using errcode='23505'; end if;
    setup_paid:=p_amount_kes;
    starts:=now();
  else
    plan_paid:=p_amount_kes;
    select * into current_sub from public.carwash_subscriptions where tenant_id=r.tenant_id order by starts_at desc,created_at desc limit 1 for update;
    if not found then raise exception 'No existing plan period is available to renew.' using errcode='23514'; end if;
    starts:=greatest(now(),current_sub.ends_at);
  end if;
  insert into public.carwash_subscriptions(tenant_id,plan_id,starts_at,ends_at,status,auto_renew,branch_count)
    values(r.tenant_id,r.plan_id,starts,starts+make_interval(days=>p.duration_days),'ACTIVE',false,r.branch_count) returning * into sub;
  insert into public.carwash_subscription_payments(tenant_id,subscription_id,plan_id,amount_kes,plan_amount_kes,onboarding_fee_kes,branch_count,payment_stage,method,external_reference,confirmed_by)
    values(r.tenant_id,sub.id,r.plan_id,p_amount_kes,plan_paid,setup_paid,r.branch_count,r.payment_stage,'M-PESA',trim(p_receipt),null);
  update public.carwash_tenants set status='ACTIVE' where id=r.tenant_id;
  update public.carwash_billing_requests set status='APPROVED',reviewed_at=now(),payment_reference=trim(p_receipt),mpesa_receipt=trim(p_receipt),mpesa_paid_amount_kes=p_amount_kes,mpesa_paid_phone=p_phone,mpesa_payment_status='PAID',mpesa_result_code='0' where id=r.id returning * into r;
  insert into public.carwash_user_messages(user_id,kind,subject,body,reference_key)
    select m.user_id,'SYSTEM',case when setup_paid>0 then 'Onboarding paid and plan active' else 'Subscription payment confirmed' end,
      case when setup_paid>0 then 'We received your KES '||setup_paid::text||' one-time onboarding payment for '||r.branch_count::text||' branch(es). Your '||p.name||' access is active until '||to_char(sub.ends_at at time zone 'Africa/Nairobi','DD Mon YYYY HH24:MI')||'. The plan charge of KES '||r.plan_amount_kes::text||' is due at renewal.' else 'We received your KES '||plan_paid::text||' subscription payment. Your '||p.name||' access is active until '||to_char(sub.ends_at at time zone 'Africa/Nairobi','DD Mon YYYY HH24:MI')||'.' end,
      'BILLING_ACTIVATED:'||r.id::text from public.carwash_memberships m where m.tenant_id=r.tenant_id and m.status='ACTIVE' on conflict(user_id,reference_key) where reference_key is not null do nothing;
  insert into public.carwash_audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,details)
    values(r.tenant_id,r.user_id,case when setup_paid>0 then 'ONBOARDING_PAYMENT_RECEIVED' else 'SUBSCRIPTION_PAYMENT_RECEIVED' end,'SUBSCRIPTION',sub.id::text,jsonb_build_object('checkout_request_id',p_checkout_request_id,'receipt',p_receipt,'amount_kes',p_amount_kes,'plan_id',r.plan_id,'plan_amount_kes',plan_paid,'onboarding_fee_kes',setup_paid,'branch_count',r.branch_count));
  return r;
end;
$$;

revoke all on function public.carwash_request_billing_action(text,uuid,text,text,integer) from public,anon;
revoke all on function public.carwash_complete_mpesa_billing(text,numeric,text,text) from public,anon,authenticated;
grant execute on function public.carwash_request_billing_action(text,uuid,text,text,integer) to authenticated;
grant execute on function public.carwash_complete_mpesa_billing(text,numeric,text,text) to service_role;
notify pgrst,'reload schema';
