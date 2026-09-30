-- Carwash OS core schema (Supabase / PostgreSQL)
-- Business rows always carry tenant_id. Membership is the source of tenant context.
-- Restore the SQL connection's owner role if a temporary SET ROLE was used.
reset role;
do $$
begin
  if not has_schema_privilege(current_user, 'public', 'CREATE') then
    raise exception 'Role % (session role %) cannot create objects in public. Run carwash.sql in Supabase Dashboard SQL Editor as postgres or the public schema owner.', current_user, session_user
      using errcode = '42501';
  end if;
end;
$$;

create extension if not exists pgcrypto;
revoke create on schema public from public,anon,authenticated;
-- Keep owner-run migrations able to create schema objects without granting
-- CREATE to application roles.
grant usage, create on schema public to postgres;

create table if not exists public.carwash_tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_name text not null,
  status text not null default 'TRIAL' check (status in ('TRIAL','ACTIVE','EXPIRING SOON','EXPIRED','SUSPENDED','CANCELLED')),
  settings jsonb not null default '{"branch":"Main branch","loyaltyRate":1}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.carwash_tenants add column if not exists settings jsonb not null default '{"branch":"Main branch","loyaltyRate":1}'::jsonb;

create table if not exists public.carwash_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid references public.carwash_tenants(id) on delete cascade,
  role text not null check (role in ('SUPER_ADMIN','BUSINESS_ADMIN','RECEPTIONIST','WASHER')),
  full_name text not null,
  phone text,
  branch text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','PENDING','SUSPENDED')),
  created_at timestamptz not null default now(),
  check ((role='SUPER_ADMIN' and tenant_id is null) or (role<>'SUPER_ADMIN' and tenant_id is not null)),
  unique(user_id,tenant_id), unique(id,tenant_id)
);

create table if not exists public.carwash_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  price_kes numeric(12,2) not null check (price_kes >= 0),
  duration_days integer not null check (duration_days > 0),
  feature_flags jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
insert into public.carwash_plans (name,price_kes,duration_days,feature_flags,active)
values
  ('Starter',3900,30,'{"branches":1,"staff":3,"description":"Core operations"}'::jsonb,true),
  ('Growth',7900,30,'{"branches":3,"staff":15,"description":"Reports and loyalty"}'::jsonb,true),
  ('Enterprise',14900,30,'{"branches":-1,"staff":-1,"description":"Priority support"}'::jsonb,true)
on conflict (name) do nothing;

create table if not exists public.carwash_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.carwash_tenants(id) on delete restrict,
  plan_id uuid not null references public.carwash_plans(id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null check (status in ('TRIAL','ACTIVE','EXPIRING SOON','EXPIRED','SUSPENDED','CANCELLED')),
  grace_until timestamptz,
  auto_renew boolean not null default false,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists public.carwash_subscription_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.carwash_tenants(id) on delete restrict,
  subscription_id uuid not null references public.carwash_subscriptions(id) on delete restrict,
  plan_id uuid not null references public.carwash_plans(id) on delete restrict,
  amount_kes numeric(12,2) not null check (amount_kes >= 0),
  method text not null check (method in ('CASH','CARD','M-PESA','BANK TRANSFER')),
  external_reference text,
  confirmed_by uuid not null references auth.users(id),
  paid_at timestamptz not null default now()
);
create index if not exists carwash_subscription_payments_time on public.carwash_subscription_payments(paid_at desc);

create table if not exists public.carwash_customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.carwash_tenants(id) on delete cascade,
  full_name text not null,
  phone text not null,
  email text,
  created_at timestamptz not null default now(),
  unique(tenant_id,phone), unique(id,tenant_id)
);

create table if not exists public.carwash_vehicles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.carwash_tenants(id) on delete cascade,
  customer_id uuid not null,
  registration text not null,
  make text not null,
  model text not null,
  color text,
  created_at timestamptz not null default now(),
  foreign key(customer_id,tenant_id) references public.carwash_customers(id,tenant_id) on delete cascade,
  unique(tenant_id,registration), unique(id,tenant_id)
);

create table if not exists public.carwash_services (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.carwash_tenants(id) on delete cascade,
  name text not null,
  category text,
  price_kes numeric(12,2) not null check (price_kes >= 0),
  commission_kes numeric(12,2) not null default 0 check (commission_kes >= 0),
  estimated_minutes integer not null default 30 check (estimated_minutes > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(id,tenant_id)
);

create table if not exists public.carwash_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.carwash_tenants(id) on delete restrict,
  customer_id uuid not null,
  vehicle_id uuid not null,
  washer_membership_id uuid,
  status text not null default 'WAITING' check (status in ('WAITING','ASSIGNED','IN PROGRESS','COMPLETED','READY','DELIVERED','CLOSED')),
  payment_status text not null default 'UNPAID' check (payment_status in ('UNPAID','PARTIAL','PAID','REFUNDED')),
  subtotal_kes numeric(12,2) not null default 0 check (subtotal_kes >= 0),
  notes text,
  checked_in_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  ready_at timestamptz,
  delivered_at timestamptz,
  closed_at timestamptz,
  created_by uuid references auth.users(id),
  unique(id,tenant_id),
  foreign key(customer_id,tenant_id) references public.carwash_customers(id,tenant_id),
  foreign key(vehicle_id,tenant_id) references public.carwash_vehicles(id,tenant_id),
  foreign key(washer_membership_id,tenant_id) references public.carwash_memberships(id,tenant_id)
);

create table if not exists public.carwash_order_services (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  order_id uuid not null,
  service_id uuid not null,
  service_name_snapshot text not null,
  price_kes_snapshot numeric(12,2) not null check (price_kes_snapshot >= 0),
  commission_kes_snapshot numeric(12,2) not null check (commission_kes_snapshot >= 0),
  rule_version text not null default 'v1',
  unique(id,tenant_id),
  foreign key(order_id,tenant_id) references public.carwash_orders(id,tenant_id) on delete cascade,
  foreign key(service_id,tenant_id) references public.carwash_services(id,tenant_id)
);

create table if not exists public.carwash_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  order_id uuid not null,
  amount_kes numeric(12,2) not null check (amount_kes > 0),
  method text not null check (method in ('CASH','CARD','M-PESA','WALLET','LOYALTY')),
  status text not null default 'PAID' check (status in ('PENDING','PAID','FAILED','REFUNDED')),
  external_reference text,
  recorded_by uuid references auth.users(id),
  recorded_at timestamptz not null default now(),
  foreign key(order_id,tenant_id) references public.carwash_orders(id,tenant_id)
);

create table if not exists public.carwash_commission_ledger (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  worker_membership_id uuid not null,
  order_id uuid not null,
  order_service_id uuid not null references public.carwash_order_services(id),
  rule_version text not null,
  amount_kes numeric(12,2) not null check (amount_kes >= 0),
  status text not null default 'PENDING' check (status in ('PENDING','APPROVED','PAID','VOID')),
  recorded_at timestamptz not null default now(),
  approved_by uuid references auth.users(id),
  unique(order_service_id),
  foreign key(worker_membership_id,tenant_id) references public.carwash_memberships(id,tenant_id),
  foreign key(order_service_id,tenant_id) references public.carwash_order_services(id,tenant_id),
  foreign key(order_id,tenant_id) references public.carwash_orders(id,tenant_id)
);

create table if not exists public.carwash_loyalty_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  customer_id uuid not null,
  balance_points bigint not null default 0 check (balance_points >= 0),
  foreign key(customer_id,tenant_id) references public.carwash_customers(id,tenant_id),
  unique(tenant_id,customer_id)
);

create table if not exists public.carwash_loyalty_ledger (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  customer_id uuid not null,
  order_id uuid,
  points bigint not null,
  event_type text not null check (event_type in ('EARN','REDEEM','ADJUST','EXPIRE')),
  created_at timestamptz not null default now(),
  foreign key(customer_id,tenant_id) references public.carwash_customers(id,tenant_id),
  foreign key(order_id,tenant_id) references public.carwash_orders(id,tenant_id)
);

create table if not exists public.carwash_audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.carwash_tenants(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.carwash_memberships add column if not exists phone text;

-- New-business onboarding is separate from Auth so an untrusted signup cannot
-- grant itself a tenant role. A platform administrator must approve it.
create table if not exists public.carwash_access_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_name text not null check (length(trim(tenant_name)) between 2 and 120),
  owner_name text not null check (length(trim(owner_name)) between 2 and 120),
  phone text not null check (length(trim(phone)) between 7 and 30),
  status text not null default 'PENDING' check (status in ('PENDING','APPROVED','REJECTED')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(user_id)
);

create table if not exists public.carwash_user_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('ACCOUNT_PENDING','ACCOUNT_APPROVED','ACCOUNT_REJECTED','SYSTEM')),
  subject text not null,
  body text not null,
  read_at timestamptz,
  reference_key text,
  created_at timestamptz not null default now()
);
alter table public.carwash_user_messages add column if not exists reference_key text;
create unique index if not exists carwash_user_messages_reference_unique
  on public.carwash_user_messages(user_id,reference_key) where reference_key is not null;
create table if not exists public.carwash_staff_invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.carwash_tenants(id) on delete cascade,
  invited_by uuid not null,
  phone text not null,
  role text not null check (role in ('RECEPTIONIST','WASHER')),
  token_hash text not null unique,
  status text not null default 'PENDING' check (status in ('PENDING','ACCEPTED','REVOKED','EXPIRED')),
  expires_at timestamptz not null default now()+interval '72 hours',
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key(invited_by,tenant_id) references public.carwash_memberships(id,tenant_id)
);
create index if not exists carwash_staff_invites_tenant_time on public.carwash_staff_invitations(tenant_id,created_at desc);
create index if not exists carwash_user_messages_inbox on public.carwash_user_messages(user_id,created_at desc);

-- Per-user write limits for sensitive RPCs. Supabase Auth/IP protections must also
-- be enabled in the project dashboard for unauthenticated signup traffic.
create table if not exists public.carwash_rpc_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  bucket_start timestamptz not null,
  request_count integer not null default 0,
  primary key(user_id,action,bucket_start)
);
alter table public.carwash_rpc_rate_limits enable row level security;
revoke all on public.carwash_rpc_rate_limits from public,anon,authenticated;

create or replace function public.carwash_consume_rate_limit(p_action text,p_limit integer,p_window_seconds integer)
returns boolean language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare actor_id uuid:=auth.uid(); bucket timestamptz; used_count integer;
begin
  if actor_id is null then raise exception 'Sign in before continuing.' using errcode='42501'; end if;
  if p_action not in ('BUSINESS_REQUEST','BUSINESS_REVIEW','STAFF_INVITE','STAFF_ACCEPT','REQUEST_DELETE','PLAN_ACTIVATE','ADMIN_SETTINGS','ORDER_DELETE','SERVICE_DELETE')
    or p_limit<1 or p_window_seconds<1 then raise exception 'Invalid rate limit.' using errcode='22023'; end if;
  bucket:=to_timestamp(floor(extract(epoch from clock_timestamp())/p_window_seconds)*p_window_seconds);
  insert into public.carwash_rpc_rate_limits(user_id,action,bucket_start,request_count)
    values(actor_id,p_action,bucket,1)
    on conflict(user_id,action,bucket_start) do update
      set request_count=public.carwash_rpc_rate_limits.request_count+1
    returning request_count into used_count;
  if used_count>p_limit then
    raise exception 'Too many requests. Please wait before trying again.' using errcode='P0001';
  end if;
  return true;
end;
$$;

create or replace function public.carwash_submit_business_request(p_tenant_name text,p_owner_name text,p_phone text)
returns public.carwash_access_requests language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare request_row public.carwash_access_requests%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in before requesting a business account.' using errcode='42501'; end if;
  perform public.carwash_consume_rate_limit('BUSINESS_REQUEST',5,3600);
  if length(trim(coalesce(p_tenant_name,''))) not between 2 and 120
    or length(trim(coalesce(p_owner_name,''))) not between 2 and 120
    or length(trim(coalesce(p_phone,''))) not between 7 and 30 then
    raise exception 'Enter a valid business name, owner name, and phone number.' using errcode='22023';
  end if;
  insert into public.carwash_access_requests(user_id,tenant_name,owner_name,phone)
  values(auth.uid(),trim(p_tenant_name),trim(p_owner_name),trim(p_phone))
  on conflict(user_id) do update set tenant_name=excluded.tenant_name,owner_name=excluded.owner_name,phone=excluded.phone,
    status=case when carwash_access_requests.status='REJECTED' then 'PENDING' else carwash_access_requests.status end,
    reviewed_by=null,reviewed_at=null
  returning * into request_row;
  insert into public.carwash_user_messages(user_id,kind,subject,body)
  values(auth.uid(),'ACCOUNT_PENDING','Request received','Your car wash business registration is pending review. We will notify you here when an administrator activates your account.')
  on conflict do nothing;
  return request_row;
end;
$$;

create or replace function public.carwash_review_business_request(p_request uuid,p_approve boolean)
returns public.carwash_access_requests language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare request_row public.carwash_access_requests%rowtype; new_tenant uuid; admin_email text;
begin
  if not public.carwash_is_platform_admin() then raise exception 'Platform administrator access is required.' using errcode='42501'; end if;
  perform public.carwash_consume_rate_limit('BUSINESS_REVIEW',60,3600);
  select * into request_row from public.carwash_access_requests where id=p_request for update;
  if not found then raise exception 'Registration request not found.' using errcode='P0002'; end if;
  if request_row.status not in ('PENDING','REJECTED') or (not p_approve and request_row.status='REJECTED') then
    raise exception 'This registration request cannot be reviewed from its current status.' using errcode='23514';
  end if;
  if p_approve then
    select email into admin_email from auth.users where id=request_row.user_id;
    insert into public.carwash_tenants(name,owner_name,status)
      values(request_row.tenant_name,request_row.owner_name,'TRIAL') returning id into new_tenant;
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

create index if not exists carwash_orders_tenant_status_time on public.carwash_orders(tenant_id,status,checked_in_at desc);
create index if not exists carwash_orders_worker_status on public.carwash_orders(washer_membership_id,status,checked_in_at desc);
create index if not exists carwash_payments_tenant_time on public.carwash_payments(tenant_id,recorded_at desc);
create index if not exists carwash_commission_worker_time on public.carwash_commission_ledger(worker_membership_id,recorded_at desc);
create index if not exists carwash_vehicles_registration on public.carwash_vehicles(tenant_id,registration);
create unique index if not exists carwash_one_platform_membership_per_user
  on public.carwash_memberships(user_id) where tenant_id is null;

create or replace function public.carwash_is_platform_admin()
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$ 
  select exists(select 1 from public.carwash_memberships m where m.user_id=auth.uid() and m.role='SUPER_ADMIN' and m.status='ACTIVE' and m.tenant_id is null)
$$;

create or replace function public.carwash_has_tenant_access(target_tenant uuid, allowed_roles text[] default array['BUSINESS_ADMIN','RECEPTIONIST','WASHER'])
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
  select public.carwash_is_platform_admin() or exists(
    select 1 from public.carwash_memberships m where m.user_id=auth.uid() and m.tenant_id=target_tenant and m.status='ACTIVE' and m.role=any(allowed_roles)
  )
$$;

create or replace function public.carwash_can_operate(target_tenant uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
  select exists (
    select 1 from public.carwash_tenants t
    where t.id=target_tenant and t.status in ('TRIAL','ACTIVE','EXPIRING SOON')
      and (not exists(select 1 from public.carwash_subscriptions s where s.tenant_id=t.id)
        or exists(
          select 1 from public.carwash_subscriptions s
          where s.id=(select latest.id from public.carwash_subscriptions latest where latest.tenant_id=t.id order by latest.starts_at desc,latest.created_at desc limit 1)
            and s.status in ('TRIAL','ACTIVE','EXPIRING SOON')
            and (s.ends_at>=now() or s.grace_until>=now())
        ))
  )
$$;

create or replace function public.carwash_delete_business_requests(p_request_ids uuid[])
returns integer language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare deleted_count integer;
begin
  if not public.carwash_is_platform_admin() then raise exception 'Platform administrator access is required.' using errcode='42501'; end if;
  if coalesce(cardinality(p_request_ids),0)<1 or cardinality(p_request_ids)>250 then raise exception 'Select between 1 and 250 requests.' using errcode='22023'; end if;
  perform public.carwash_consume_rate_limit('REQUEST_DELETE',30,3600);
  delete from public.carwash_access_requests where id=any(p_request_ids);
  get diagnostics deleted_count=row_count;
  insert into public.carwash_audit_logs(actor_user_id,action,entity_type,details)
    values(auth.uid(),'BUSINESS_REQUESTS_DELETED','ACCESS_REQUEST',jsonb_build_object('deleted_count',deleted_count));
  return deleted_count;
end;
$$;

drop function if exists public.carwash_activate_tenant_plan(uuid,uuid);
create or replace function public.carwash_activate_tenant_plan(target_tenant uuid,target_plan uuid,payment_method text default 'M-PESA',payment_reference text default null)
returns public.carwash_subscriptions language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare plan_row public.carwash_plans%rowtype; tenant_row public.carwash_tenants%rowtype; subscription_row public.carwash_subscriptions%rowtype;
begin
  if not public.carwash_is_platform_admin() then raise exception 'Platform administrator access is required.' using errcode='42501'; end if;
  perform public.carwash_consume_rate_limit('PLAN_ACTIVATE',60,3600);
  select * into tenant_row from public.carwash_tenants where id=target_tenant for update;
  if not found then raise exception 'Business account not found.' using errcode='P0002'; end if;
  select * into plan_row from public.carwash_plans where id=target_plan and active;
  if not found then raise exception 'Choose an active subscription plan.' using errcode='22023'; end if;
  if payment_method not in ('CASH','CARD','M-PESA','BANK TRANSFER') then raise exception 'Choose a supported business payment method.' using errcode='22023'; end if;
  insert into public.carwash_subscriptions(tenant_id,plan_id,starts_at,ends_at,status,auto_renew)
    values(target_tenant,target_plan,now(),now()+make_interval(days=>plan_row.duration_days),'ACTIVE',false)
    returning * into subscription_row;
  insert into public.carwash_subscription_payments(tenant_id,subscription_id,plan_id,amount_kes,method,external_reference,confirmed_by)
    values(target_tenant,subscription_row.id,target_plan,plan_row.price_kes,payment_method,nullif(trim(payment_reference),''),auth.uid());
  update public.carwash_tenants set status='ACTIVE' where id=target_tenant;
  insert into public.carwash_user_messages(user_id,kind,subject,body,reference_key)
    select m.user_id,'SYSTEM','Business plan activated',
      'Your '||plan_row.name||' plan for '||tenant_row.name||' is active until '||to_char(subscription_row.ends_at at time zone 'Africa/Nairobi','DD Mon YYYY HH24:MI')||'.',
      'PLAN_ACTIVATED:'||subscription_row.id::text
    from public.carwash_memberships m where m.tenant_id=target_tenant and m.status='ACTIVE'
    on conflict (user_id,reference_key) where reference_key is not null do nothing;
  insert into public.carwash_audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,details)
    values(target_tenant,auth.uid(),'TENANT_PLAN_ACTIVATED','SUBSCRIPTION',subscription_row.id::text,jsonb_build_object('plan_id',target_plan,'ends_at',subscription_row.ends_at));
  return subscription_row;
end;
$$;

create or replace function public.carwash_notify_billing_status(target_tenant uuid)
returns boolean language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare tenant_row public.carwash_tenants%rowtype; subscription_row public.carwash_subscriptions%rowtype; plan_name text;
begin
  if not exists(select 1 from public.carwash_memberships m where m.user_id=auth.uid() and m.tenant_id=target_tenant and m.status='ACTIVE') then
    raise exception 'Active business membership is required.' using errcode='42501';
  end if;
  select * into tenant_row from public.carwash_tenants where id=target_tenant;
  select * into subscription_row from public.carwash_subscriptions s where s.tenant_id=target_tenant order by s.starts_at desc,s.created_at desc limit 1;
  if not found or subscription_row.status='CANCELLED'
    or subscription_row.ends_at>=now() or coalesce(subscription_row.grace_until>=now(),false) then return false; end if;
  select name into plan_name from public.carwash_plans where id=subscription_row.plan_id;
  insert into public.carwash_user_messages(user_id,kind,subject,body,reference_key)
    select m.user_id,'SYSTEM','Business plan overdue',
      'Your '||coalesce(plan_name,'business')||' plan for '||tenant_row.name||' expired on '||to_char(subscription_row.ends_at at time zone 'Africa/Nairobi','DD Mon YYYY')||'. Your account remains accessible in restricted, read-only mode. Please contact the platform administrator to confirm payment and reactivate your plan.',
      'PLAN_OVERDUE:'||subscription_row.id::text
    from public.carwash_memberships m where m.tenant_id=target_tenant and m.status='ACTIVE'
    on conflict (user_id,reference_key) where reference_key is not null do nothing;
  return true;
end;
$$;

create or replace function public.carwash_update_platform_admin_name(p_full_name text)
returns public.carwash_memberships language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare membership_row public.carwash_memberships%rowtype;
begin
  if not public.carwash_is_platform_admin() then raise exception 'Platform administrator access is required.' using errcode='42501'; end if;
  perform public.carwash_consume_rate_limit('ADMIN_SETTINGS',20,3600);
  if length(trim(coalesce(p_full_name,''))) not between 2 and 120 then raise exception 'Enter a name between 2 and 120 characters.' using errcode='22023'; end if;
  update public.carwash_memberships set full_name=trim(p_full_name)
    where user_id=auth.uid() and tenant_id is null and role='SUPER_ADMIN' and status='ACTIVE'
    returning * into membership_row;
  return membership_row;
end;
$$;

create or replace function public.carwash_update_tenant_settings(target_tenant uuid,p_business_name text,p_branch text,p_loyalty_rate numeric)
returns public.carwash_tenants language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare actor public.carwash_memberships%rowtype; tenant_row public.carwash_tenants%rowtype;
begin
  select * into actor from public.carwash_memberships where user_id=auth.uid() and tenant_id=target_tenant and role='BUSINESS_ADMIN' and status='ACTIVE' limit 1;
  if not found or not public.carwash_can_operate(target_tenant) then raise exception 'Active business administrator access is required.' using errcode='42501'; end if;
  if length(trim(coalesce(p_business_name,''))) not between 2 and 120 or length(trim(coalesce(p_branch,''))) not between 2 and 120 or p_loyalty_rate<0 or p_loyalty_rate>100 then
    raise exception 'Enter a valid business name, branch and loyalty rate.' using errcode='22023';
  end if;
  perform public.carwash_consume_rate_limit('ADMIN_SETTINGS',20,3600);
  update public.carwash_tenants set name=trim(p_business_name),settings=jsonb_build_object('branch',trim(p_branch),'loyaltyRate',p_loyalty_rate)
    where id=target_tenant returning * into tenant_row;
  insert into public.carwash_audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,details)
    values(target_tenant,auth.uid(),'TENANT_SETTINGS_UPDATED','TENANT',target_tenant::text,tenant_row.settings);
  return tenant_row;
end;
$$;

create or replace function public.carwash_is_assigned_worker(target_order uuid, target_tenant uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
  select exists(select 1 from public.carwash_orders o join public.carwash_memberships m on m.id=o.washer_membership_id where o.id=target_order and o.tenant_id=target_tenant and m.user_id=auth.uid() and m.role='WASHER' and m.status='ACTIVE')
$$;

create or replace function public.carwash_create_staff_invite(target_tenant uuid,target_phone text,target_role text)
returns text language plpgsql security definer set search_path=pg_catalog,extensions,public,pg_temp as $$
declare actor public.carwash_memberships%rowtype; raw_token text; normalized_phone text;
begin
  select * into actor from public.carwash_memberships where user_id=auth.uid() and tenant_id=target_tenant and role='BUSINESS_ADMIN' and status='ACTIVE' limit 1;
  if not found or not public.carwash_can_operate(target_tenant) then raise exception 'Active business administrator access is required.' using errcode='42501'; end if;
  perform public.carwash_consume_rate_limit('STAFF_INVITE',10,3600);
  normalized_phone:=regexp_replace(coalesce(target_phone,''),'[^0-9+]','','g');
  if length(regexp_replace(normalized_phone,'[^0-9]','','g')) not between 7 and 15 then raise exception 'Enter a valid team member phone number.' using errcode='22023'; end if;
  if target_role is null or target_role not in ('RECEPTIONIST','WASHER') then raise exception 'Choose a staff portal managed by the business.' using errcode='22023'; end if;
  raw_token:=encode(gen_random_bytes(32),'hex');
  insert into public.carwash_staff_invitations(tenant_id,invited_by,phone,role,token_hash)
  values(target_tenant,actor.id,normalized_phone,target_role,encode(digest(raw_token,'sha256'),'hex'));
  insert into public.carwash_audit_logs(tenant_id,actor_user_id,action,entity_type,details)
  values(target_tenant,auth.uid(),'STAFF_INVITATION_CREATED','STAFF_INVITATION',jsonb_build_object('phone',normalized_phone,'role',target_role));
  return raw_token;
end;
$$;

create or replace function public.carwash_accept_staff_invitation(invite_token text,staff_name text)
returns public.carwash_memberships language plpgsql security definer set search_path=pg_catalog,extensions,public,pg_temp as $$
declare invite public.carwash_staff_invitations%rowtype; result public.carwash_memberships%rowtype; verified_at timestamptz;
begin
  if auth.uid() is null then raise exception 'Sign in before accepting an invitation.' using errcode='42501'; end if;
  perform public.carwash_consume_rate_limit('STAFF_ACCEPT',10,3600);
  if length(trim(coalesce(staff_name,''))) not between 2 and 120 or invite_token !~ '^[0-9a-fA-F]{64}$' then raise exception 'This staff invitation is invalid.' using errcode='22023'; end if;
  select email_confirmed_at into verified_at from auth.users where id=auth.uid();
  if verified_at is null then raise exception 'Verify your email before accepting the staff invitation.' using errcode='42501'; end if;
  select * into invite from public.carwash_staff_invitations
    where token_hash=encode(digest(invite_token,'sha256'),'hex') and status='PENDING' and expires_at>now() for update;
  if not found then raise exception 'This staff invitation has expired or was already used.' using errcode='P0002'; end if;
  insert into public.carwash_memberships(user_id,tenant_id,role,full_name,phone,status)
    values(auth.uid(),invite.tenant_id,invite.role,trim(staff_name),invite.phone,'ACTIVE') returning * into result;
  update public.carwash_staff_invitations set status='ACCEPTED',accepted_by=auth.uid(),accepted_at=now() where id=invite.id;
  insert into public.carwash_user_messages(user_id,kind,subject,body)
    values(auth.uid(),'ACCOUNT_APPROVED','Your staff account is active','Your '||replace(invite.role,'_',' ')||' account is now active. Sign in to open your OshaHub Carwash portal.');
  insert into public.carwash_audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,details)
    values(invite.tenant_id,auth.uid(),'STAFF_INVITATION_ACCEPTED','STAFF_INVITATION',invite.id::text,jsonb_build_object('role',invite.role));
  return result;
end;
$$;

create or replace function public.carwash_transition_order(target_order uuid, target_state text)
returns public.carwash_orders language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  current_order public.carwash_orders%rowtype;
  actor public.carwash_memberships%rowtype;
  is_allowed boolean := false;
  previous_state text;
  loyalty_points bigint;
begin
  select * into current_order from public.carwash_orders where id=target_order for update;
  if not found then raise exception 'Wash order not found.' using errcode='P0002'; end if;
  select * into actor from public.carwash_memberships where user_id=auth.uid() and tenant_id=current_order.tenant_id and status='ACTIVE' limit 1;
  if not found then raise exception 'Active tenant membership required.' using errcode='42501'; end if;
  if not public.carwash_can_operate(current_order.tenant_id) then raise exception 'This subscription is restricted. Contact the platform administrator.' using errcode='55000'; end if;

  is_allowed := case
    when current_order.status='WAITING' and target_state='ASSIGNED' then actor.role in ('BUSINESS_ADMIN','RECEPTIONIST') and current_order.washer_membership_id is not null and exists(select 1 from public.carwash_memberships w where w.id=current_order.washer_membership_id and w.tenant_id=current_order.tenant_id and w.role='WASHER' and w.status='ACTIVE')
    when current_order.status='ASSIGNED' and target_state='IN PROGRESS' then actor.role='WASHER' and current_order.washer_membership_id=actor.id
    when current_order.status='IN PROGRESS' and target_state='COMPLETED' then actor.role='WASHER' and current_order.washer_membership_id=actor.id
    when current_order.status='COMPLETED' and target_state='READY' then actor.role in ('BUSINESS_ADMIN','RECEPTIONIST')
    when current_order.status='READY' and target_state='DELIVERED' then actor.role in ('BUSINESS_ADMIN','RECEPTIONIST')
      and current_order.payment_status='PAID'
    when current_order.status='DELIVERED' and target_state='CLOSED' then actor.role='BUSINESS_ADMIN'
    else false end;
  if not is_allowed then raise exception 'This job transition is not allowed.' using errcode='42501'; end if;

  if target_state='DELIVERED' and coalesce((select sum(amount_kes) from public.carwash_payments where order_id=target_order and status='PAID'),0) < current_order.subtotal_kes then
    raise exception 'The order must be fully paid before delivery.' using errcode='23514';
  end if;

  previous_state := current_order.status;
  update public.carwash_orders set status=target_state,
    started_at=case when target_state='IN PROGRESS' then now() else started_at end,
    completed_at=case when target_state='COMPLETED' then now() else completed_at end,
    ready_at=case when target_state='READY' then now() else ready_at end,
    delivered_at=case when target_state='DELIVERED' then now() else delivered_at end,
    closed_at=case when target_state='CLOSED' then now() else closed_at end
  where id=target_order returning * into current_order;

  if target_state='COMPLETED' then
    insert into public.carwash_commission_ledger(tenant_id,worker_membership_id,order_id,order_service_id,rule_version,amount_kes)
    select current_order.tenant_id,actor.id,current_order.id,os.id,os.rule_version,os.commission_kes_snapshot
    from public.carwash_order_services os where os.order_id=current_order.id and os.tenant_id=current_order.tenant_id
    on conflict(order_service_id) do nothing;
  elsif target_state='CLOSED' then
    select floor(current_order.subtotal_kes*coalesce((t.settings->>'loyaltyRate')::numeric,1))::bigint into loyalty_points
      from public.carwash_tenants t where t.id=current_order.tenant_id;
    insert into public.carwash_loyalty_accounts(tenant_id,customer_id,balance_points)
    values(current_order.tenant_id,current_order.customer_id,loyalty_points)
    on conflict(tenant_id,customer_id) do update set balance_points=public.carwash_loyalty_accounts.balance_points+excluded.balance_points;
    insert into public.carwash_loyalty_ledger(tenant_id,customer_id,order_id,points,event_type)
    values(current_order.tenant_id,current_order.customer_id,current_order.id,loyalty_points,'EARN');
  end if;

  insert into public.carwash_audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,details)
  values(current_order.tenant_id,auth.uid(),'ORDER_'||replace(target_state,' ','_'),'WASH_ORDER',current_order.id::text,jsonb_build_object('from',previous_state,'to',target_state));
  return current_order;
end;
$$;

create or replace function public.carwash_assign_order(target_order uuid,target_washer uuid default null)
returns public.carwash_orders language plpgsql security definer set search_path=pg_catalog,public as $$
declare current_order public.carwash_orders%rowtype; actor public.carwash_memberships%rowtype;
begin
  select * into current_order from public.carwash_orders where id=target_order for update;
  if not found then raise exception 'Wash order not found.' using errcode='P0002'; end if;
  select * into actor from public.carwash_memberships where user_id=auth.uid() and tenant_id=current_order.tenant_id and role in ('BUSINESS_ADMIN','RECEPTIONIST') and status='ACTIVE' limit 1;
  if not found or not public.carwash_can_operate(current_order.tenant_id) then raise exception 'Active front desk access is required.' using errcode='42501'; end if;
  if current_order.status<>'WAITING' then raise exception 'Only waiting orders can be assigned.' using errcode='23514'; end if;
  if target_washer is null then
    select w.id into target_washer from public.carwash_memberships w
    where w.tenant_id=current_order.tenant_id and w.role='WASHER' and w.status='ACTIVE'
    order by (select count(*) from public.carwash_orders o where o.washer_membership_id=w.id and o.status in ('ASSIGNED','IN PROGRESS')) asc,w.created_at asc limit 1;
  end if;
  if target_washer is null or not exists(select 1 from public.carwash_memberships where id=target_washer and tenant_id=current_order.tenant_id and role='WASHER' and status='ACTIVE') then
    raise exception 'Choose an active washer from this business.' using errcode='22023';
  end if;
  update public.carwash_orders set washer_membership_id=target_washer,status='ASSIGNED' where id=target_order returning * into current_order;
  insert into public.carwash_audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,details)
    values(current_order.tenant_id,auth.uid(),'ORDER_ASSIGNED','WASH_ORDER',current_order.id::text,jsonb_build_object('washer_membership_id',target_washer));
  return current_order;
end;
$$;

create or replace function public.carwash_create_order(target_tenant uuid,target_customer uuid,target_vehicle uuid,target_services uuid[],target_washer uuid default null)
returns public.carwash_orders language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor public.carwash_memberships%rowtype; created_order public.carwash_orders%rowtype; service_count integer;
begin
  select * into actor from public.carwash_memberships where user_id=auth.uid() and tenant_id=target_tenant and role in ('BUSINESS_ADMIN','RECEPTIONIST') and status='ACTIVE' limit 1;
  if not found or not public.carwash_can_operate(target_tenant) then raise exception 'Active front desk access is required.' using errcode='42501'; end if;
  if coalesce(cardinality(target_services),0)<1 or cardinality(target_services)>30 then raise exception 'Choose between 1 and 30 services.' using errcode='22023'; end if;
  if not exists(select 1 from public.carwash_customers where id=target_customer and tenant_id=target_tenant)
    or not exists(select 1 from public.carwash_vehicles where id=target_vehicle and customer_id=target_customer and tenant_id=target_tenant) then
    raise exception 'Choose a vehicle and customer from this business.' using errcode='22023';
  end if;
  select count(*) into service_count from public.carwash_services where tenant_id=target_tenant and id=any(target_services) and active;
  if service_count<>cardinality(target_services) then raise exception 'A selected wash service is no longer available.' using errcode='22023'; end if;
  if target_washer is not null and not exists(select 1 from public.carwash_memberships where id=target_washer and tenant_id=target_tenant and role='WASHER' and status='ACTIVE') then
    raise exception 'Choose an active washer from this business.' using errcode='22023';
  end if;
  insert into public.carwash_orders(tenant_id,customer_id,vehicle_id,washer_membership_id,status,payment_status,subtotal_kes,created_by)
  select target_tenant,target_customer,target_vehicle,target_washer,case when target_washer is null then 'WAITING' else 'ASSIGNED' end,'UNPAID',sum(s.price_kes),auth.uid()
    from public.carwash_services s where s.tenant_id=target_tenant and s.id=any(target_services)
    returning * into created_order;
  insert into public.carwash_order_services(tenant_id,order_id,service_id,service_name_snapshot,price_kes_snapshot,commission_kes_snapshot,rule_version)
    select target_tenant,created_order.id,s.id,s.name,s.price_kes,s.commission_kes,'v1'
    from public.carwash_services s where s.tenant_id=target_tenant and s.id=any(target_services);
  insert into public.carwash_audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,details)
    values(target_tenant,auth.uid(),'ORDER_CREATED','WASH_ORDER',created_order.id::text,jsonb_build_object('subtotal_kes',created_order.subtotal_kes));
  return created_order;
end;
$$;

create or replace function public.carwash_update_staff_status(target_membership uuid,next_status text)
returns public.carwash_memberships language plpgsql security definer set search_path=pg_catalog,public as $$
declare staff_row public.carwash_memberships%rowtype; actor public.carwash_memberships%rowtype;
begin
  if next_status not in ('ACTIVE','SUSPENDED') then raise exception 'Choose a valid team status.' using errcode='22023'; end if;
  select * into staff_row from public.carwash_memberships where id=target_membership for update;
  if not found then raise exception 'Team member not found.' using errcode='P0002'; end if;
  select * into actor from public.carwash_memberships where user_id=auth.uid() and tenant_id=staff_row.tenant_id and role='BUSINESS_ADMIN' and status='ACTIVE' limit 1;
  if not found or not public.carwash_can_operate(staff_row.tenant_id) then raise exception 'Active business administrator access is required.' using errcode='42501'; end if;
  if staff_row.role not in ('RECEPTIONIST','WASHER') then raise exception 'Only invited team accounts can be changed here.' using errcode='42501'; end if;
  update public.carwash_memberships set status=next_status where id=target_membership returning * into staff_row;
  insert into public.carwash_audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,details)
    values(staff_row.tenant_id,auth.uid(),'STAFF_STATUS_CHANGED','MEMBERSHIP',staff_row.id::text,jsonb_build_object('status',next_status));
  return staff_row;
end;
$$;

create or replace function public.carwash_record_payment(target_order uuid, paid_amount numeric, payment_method text, payment_reference text default null)
returns public.carwash_payments language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  current_order public.carwash_orders%rowtype;
  actor public.carwash_memberships%rowtype;
  payment public.carwash_payments%rowtype;
  already_paid numeric(12,2);
begin
  select * into current_order from public.carwash_orders where id=target_order for update;
  if not found then raise exception 'Wash order not found.' using errcode='P0002'; end if;
  select * into actor from public.carwash_memberships where user_id=auth.uid() and tenant_id=current_order.tenant_id and status='ACTIVE' and role in ('BUSINESS_ADMIN','RECEPTIONIST') limit 1;
  if not found or not public.carwash_can_operate(current_order.tenant_id) then raise exception 'Active reception access is required.' using errcode='42501'; end if;
  if paid_amount<=0 or payment_method not in ('CASH','CARD','M-PESA','WALLET','LOYALTY') then raise exception 'Enter a valid payment amount and method.' using errcode='23514'; end if;
  select coalesce(sum(amount_kes),0) into already_paid from public.carwash_payments where order_id=target_order and status='PAID';
  if already_paid+paid_amount>current_order.subtotal_kes then raise exception 'Payment is greater than the remaining balance.' using errcode='23514'; end if;
  insert into public.carwash_payments(tenant_id,order_id,amount_kes,method,status,external_reference,recorded_by)
  values(current_order.tenant_id,target_order,paid_amount,payment_method,'PAID',nullif(trim(payment_reference),''),auth.uid()) returning * into payment;
  update public.carwash_orders set payment_status=case when already_paid+paid_amount>=subtotal_kes then 'PAID' else 'PARTIAL' end where id=target_order;
  insert into public.carwash_audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,details)
  values(current_order.tenant_id,auth.uid(),'PAYMENT_RECORDED','PAYMENT',payment.id::text,jsonb_build_object('order_id',target_order,'amount_kes',paid_amount,'method',payment_method));
  return payment;
end;
$$;

create or replace function public.carwash_review_commission(ledger_entry uuid, next_status text)
returns public.carwash_commission_ledger language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  entry public.carwash_commission_ledger%rowtype;
  actor public.carwash_memberships%rowtype;
begin
  select * into entry from public.carwash_commission_ledger where id=ledger_entry for update;
  if not found then raise exception 'Commission entry not found.' using errcode='P0002'; end if;
  select * into actor from public.carwash_memberships where user_id=auth.uid() and tenant_id=entry.tenant_id and role='BUSINESS_ADMIN' and status='ACTIVE' limit 1;
  if not found or not public.carwash_can_operate(entry.tenant_id) then raise exception 'Business admin access is required.' using errcode='42501'; end if;
  if not ((entry.status='PENDING' and next_status='APPROVED') or (entry.status='APPROVED' and next_status='PAID')) then raise exception 'Invalid commission ledger transition.' using errcode='23514'; end if;
  update public.carwash_commission_ledger set status=next_status,approved_by=case when next_status='APPROVED' then auth.uid() else approved_by end where id=ledger_entry returning * into entry;
  insert into public.carwash_audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,details)
  values(entry.tenant_id,auth.uid(),'COMMISSION_'||next_status,'COMMISSION',entry.id::text,jsonb_build_object('amount_kes',entry.amount_kes));
  return entry;
end;
$$;

alter table public.carwash_tenants enable row level security;
alter table public.carwash_memberships enable row level security;
alter table public.carwash_plans enable row level security;
alter table public.carwash_subscriptions enable row level security;
alter table public.carwash_subscription_payments enable row level security;
alter table public.carwash_customers enable row level security;
alter table public.carwash_vehicles enable row level security;
alter table public.carwash_services enable row level security;
alter table public.carwash_orders enable row level security;
alter table public.carwash_order_services enable row level security;
alter table public.carwash_payments enable row level security;
alter table public.carwash_commission_ledger enable row level security;
alter table public.carwash_loyalty_accounts enable row level security;
alter table public.carwash_loyalty_ledger enable row level security;
alter table public.carwash_audit_logs enable row level security;
alter table public.carwash_access_requests enable row level security;
alter table public.carwash_user_messages enable row level security;
alter table public.carwash_staff_invitations enable row level security;

drop policy if exists cw_tenants_read on public.carwash_tenants;
create policy cw_tenants_read on public.carwash_tenants for select using (public.carwash_is_platform_admin() or public.carwash_has_tenant_access(id));
drop policy if exists cw_tenants_platform_write on public.carwash_tenants;
create policy cw_tenants_platform_write on public.carwash_tenants for all using (public.carwash_is_platform_admin()) with check (public.carwash_is_platform_admin());
drop policy if exists cw_memberships_read on public.carwash_memberships;
create policy cw_memberships_read on public.carwash_memberships for select using (user_id=auth.uid() or public.carwash_is_platform_admin() or (tenant_id is not null and public.carwash_has_tenant_access(tenant_id,array['BUSINESS_ADMIN'])));
drop policy if exists cw_memberships_admin_write on public.carwash_memberships;
drop policy if exists cw_memberships_platform_write on public.carwash_memberships;
create policy cw_memberships_platform_write on public.carwash_memberships for all using (public.carwash_is_platform_admin()) with check (public.carwash_is_platform_admin());
revoke insert,update,delete on public.carwash_memberships from anon,authenticated;
grant select on public.carwash_memberships to authenticated;
drop policy if exists cw_plans_read on public.carwash_plans;
create policy cw_plans_read on public.carwash_plans for select using (active or public.carwash_is_platform_admin());
drop policy if exists cw_plans_admin_write on public.carwash_plans;
create policy cw_plans_admin_write on public.carwash_plans for all using (public.carwash_is_platform_admin()) with check (public.carwash_is_platform_admin());
drop policy if exists cw_subscriptions_read on public.carwash_subscriptions;
create policy cw_subscriptions_read on public.carwash_subscriptions for select using (public.carwash_is_platform_admin() or public.carwash_has_tenant_access(tenant_id,array['BUSINESS_ADMIN']));
drop policy if exists cw_subscriptions_admin_write on public.carwash_subscriptions;
create policy cw_subscriptions_admin_write on public.carwash_subscriptions for all using (public.carwash_is_platform_admin()) with check (public.carwash_is_platform_admin());
drop policy if exists cw_subscription_payments_read on public.carwash_subscription_payments;
create policy cw_subscription_payments_read on public.carwash_subscription_payments for select using (public.carwash_is_platform_admin() or public.carwash_has_tenant_access(tenant_id,array['BUSINESS_ADMIN']));
revoke all on public.carwash_subscription_payments from public,anon,authenticated;
grant select on public.carwash_subscription_payments to authenticated;
drop policy if exists cw_customers_read on public.carwash_customers;
create policy cw_customers_read on public.carwash_customers for select using (
  public.carwash_has_tenant_access(tenant_id,array['BUSINESS_ADMIN','RECEPTIONIST'])
  or (public.carwash_has_tenant_access(tenant_id,array['WASHER']) and exists (
    select 1 from public.carwash_orders o where o.tenant_id=carwash_customers.tenant_id
      and o.customer_id=carwash_customers.id and public.carwash_is_assigned_worker(o.id,o.tenant_id)
  ))
);
drop policy if exists cw_customers_insert on public.carwash_customers;
create policy cw_customers_insert on public.carwash_customers for insert with check (public.carwash_has_tenant_access(tenant_id,array['BUSINESS_ADMIN','RECEPTIONIST']) and public.carwash_can_operate(tenant_id));
drop policy if exists cw_customers_update on public.carwash_customers;
create policy cw_customers_update on public.carwash_customers for update using (public.carwash_has_tenant_access(tenant_id,array['BUSINESS_ADMIN','RECEPTIONIST']) and public.carwash_can_operate(tenant_id)) with check (public.carwash_has_tenant_access(tenant_id,array['BUSINESS_ADMIN','RECEPTIONIST']) and public.carwash_can_operate(tenant_id));
drop policy if exists cw_customers_delete on public.carwash_customers;
create policy cw_customers_delete on public.carwash_customers for delete using (public.carwash_has_tenant_access(tenant_id,array['BUSINESS_ADMIN']) and public.carwash_can_operate(tenant_id));
drop policy if exists cw_vehicles_read on public.carwash_vehicles;
create policy cw_vehicles_read on public.carwash_vehicles for select using (
  public.carwash_has_tenant_access(tenant_id,array['BUSINESS_ADMIN','RECEPTIONIST'])
  or (public.carwash_has_tenant_access(tenant_id,array['WASHER']) and exists (
    select 1 from public.carwash_orders o where o.tenant_id=carwash_vehicles.tenant_id
      and o.vehicle_id=carwash_vehicles.id and public.carwash_is_assigned_worker(o.id,o.tenant_id)
  ))
);
drop policy if exists cw_vehicles_insert on public.carwash_vehicles;
create policy cw_vehicles_insert on public.carwash_vehicles for insert with check (public.carwash_has_tenant_access(tenant_id,array['BUSINESS_ADMIN','RECEPTIONIST']) and public.carwash_can_operate(tenant_id));
drop policy if exists cw_vehicles_update on public.carwash_vehicles;
create policy cw_vehicles_update on public.carwash_vehicles for update using (public.carwash_has_tenant_access(tenant_id,array['BUSINESS_ADMIN','RECEPTIONIST']) and public.carwash_can_operate(tenant_id)) with check (public.carwash_has_tenant_access(tenant_id,array['BUSINESS_ADMIN','RECEPTIONIST']) and public.carwash_can_operate(tenant_id));
drop policy if exists cw_vehicles_delete on public.carwash_vehicles;
create policy cw_vehicles_delete on public.carwash_vehicles for delete using (public.carwash_has_tenant_access(tenant_id,array['BUSINESS_ADMIN']) and public.carwash_can_operate(tenant_id));
drop policy if exists cw_services_read on public.carwash_services;
create policy cw_services_read on public.carwash_services for select using (
  (active and public.carwash_has_tenant_access(tenant_id))
  or public.carwash_has_tenant_access(tenant_id,array['BUSINESS_ADMIN'])
);
drop policy if exists cw_services_admin_write on public.carwash_services;
create policy cw_services_admin_write on public.carwash_services for all using (public.carwash_has_tenant_access(tenant_id,array['BUSINESS_ADMIN']) and public.carwash_can_operate(tenant_id)) with check (public.carwash_has_tenant_access(tenant_id,array['BUSINESS_ADMIN']) and public.carwash_can_operate(tenant_id));
drop policy if exists cw_orders_read on public.carwash_orders;
create policy cw_orders_read on public.carwash_orders for select using (public.carwash_has_tenant_access(tenant_id) and (public.carwash_is_platform_admin() or not exists(select 1 from public.carwash_memberships m where m.user_id=auth.uid() and m.tenant_id=carwash_orders.tenant_id and m.role='WASHER') or public.carwash_is_assigned_worker(id,tenant_id)));
drop policy if exists cw_orders_ops_write on public.carwash_orders;
create policy cw_orders_ops_write on public.carwash_orders for insert with check (public.carwash_has_tenant_access(tenant_id,array['BUSINESS_ADMIN','RECEPTIONIST']) and public.carwash_can_operate(tenant_id));
drop policy if exists cw_order_services_read on public.carwash_order_services;
create policy cw_order_services_read on public.carwash_order_services for select using (
  public.carwash_has_tenant_access(tenant_id,array['BUSINESS_ADMIN','RECEPTIONIST'])
  or (public.carwash_has_tenant_access(tenant_id,array['WASHER']) and exists (
    select 1 from public.carwash_orders o where o.id=carwash_order_services.order_id
      and o.tenant_id=carwash_order_services.tenant_id and public.carwash_is_assigned_worker(o.id,o.tenant_id)
  ))
);
drop policy if exists cw_order_services_insert on public.carwash_order_services;
create policy cw_order_services_insert on public.carwash_order_services for insert with check (public.carwash_has_tenant_access(tenant_id,array['BUSINESS_ADMIN','RECEPTIONIST']) and public.carwash_can_operate(tenant_id));
drop policy if exists cw_payments_read on public.carwash_payments;
create policy cw_payments_read on public.carwash_payments for select using (public.carwash_has_tenant_access(tenant_id,array['BUSINESS_ADMIN','RECEPTIONIST']));
drop policy if exists cw_commission_read on public.carwash_commission_ledger;
create policy cw_commission_read on public.carwash_commission_ledger for select using (public.carwash_has_tenant_access(tenant_id) and (public.carwash_is_platform_admin() or public.carwash_has_tenant_access(tenant_id,array['BUSINESS_ADMIN']) or exists(select 1 from public.carwash_memberships m where m.id=worker_membership_id and m.user_id=auth.uid())));
drop policy if exists cw_loyalty_accounts_read on public.carwash_loyalty_accounts;
create policy cw_loyalty_accounts_read on public.carwash_loyalty_accounts for select using (public.carwash_has_tenant_access(tenant_id,array['BUSINESS_ADMIN','RECEPTIONIST']));
drop policy if exists cw_loyalty_ledger_read on public.carwash_loyalty_ledger;
create policy cw_loyalty_ledger_read on public.carwash_loyalty_ledger for select using (public.carwash_has_tenant_access(tenant_id,array['BUSINESS_ADMIN','RECEPTIONIST']));
drop policy if exists cw_audit_read on public.carwash_audit_logs;
create policy cw_audit_read on public.carwash_audit_logs for select using (public.carwash_is_platform_admin() or (tenant_id is not null and public.carwash_has_tenant_access(tenant_id,array['BUSINESS_ADMIN'])));
drop policy if exists cw_audit_insert on public.carwash_audit_logs;
create policy cw_audit_insert on public.carwash_audit_logs for insert with check (actor_user_id=auth.uid() and (tenant_id is null or public.carwash_has_tenant_access(tenant_id)));
drop policy if exists cw_access_requests_read on public.carwash_access_requests;
create policy cw_access_requests_read on public.carwash_access_requests for select using (user_id=auth.uid() or public.carwash_is_platform_admin());
drop policy if exists cw_user_messages_read on public.carwash_user_messages;
create policy cw_user_messages_read on public.carwash_user_messages for select using (user_id=auth.uid());
drop policy if exists cw_user_messages_update on public.carwash_user_messages;
create policy cw_user_messages_update on public.carwash_user_messages for update using (user_id=auth.uid()) with check (user_id=auth.uid());
drop policy if exists cw_staff_invites_admin_read on public.carwash_staff_invitations;
create policy cw_staff_invites_admin_read on public.carwash_staff_invitations for select using (public.carwash_has_tenant_access(tenant_id,array['BUSINESS_ADMIN']));
grant select on public.carwash_access_requests,public.carwash_user_messages to authenticated;
grant update(read_at) on public.carwash_user_messages to authenticated;
grant select on public.carwash_staff_invitations to authenticated;

revoke all on function public.carwash_is_platform_admin() from public, anon;
revoke all on function public.carwash_has_tenant_access(uuid,text[]) from public, anon;
revoke all on function public.carwash_can_operate(uuid) from public, anon;
revoke all on function public.carwash_is_assigned_worker(uuid,uuid) from public, anon;
revoke all on function public.carwash_transition_order(uuid,text) from public, anon;
revoke all on function public.carwash_assign_order(uuid,uuid) from public, anon;
revoke all on function public.carwash_create_order(uuid,uuid,uuid,uuid[],uuid) from public, anon;
revoke all on function public.carwash_update_staff_status(uuid,text) from public, anon;
revoke all on function public.carwash_record_payment(uuid,numeric,text,text) from public, anon;
revoke all on function public.carwash_review_commission(uuid,text) from public, anon;
revoke all on function public.carwash_submit_business_request(text,text,text) from public, anon;
revoke all on function public.carwash_review_business_request(uuid,boolean) from public, anon;
revoke all on function public.carwash_create_staff_invite(uuid,text,text) from public, anon;
revoke all on function public.carwash_accept_staff_invitation(text,text) from public, anon;
revoke all on function public.carwash_delete_business_requests(uuid[]) from public, anon;
revoke all on function public.carwash_activate_tenant_plan(uuid,uuid,text,text) from public, anon;
revoke all on function public.carwash_notify_billing_status(uuid) from public, anon;
revoke all on function public.carwash_update_platform_admin_name(text) from public, anon;
revoke all on function public.carwash_update_tenant_settings(uuid,text,text,numeric) from public, anon;
revoke all on function public.carwash_consume_rate_limit(text,integer,integer) from public, anon, authenticated;

grant execute on function public.carwash_is_platform_admin() to authenticated;
grant execute on function public.carwash_has_tenant_access(uuid,text[]) to authenticated;
grant execute on function public.carwash_can_operate(uuid) to authenticated;
grant execute on function public.carwash_is_assigned_worker(uuid,uuid) to authenticated;
grant execute on function public.carwash_transition_order(uuid,text) to authenticated;
grant execute on function public.carwash_assign_order(uuid,uuid) to authenticated;
grant execute on function public.carwash_create_order(uuid,uuid,uuid,uuid[],uuid) to authenticated;
grant execute on function public.carwash_update_staff_status(uuid,text) to authenticated;
grant execute on function public.carwash_record_payment(uuid,numeric,text,text) to authenticated;
grant execute on function public.carwash_review_commission(uuid,text) to authenticated;
grant execute on function public.carwash_submit_business_request(text,text,text) to authenticated;
grant execute on function public.carwash_review_business_request(uuid,boolean) to authenticated;
grant execute on function public.carwash_create_staff_invite(uuid,text,text) to authenticated;
grant execute on function public.carwash_accept_staff_invitation(text,text) to authenticated;
grant execute on function public.carwash_delete_business_requests(uuid[]) to authenticated;
grant execute on function public.carwash_activate_tenant_plan(uuid,uuid,text,text) to authenticated;
grant execute on function public.carwash_notify_billing_status(uuid) to authenticated;
grant execute on function public.carwash_update_platform_admin_name(text) to authenticated;
grant execute on function public.carwash_update_tenant_settings(uuid,text,text,numeric) to authenticated;

-- Call carwash_transition_order from authenticated clients for atomic, role-checked transitions.


-- Customer plans, one-time free trial extension, and reviewed payment requests.
-- Seven-day OshaHub trial and tenant billing requests. Payments are confirmed
-- by a platform administrator after checking the submitted payment reference.
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

create table if not exists public.carwash_billing_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.carwash_tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  request_type text not null check(request_type in ('TRIAL_EXTENSION','PLAN_PURCHASE')),
  plan_id uuid references public.carwash_plans(id) on delete restrict,
  payment_method text check(payment_method in ('M-PESA','BANK TRANSFER','CARD','CASH')),
  payment_reference text,
  status text not null default 'PENDING' check(status in ('PENDING','APPROVED','DECLINED')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check((request_type='TRIAL_EXTENSION' and plan_id is null) or (request_type='PLAN_PURCHASE' and plan_id is not null))
);
create unique index if not exists carwash_billing_trial_extension_once
  on public.carwash_billing_requests(tenant_id) where request_type='TRIAL_EXTENSION';
create unique index if not exists carwash_billing_pending_request_once
  on public.carwash_billing_requests(tenant_id) where status='PENDING';
create index if not exists carwash_billing_requests_status_time
  on public.carwash_billing_requests(status,created_at desc);
alter table public.carwash_billing_requests enable row level security;
drop policy if exists cw_billing_requests_read on public.carwash_billing_requests;
create policy cw_billing_requests_read on public.carwash_billing_requests for select
  using(public.carwash_is_platform_admin() or (user_id=auth.uid() and public.carwash_has_tenant_access(tenant_id,array['BUSINESS_ADMIN'])));
revoke all on public.carwash_billing_requests from public,anon,authenticated;
grant select on public.carwash_billing_requests to authenticated;

create or replace function public.carwash_request_billing_action(
  p_request_type text,p_plan_id uuid default null,p_payment_method text default null,p_payment_reference text default null
)
returns public.carwash_billing_requests language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare actor public.carwash_memberships%rowtype; plan_row public.carwash_plans%rowtype; request_row public.carwash_billing_requests%rowtype; current_sub public.carwash_subscriptions%rowtype;
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
  end if;
  select * into current_sub from public.carwash_subscriptions where tenant_id=actor.tenant_id order by starts_at desc,created_at desc limit 1;
  if p_request_type='TRIAL_EXTENSION' and (not found or current_sub.status not in ('TRIAL','EXPIRED') or exists(select 1 from public.carwash_subscription_payments where tenant_id=actor.tenant_id)) then
    raise exception 'The free extension is available once during the initial trial and before any paid plan.' using errcode='22023';
  end if;
  insert into public.carwash_billing_requests(tenant_id,user_id,request_type,plan_id,payment_method,payment_reference)
    values(actor.tenant_id,auth.uid(),p_request_type,p_plan_id,p_payment_method,nullif(trim(p_payment_reference),'')) returning * into request_row;
  insert into public.carwash_audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,details)
    values(actor.tenant_id,auth.uid(),'BILLING_REQUEST_SUBMITTED','BILLING_REQUEST',request_row.id::text,jsonb_build_object('request_type',p_request_type,'plan_id',p_plan_id));
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
    insert into public.carwash_subscriptions(tenant_id,plan_id,starts_at,ends_at,status,auto_renew)
      values(tenant_row.id,plan_row.id,now(),now()+make_interval(days=>plan_row.duration_days),'ACTIVE',false) returning * into subscription_row;
    insert into public.carwash_subscription_payments(tenant_id,subscription_id,plan_id,amount_kes,method,external_reference,confirmed_by)
      values(tenant_row.id,subscription_row.id,plan_row.id,plan_row.price_kes,request_row.payment_method,request_row.payment_reference,auth.uid());
    update public.carwash_tenants set status='ACTIVE' where id=tenant_row.id;
    insert into public.carwash_user_messages(user_id,kind,subject,body,reference_key)
      select m.user_id,'SYSTEM','Payment confirmed and plan active','Your payment was confirmed. The '||plan_row.name||' plan for '||tenant_row.name||' is active until '||to_char(subscription_row.ends_at at time zone 'Africa/Nairobi','DD Mon YYYY HH24:MI')||'.','BILLING_ACTIVATED:'||request_row.id::text
      from public.carwash_memberships m where m.tenant_id=tenant_row.id and m.status='ACTIVE'
      on conflict(user_id,reference_key) where reference_key is not null do nothing;
  else
    insert into public.carwash_user_messages(user_id,kind,subject,body,reference_key)
      select m.user_id,'SYSTEM','Billing request needs attention','OshaHub could not approve the billing request for '||tenant_row.name||'. Please contact support or submit corrected payment details.','BILLING_DECLINED:'||request_row.id::text
      from public.carwash_memberships m where m.tenant_id=tenant_row.id and m.status='ACTIVE'
      on conflict(user_id,reference_key) where reference_key is not null do nothing;
  end if;
  update public.carwash_billing_requests set status=case when p_approve then 'APPROVED' else 'DECLINED' end,reviewed_by=auth.uid(),reviewed_at=now() where id=p_request_id returning * into request_row;
  insert into public.carwash_audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,details)
    values(tenant_row.id,auth.uid(),case when p_approve then 'BILLING_REQUEST_APPROVED' else 'BILLING_REQUEST_DECLINED' end,'BILLING_REQUEST',request_row.id::text,jsonb_build_object('request_type',request_row.request_type));
  return request_row;
end;
$$;
revoke all on function public.carwash_request_billing_action(text,uuid,text,text) from public,anon;
revoke all on function public.carwash_review_billing_request(uuid,boolean) from public,anon;
grant execute on function public.carwash_request_billing_action(text,uuid,text,text) to authenticated;
grant execute on function public.carwash_review_billing_request(uuid,boolean) to authenticated;
notify pgrst,'reload schema';


-- One-time onboarding charge and current OshaHub public plan pricing.
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
    onboarding_fee_kes=case when not exists(select 1 from public.carwash_subscription_payments x where x.tenant_id=r.tenant_id) then 8500 else 0 end
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
    if not exists(select 1 from public.carwash_subscription_payments where tenant_id=actor.tenant_id) then setup_fee:=8500; end if;
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
  if not exists(select 1 from public.carwash_subscription_payments where tenant_id=target_tenant) then setup_fee:=8500; end if;
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

-- OshaHub subscription terms and branch-aware one-time onboarding.
-- Multi-month terms save KES 300 per month against the monthly rate.
-- Onboarding is KES 8,500 per business branch and is charged on the first paid plan only.

alter table public.carwash_subscriptions
  add column if not exists branch_count integer not null default 1 check (branch_count between 1 and 100);
alter table public.carwash_billing_requests
  add column if not exists branch_count integer not null default 1 check (branch_count between 1 and 100);
alter table public.carwash_subscription_payments
  add column if not exists branch_count integer not null default 1 check (branch_count between 1 and 100);
update public.carwash_billing_requests r
set onboarding_fee_kes=case when not exists(select 1 from public.carwash_subscription_payments p where p.tenant_id=r.tenant_id) then 8500*r.branch_count else 0 end
where r.request_type='PLAN_PURCHASE' and r.status='PENDING';

-- Preserve the monthly products and create fixed, server-priced term options.
update public.carwash_plans set price_kes=3900,duration_days=30,feature_flags=jsonb_set(feature_flags,'{tier}','"Starter"'::jsonb,true)||jsonb_build_object('months',1,'term','Monthly') where name='Starter';
update public.carwash_plans set price_kes=7900,duration_days=30,feature_flags=jsonb_set(feature_flags,'{tier}','"Growth"'::jsonb,true)||jsonb_build_object('months',1,'term','Monthly') where name='Growth';
update public.carwash_plans set price_kes=14900,duration_days=30,feature_flags=jsonb_set(feature_flags,'{tier}','"Enterprise"'::jsonb,true)||jsonb_build_object('months',1,'term','Monthly') where name='Enterprise';

insert into public.carwash_plans(name,price_kes,duration_days,feature_flags,active)
select tier||' · '||term,
       (base_price-300)*months,
       days,
       jsonb_build_object('tier',tier,'months',months,'term',term,'branches',branch_limit,'staff',staff_limit,'description',description),
       true
from (values
  ('Starter',3900,1,'Monthly',30,1,3,'Core operations and washer app'),
  ('Starter',3900,3,'3 months',90,1,3,'Core operations and washer app'),
  ('Starter',3900,5,'5 months',150,1,3,'Core operations and washer app'),
  ('Starter',3900,12,'Yearly',365,1,3,'Core operations and washer app'),
  ('Growth',7900,1,'Monthly',30,3,15,'Reports, loyalty and washer app'),
  ('Growth',7900,3,'3 months',90,3,15,'Reports, loyalty and washer app'),
  ('Growth',7900,5,'5 months',150,3,15,'Reports, loyalty and washer app'),
  ('Growth',7900,12,'Yearly',365,3,15,'Reports, loyalty and washer app'),
  ('Enterprise',14900,1,'Monthly',30,-1,-1,'Unlimited branches and staff, priority support and washer app'),
  ('Enterprise',14900,3,'3 months',90,-1,-1,'Unlimited branches and staff, priority support and washer app'),
  ('Enterprise',14900,5,'5 months',150,-1,-1,'Unlimited branches and staff, priority support and washer app'),
  ('Enterprise',14900,12,'Yearly',365,-1,-1,'Unlimited branches and staff, priority support and washer app')
) as terms(tier,base_price,months,term,days,branch_limit,staff_limit,description)
where months>1
on conflict(name) do update set price_kes=excluded.price_kes,duration_days=excluded.duration_days,feature_flags=excluded.feature_flags,active=true;

-- Replace the old four-argument entry point so every new request stores the selected branch count.
drop function if exists public.carwash_request_billing_action(text,uuid,text,text);
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
    select * into plan_row from public.carwash_plans where id=p_plan_id and active;
    if not found then raise exception 'Choose an available plan.' using errcode='22023'; end if;
    if p_branch_count not between 1 and 100 then raise exception 'Choose between 1 and 100 branches.' using errcode='22023'; end if;
    if coalesce((plan_row.feature_flags->>'branches')::integer,1)<>-1 and p_branch_count>coalesce((plan_row.feature_flags->>'branches')::integer,1) then raise exception 'This plan does not include that many branches. Choose a plan with a higher branch allowance.' using errcode='22023'; end if;
    if p_payment_method not in ('M-PESA','BANK TRANSFER','CARD','CASH') or length(trim(coalesce(p_payment_reference,''))) not between 4 and 120 then raise exception 'Enter the payment method and transaction/reference number.' using errcode='22023'; end if;
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
    insert into public.carwash_user_messages(user_id,kind,subject,body,reference_key) select m.user_id,'SYSTEM','Your free trial was extended','OshaHub approved an extra 7 days for '||tenant_row.name||'. Your trial now ends '||to_char(subscription_row.ends_at at time zone 'Africa/Nairobi','DD Mon YYYY HH24:MI')||'.','TRIAL_EXTENSION:'||request_row.id::text from public.carwash_memberships m where m.tenant_id=tenant_row.id and m.status='ACTIVE' on conflict(user_id,reference_key) where reference_key is not null do nothing;
  elsif p_approve then
    select * into plan_row from public.carwash_plans where id=request_row.plan_id and active;
    if not found then raise exception 'The requested plan is no longer available.' using errcode='22023'; end if;
    if exists(select 1 from public.carwash_subscription_payments where tenant_id=tenant_row.id) then request_row.onboarding_fee_kes:=0; end if;
    request_row.plan_amount_kes:=plan_row.price_kes;
    insert into public.carwash_subscriptions(tenant_id,plan_id,starts_at,ends_at,status,auto_renew,branch_count) values(tenant_row.id,plan_row.id,now(),now()+make_interval(days=>plan_row.duration_days),'ACTIVE',false,request_row.branch_count) returning * into subscription_row;
    insert into public.carwash_subscription_payments(tenant_id,subscription_id,plan_id,amount_kes,plan_amount_kes,onboarding_fee_kes,branch_count,method,external_reference,confirmed_by) values(tenant_row.id,subscription_row.id,plan_row.id,plan_row.price_kes+request_row.onboarding_fee_kes,plan_row.price_kes,request_row.onboarding_fee_kes,request_row.branch_count,request_row.payment_method,request_row.payment_reference,auth.uid());
    update public.carwash_tenants set status='ACTIVE' where id=tenant_row.id;
    insert into public.carwash_user_messages(user_id,kind,subject,body,reference_key) select m.user_id,'SYSTEM','Payment confirmed and plan active','Your payment of KES '||(plan_row.price_kes+request_row.onboarding_fee_kes)::text||' was confirmed for '||request_row.branch_count::text||' branch(es). The '||plan_row.name||' plan for '||tenant_row.name||' is active until '||to_char(subscription_row.ends_at at time zone 'Africa/Nairobi','DD Mon YYYY HH24:MI')||'.','BILLING_ACTIVATED:'||request_row.id::text from public.carwash_memberships m where m.tenant_id=tenant_row.id and m.status='ACTIVE' on conflict(user_id,reference_key) where reference_key is not null do nothing;
  else
    insert into public.carwash_user_messages(user_id,kind,subject,body,reference_key) select m.user_id,'SYSTEM','Billing request needs attention','OshaHub could not approve the billing request for '||tenant_row.name||'. Please contact support or submit corrected payment details.','BILLING_DECLINED:'||request_row.id::text from public.carwash_memberships m where m.tenant_id=tenant_row.id and m.status='ACTIVE' on conflict(user_id,reference_key) where reference_key is not null do nothing;
  end if;
  update public.carwash_billing_requests set status=case when p_approve then 'APPROVED' else 'DECLINED' end,reviewed_by=auth.uid(),reviewed_at=now(),plan_amount_kes=request_row.plan_amount_kes,onboarding_fee_kes=request_row.onboarding_fee_kes where id=p_request_id returning * into request_row;
  insert into public.carwash_audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,details) values(tenant_row.id,auth.uid(),case when p_approve then 'BILLING_REQUEST_APPROVED' else 'BILLING_REQUEST_DECLINED' end,'BILLING_REQUEST',request_row.id::text,jsonb_build_object('request_type',request_row.request_type,'plan_amount_kes',request_row.plan_amount_kes,'onboarding_fee_kes',request_row.onboarding_fee_kes,'branch_count',request_row.branch_count));
  return request_row;
end;
$$;

drop function if exists public.carwash_activate_tenant_plan(uuid,uuid,text,text);
create function public.carwash_activate_tenant_plan(target_tenant uuid,target_plan uuid,payment_method text default 'M-PESA',payment_reference text default null,p_branch_count integer default 1)
returns public.carwash_subscriptions language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare plan_row public.carwash_plans%rowtype; tenant_row public.carwash_tenants%rowtype; subscription_row public.carwash_subscriptions%rowtype; setup_fee numeric(12,2):=0;
begin
  if not public.carwash_is_platform_admin() then raise exception 'Platform administrator access is required.' using errcode='42501'; end if;
  perform public.carwash_consume_rate_limit('PLAN_ACTIVATE',60,3600);
  if payment_method not in ('CASH','CARD','M-PESA','BANK TRANSFER') then raise exception 'Choose a supported business payment method.' using errcode='22023'; end if;
  if p_branch_count not between 1 and 100 then raise exception 'Branch count must be between 1 and 100.' using errcode='22023'; end if;
  select * into tenant_row from public.carwash_tenants where id=target_tenant for update;
  if not found then raise exception 'Business account not found.' using errcode='P0002'; end if;
  select * into plan_row from public.carwash_plans where id=target_plan and active;
  if not found then raise exception 'Choose an active subscription plan.' using errcode='22023'; end if;
  if coalesce((plan_row.feature_flags->>'branches')::integer,1)<>-1 and p_branch_count>coalesce((plan_row.feature_flags->>'branches')::integer,1) then raise exception 'This plan does not include that many branches.' using errcode='22023'; end if;
  if not exists(select 1 from public.carwash_subscription_payments where tenant_id=target_tenant) then setup_fee:=8500*p_branch_count; end if;
  insert into public.carwash_subscriptions(tenant_id,plan_id,starts_at,ends_at,status,auto_renew,branch_count) values(target_tenant,target_plan,now(),now()+make_interval(days=>plan_row.duration_days),'ACTIVE',false,p_branch_count) returning * into subscription_row;
  insert into public.carwash_subscription_payments(tenant_id,subscription_id,plan_id,amount_kes,plan_amount_kes,onboarding_fee_kes,branch_count,method,external_reference,confirmed_by) values(target_tenant,subscription_row.id,target_plan,plan_row.price_kes+setup_fee,plan_row.price_kes,setup_fee,p_branch_count,payment_method,nullif(trim(payment_reference),''),auth.uid());
  update public.carwash_tenants set status='ACTIVE' where id=target_tenant;
  insert into public.carwash_user_messages(user_id,kind,subject,body,reference_key) select m.user_id,'SYSTEM','Business plan activated','Your business plan was activated for '||tenant_row.name||' with '||p_branch_count::text||' branch(es).','PLAN_ACTIVATED:'||subscription_row.id::text from public.carwash_memberships m where m.tenant_id=target_tenant and m.status='ACTIVE' on conflict(user_id,reference_key) where reference_key is not null do nothing;
  insert into public.carwash_audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,details) values(target_tenant,auth.uid(),'TENANT_PLAN_ACTIVATED','SUBSCRIPTION',subscription_row.id::text,jsonb_build_object('plan_id',target_plan,'ends_at',subscription_row.ends_at,'amount_kes',plan_row.price_kes+setup_fee,'onboarding_fee_kes',setup_fee,'branch_count',p_branch_count,'method',payment_method));
  return subscription_row;
end;
$$;

revoke all on function public.carwash_request_billing_action(text,uuid,text,text,integer) from public,anon;
revoke all on function public.carwash_review_billing_request(uuid,boolean) from public,anon;
revoke all on function public.carwash_activate_tenant_plan(uuid,uuid,text,text,integer) from public,anon;
grant execute on function public.carwash_request_billing_action(text,uuid,text,text,integer) to authenticated;
grant execute on function public.carwash_review_billing_request(uuid,boolean) to authenticated;
grant execute on function public.carwash_activate_tenant_plan(uuid,uuid,text,text,integer) to authenticated;
notify pgrst,'reload schema';

-- Migration: database/migrations/20261002_stk_push_split_billing.sql
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

create or replace function public.carwash_delete_unpaid_orders(target_tenant uuid,p_order_ids uuid[])
returns integer language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare deleted_count integer;
begin
  if not public.carwash_has_tenant_access(target_tenant,array['BUSINESS_ADMIN','RECEPTIONIST','WASHER']) then raise exception 'Active workspace staff access is required.' using errcode='42501'; end if;
  if not public.carwash_can_operate(target_tenant) then raise exception 'An active paid workspace is required to delete wash orders.' using errcode='42501'; end if;
  if coalesce(cardinality(p_order_ids),0)<1 or cardinality(p_order_ids)>100 then raise exception 'Select between 1 and 100 wash orders.' using errcode='22023'; end if;
  perform public.carwash_consume_rate_limit('ORDER_DELETE',30,3600);
  delete from public.carwash_orders o where o.tenant_id=target_tenant and o.id=any(p_order_ids)
    and o.status in ('WAITING','ASSIGNED') and o.payment_status='UNPAID'
    and not exists(select 1 from public.carwash_payments p where p.order_id=o.id and p.tenant_id=o.tenant_id)
    and not exists(select 1 from public.carwash_commission_ledger c where c.order_id=o.id and c.tenant_id=o.tenant_id)
    and (public.carwash_has_tenant_access(target_tenant,array['BUSINESS_ADMIN','RECEPTIONIST']) or public.carwash_is_assigned_worker(o.id,target_tenant));
  get diagnostics deleted_count=row_count;
  insert into public.carwash_audit_logs(tenant_id,actor_user_id,action,entity_type,details) values(target_tenant,auth.uid(),'UNPAID_WASH_ORDERS_DELETED','ORDER',jsonb_build_object('deleted_count',deleted_count,'order_ids',to_jsonb(p_order_ids)));
  return deleted_count;
end;
$$;
revoke all on function public.carwash_delete_unpaid_orders(uuid,uuid[]) from public,anon;
grant execute on function public.carwash_delete_unpaid_orders(uuid,uuid[]) to authenticated;

create or replace function public.carwash_delete_unused_services(target_tenant uuid,p_service_ids uuid[])
returns integer language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare deleted_count integer;
begin
  if not public.carwash_has_tenant_access(target_tenant,array['BUSINESS_ADMIN']) then raise exception 'Business administrator access is required.' using errcode='42501'; end if;
  if not public.carwash_can_operate(target_tenant) then raise exception 'An active paid workspace is required to delete services.' using errcode='42501'; end if;
  if coalesce(cardinality(p_service_ids),0)<1 or cardinality(p_service_ids)>100 then raise exception 'Select between 1 and 100 services.' using errcode='22023'; end if;
  perform public.carwash_consume_rate_limit('SERVICE_DELETE',30,3600);
  delete from public.carwash_services s where s.tenant_id=target_tenant and s.id=any(p_service_ids)
    and not exists(select 1 from public.carwash_order_services os where os.service_id=s.id and os.tenant_id=s.tenant_id);
  get diagnostics deleted_count=row_count;
  insert into public.carwash_audit_logs(tenant_id,actor_user_id,action,entity_type,details) values(target_tenant,auth.uid(),'UNUSED_SERVICES_DELETED','SERVICE',jsonb_build_object('deleted_count',deleted_count,'service_ids',to_jsonb(p_service_ids)));
  return deleted_count;
end;
$$;
revoke all on function public.carwash_delete_unused_services(uuid,uuid[]) from public,anon;
grant execute on function public.carwash_delete_unused_services(uuid,uuid[]) to authenticated;
notify pgrst,'reload schema';
