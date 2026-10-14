-- Tenant-owned public booking links and isolated online bookings.
alter table public.carwash_tenants
  add column if not exists booking_slug text,
  add column if not exists booking_enabled boolean not null default true,
  add column if not exists booking_capacity integer not null default 1;

update public.carwash_tenants
set booking_slug = coalesce(nullif(trim(both '-' from regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')),''),'business') || '-' || left(replace(id::text, '-', ''), 8)
where booking_slug is null or booking_slug = '';

create unique index if not exists carwash_tenants_booking_slug_uq on public.carwash_tenants(booking_slug);
create or replace function public.carwash_assign_booking_slug()
returns trigger language plpgsql set search_path=pg_catalog,public,pg_temp as $$
begin
  if new.booking_slug is null or new.booking_slug='' then
    new.booking_slug:=coalesce(nullif(trim(both '-' from regexp_replace(lower(new.name), '[^a-z0-9]+', '-', 'g')),''),'business') || '-' || left(replace(new.id::text, '-', ''), 8);
  end if;
  return new;
end $$;
drop trigger if exists carwash_tenant_booking_slug on public.carwash_tenants;
create trigger carwash_tenant_booking_slug before insert or update of name on public.carwash_tenants
for each row execute function public.carwash_assign_booking_slug();
revoke all on function public.carwash_assign_booking_slug() from public,anon,authenticated;
alter table public.carwash_tenants drop constraint if exists carwash_tenants_booking_capacity_check;
alter table public.carwash_tenants add constraint carwash_tenants_booking_capacity_check check (booking_capacity between 1 and 50);

create table if not exists public.carwash_public_bookings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.carwash_tenants(id) on delete cascade,
  service_id uuid not null,
  service_name text not null,
  price_kes numeric(12,2) not null check (price_kes >= 0),
  duration_minutes integer not null check (duration_minutes between 1 and 1440),
  customer_name text not null check (length(trim(customer_name)) between 2 and 120),
  customer_phone text not null check (length(trim(customer_phone)) between 7 and 30),
  customer_email text,
  vehicle_registration text not null check (length(trim(vehicle_registration)) between 2 and 20),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'PENDING' check (status in ('PENDING','CONFIRMED','CANCELLED','COMPLETED')),
  customer_notes text,
  created_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  foreign key (service_id, tenant_id) references public.carwash_services(id, tenant_id) on delete restrict,
  check (ends_at > starts_at),
  check (customer_email is null or length(customer_email) <= 254),
  check (customer_notes is null or length(customer_notes) <= 1000)
);

create index if not exists carwash_public_bookings_tenant_start on public.carwash_public_bookings(tenant_id, starts_at desc);
create table if not exists public.carwash_public_booking_limits (
  tenant_id uuid not null references public.carwash_tenants(id) on delete cascade,
  phone_hash text not null,
  bucket_start timestamptz not null,
  request_count integer not null default 0,
  primary key(tenant_id,phone_hash,bucket_start)
);
alter table public.carwash_public_booking_limits enable row level security;
revoke all on public.carwash_public_booking_limits from public,anon,authenticated;
alter table public.carwash_public_bookings enable row level security;
drop policy if exists cw_public_bookings_staff_read on public.carwash_public_bookings;
create policy cw_public_bookings_staff_read on public.carwash_public_bookings
  for select to authenticated using (public.carwash_has_tenant_access(tenant_id, array['BUSINESS_ADMIN','RECEPTIONIST']));
revoke all on public.carwash_public_bookings from public, anon, authenticated;
grant select on public.carwash_public_bookings to authenticated;

-- Meta credentials stay encrypted and unreadable by browser roles.
create table if not exists public.carwash_social_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.carwash_tenants(id) on delete cascade,
  platform text not null check (platform in ('FACEBOOK','INSTAGRAM')),
  status text not null default 'CONNECTED' check (status in ('CONNECTED','EXPIRED','ATTENTION')),
  account_id text not null,
  account_name text not null,
  token_ciphertext text not null,
  token_iv text not null,
  expires_at timestamptz,
  connected_by uuid references auth.users(id) on delete set null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id,platform)
);
create table if not exists public.carwash_social_oauth_states (
  state_hash text primary key,
  tenant_id uuid not null references public.carwash_tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('FACEBOOK','INSTAGRAM')),
  expires_at timestamptz not null
);
create table if not exists public.carwash_social_pending_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.carwash_tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('FACEBOOK','INSTAGRAM')),
  account_id text not null,
  account_name text not null,
  token_ciphertext text not null,
  token_iv text not null,
  expires_at timestamptz,
  selection_expires_at timestamptz not null default now()+interval '10 minutes'
);
alter table public.carwash_social_connections enable row level security;
alter table public.carwash_social_oauth_states enable row level security;
alter table public.carwash_social_pending_accounts enable row level security;
revoke all on public.carwash_social_connections,public.carwash_social_oauth_states,public.carwash_social_pending_accounts from public,anon,authenticated;

create or replace function public.carwash_social_connection_status(target_tenant uuid)
returns table(platform text,status text,account_id text,account_name text,expires_at timestamptz,connected_at timestamptz)
language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
begin
  if not public.carwash_has_tenant_access(target_tenant,array['BUSINESS_ADMIN']) then
    raise exception 'Business administrator access is required.' using errcode='42501';
  end if;
  return query select c.platform,c.status,c.account_id,c.account_name,c.expires_at,c.connected_at
    from public.carwash_social_connections c where c.tenant_id=target_tenant;
end $$;

revoke all on function public.carwash_social_connection_status(uuid) from public,anon;
grant execute on function public.carwash_social_connection_status(uuid) to authenticated;

create or replace function public.carwash_pending_social_accounts(target_tenant uuid)
returns table(id uuid,platform text,account_name text,selection_expires_at timestamptz)
language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
begin
  if not public.carwash_has_tenant_access(target_tenant,array['BUSINESS_ADMIN']) then
    raise exception 'Business administrator access is required.' using errcode='42501';
  end if;
  return query select p.id,p.platform,p.account_name,p.selection_expires_at from public.carwash_social_pending_accounts p
    where p.tenant_id=target_tenant and p.user_id=auth.uid() and p.selection_expires_at>now();
end $$;

create or replace function public.carwash_select_social_account(p_pending_id uuid)
returns boolean language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare pending public.carwash_social_pending_accounts%rowtype;
begin
  select * into pending from public.carwash_social_pending_accounts where id=p_pending_id and user_id=auth.uid() and selection_expires_at>now() for update;
  if not found or not public.carwash_has_tenant_access(pending.tenant_id,array['BUSINESS_ADMIN']) then raise exception 'This account selection expired. Reconnect and try again.' using errcode='P0002'; end if;
  insert into public.carwash_social_connections(tenant_id,platform,status,account_id,account_name,token_ciphertext,token_iv,expires_at,connected_by,updated_at)
    values(pending.tenant_id,pending.platform,'CONNECTED',pending.account_id,pending.account_name,pending.token_ciphertext,pending.token_iv,pending.expires_at,auth.uid(),now())
    on conflict(tenant_id,platform) do update set status='CONNECTED',account_id=excluded.account_id,account_name=excluded.account_name,token_ciphertext=excluded.token_ciphertext,token_iv=excluded.token_iv,expires_at=excluded.expires_at,connected_by=excluded.connected_by,connected_at=now(),updated_at=now();
  delete from public.carwash_social_pending_accounts where tenant_id=pending.tenant_id and platform=pending.platform and user_id=auth.uid();
  insert into public.carwash_audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,details)
    values(pending.tenant_id,auth.uid(),'SOCIAL_ACCOUNT_CONNECTED','SOCIAL_ACCOUNT',pending.account_id,jsonb_build_object('platform',pending.platform,'account_name',pending.account_name));
  return true;
end $$;

revoke all on function public.carwash_pending_social_accounts(uuid) from public,anon;
revoke all on function public.carwash_select_social_account(uuid) from public,anon;
grant execute on function public.carwash_pending_social_accounts(uuid) to authenticated;
grant execute on function public.carwash_select_social_account(uuid) to authenticated;

create or replace function public.carwash_public_booking_page(p_slug text)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,pg_temp as $$
declare t public.carwash_tenants%rowtype; result jsonb;
begin
  select * into t from public.carwash_tenants where booking_slug=p_slug and booking_enabled and status in ('TRIAL','ACTIVE','EXPIRING SOON') limit 1;
  if not found then raise exception 'This booking page is unavailable.' using errcode='P0002'; end if;
  select jsonb_build_object('tenant',jsonb_build_object('name',t.name,'slug',t.booking_slug),
    'services',coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'category',s.category,'price_kes',s.price_kes,'estimated_minutes',s.estimated_minutes) order by s.name) filter(where s.id is not null),'[]'::jsonb))
  into result from public.carwash_services s where s.tenant_id=t.id and s.active;
  return result;
end $$;

create or replace function public.carwash_public_booking_availability(p_slug text,p_service uuid,p_day date)
returns table(slot_start timestamptz) language plpgsql stable security definer
set search_path=pg_catalog,public,pg_temp as $$
declare t public.carwash_tenants%rowtype; service_row public.carwash_services%rowtype; weekday_key text; opening time; closing time; local_slot timestamp; local_end timestamp; offset_index integer; capacity integer;
begin
  select * into t from public.carwash_tenants where booking_slug=p_slug and booking_enabled and status in ('TRIAL','ACTIVE','EXPIRING SOON') limit 1;
  if not found then raise exception 'This booking page is unavailable.' using errcode='P0002'; end if;
  select * into service_row from public.carwash_services where id=p_service and tenant_id=t.id and active;
  if not found then raise exception 'Choose an available service.' using errcode='22023'; end if;
  if p_day < (now() at time zone 'Africa/Nairobi')::date or p_day > (now() at time zone 'Africa/Nairobi')::date + 60 then return; end if;
  weekday_key:=lower(to_char(p_day,'Dy'));
  opening:=coalesce((t.settings->'bookingHours'->weekday_key->>0)::time,case when weekday_key='sun' then null else time '08:00' end);
  closing:=coalesce((t.settings->'bookingHours'->weekday_key->>1)::time,case when weekday_key='sun' then null else time '18:00' end);
  if opening is null or closing is null or closing<=opening then return; end if;
  capacity:=t.booking_capacity;
  for offset_index in 0..48 loop
    local_slot:=p_day + opening + make_interval(mins=>offset_index*30);
    local_end:=local_slot + make_interval(mins=>service_row.estimated_minutes);
    exit when local_end>p_day+closing;
    if local_slot at time zone 'Africa/Nairobi' > now()
      and (select count(*) from public.carwash_public_bookings b where b.tenant_id=t.id and (b.status='CONFIRMED' or (b.status='PENDING' and b.created_at>now()-interval '15 minutes')) and b.starts_at < (local_end at time zone 'Africa/Nairobi') and b.ends_at > (local_slot at time zone 'Africa/Nairobi')) < capacity
      then slot_start:=local_slot at time zone 'Africa/Nairobi'; return next;
    end if;
  end loop;
end $$;

create or replace function public.carwash_create_public_booking(
  p_slug text,p_service uuid,p_starts_at timestamptz,p_customer_name text,p_customer_phone text,
  p_vehicle_registration text,p_customer_email text default null,p_customer_notes text default null
) returns uuid language plpgsql security definer
set search_path=pg_catalog,public,pg_temp as $$
declare t public.carwash_tenants%rowtype; s public.carwash_services%rowtype; ends timestamptz; booking_id uuid; local_start timestamp; weekday_key text; opening time; closing time; bucket timestamptz; used_count integer;
begin
  select * into t from public.carwash_tenants where booking_slug=p_slug and booking_enabled and status in ('TRIAL','ACTIVE','EXPIRING SOON') for update;
  if not found then raise exception 'This booking page is unavailable.' using errcode='P0002'; end if;
  if not public.carwash_can_operate(t.id) then raise exception 'Online bookings are temporarily unavailable. Contact the business.' using errcode='42501'; end if;
  if length(trim(coalesce(p_customer_name,''))) not between 2 and 120 or length(regexp_replace(coalesce(p_customer_phone,''),'[^0-9]','','g')) not between 9 and 15
    or length(trim(coalesce(p_vehicle_registration,''))) not between 2 and 20
    or (p_customer_email is not null and (length(p_customer_email)>254 or p_customer_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'))
    or length(coalesce(p_customer_notes,''))>1000 then raise exception 'Check the contact and vehicle details.' using errcode='22023'; end if;
  select * into s from public.carwash_services where id=p_service and tenant_id=t.id and active;
  if not found then raise exception 'Choose an available service.' using errcode='22023'; end if;
  if p_starts_at is null or p_starts_at <= now() or p_starts_at > now()+interval '60 days' then raise exception 'Choose a future time within the next 60 days.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(t.id::text||':'||(p_starts_at at time zone 'Africa/Nairobi')::date::text,0));
  local_start:=p_starts_at at time zone 'Africa/Nairobi'; weekday_key:=lower(to_char(local_start,'Dy'));
  opening:=coalesce((t.settings->'bookingHours'->weekday_key->>0)::time,case when weekday_key='sun' then null else time '08:00' end);
  closing:=coalesce((t.settings->'bookingHours'->weekday_key->>1)::time,case when weekday_key='sun' then null else time '18:00' end);
  ends:=p_starts_at+make_interval(mins=>s.estimated_minutes);
  if opening is null or closing is null or local_start::time<opening or local_start::time>=closing or local_start::time<>date_trunc('minute',local_start)::time or mod(extract(minute from local_start)::integer,30)<>0 or (local_start+make_interval(mins=>s.estimated_minutes))::time>closing then
    raise exception 'That time is outside the business booking hours.' using errcode='22023'; end if;
  bucket:=to_timestamp(floor(extract(epoch from clock_timestamp())/3600)*3600);
  insert into public.carwash_public_booking_limits(tenant_id,phone_hash,bucket_start,request_count)
    values(t.id,encode(digest(regexp_replace(p_customer_phone,'[^0-9]','','g'),'sha256'),'hex'),bucket,1)
    on conflict(tenant_id,phone_hash,bucket_start) do update set request_count=public.carwash_public_booking_limits.request_count+1 returning request_count into used_count;
  if used_count>5 then raise exception 'Too many booking requests. Please try again later.' using errcode='P0001'; end if;
  if (select count(*) from public.carwash_public_bookings b where b.tenant_id=t.id and (b.status='CONFIRMED' or (b.status='PENDING' and b.created_at>now()-interval '15 minutes')) and b.starts_at<ends and b.ends_at>p_starts_at)>=t.booking_capacity then
    raise exception 'That time was just booked. Choose another available time.' using errcode='23505'; end if;
  insert into public.carwash_public_bookings(tenant_id,service_id,service_name,price_kes,duration_minutes,customer_name,customer_phone,customer_email,vehicle_registration,starts_at,ends_at,customer_notes)
  values(t.id,s.id,s.name,s.price_kes,s.estimated_minutes,trim(p_customer_name),trim(p_customer_phone),nullif(trim(p_customer_email),''),upper(trim(p_vehicle_registration)),p_starts_at,ends,nullif(trim(p_customer_notes),'')) returning id into booking_id;
  insert into public.carwash_user_messages(user_id,kind,subject,body,reference_key)
    select m.user_id,'SYSTEM','New online wash booking',trim(p_customer_name)||' booked '||s.name||' for '||to_char(p_starts_at at time zone 'Africa/Nairobi','DD Mon YYYY HH24:MI')||'. Vehicle: '||upper(trim(p_vehicle_registration))||'.','PUBLIC_BOOKING:'||booking_id::text
    from public.carwash_memberships m where m.tenant_id=t.id and m.status='ACTIVE' and m.role in ('BUSINESS_ADMIN','RECEPTIONIST')
    on conflict(user_id,reference_key) where reference_key is not null do nothing;
  return booking_id;
end $$;

create or replace function public.carwash_review_public_booking(p_booking uuid,p_status text)
returns public.carwash_public_bookings language plpgsql security definer
set search_path=pg_catalog,public,pg_temp as $$
declare row_booking public.carwash_public_bookings%rowtype;
begin
  if p_status not in ('CONFIRMED','CANCELLED','COMPLETED') then raise exception 'Choose a valid booking status.' using errcode='22023'; end if;
  select * into row_booking from public.carwash_public_bookings where id=p_booking for update;
  if not found or not public.carwash_has_tenant_access(row_booking.tenant_id,array['BUSINESS_ADMIN','RECEPTIONIST']) then raise exception 'Booking not found.' using errcode='42501'; end if;
  if row_booking.status not in ('PENDING','CONFIRMED') or (p_status='COMPLETED' and row_booking.status<>'CONFIRMED') then raise exception 'This booking can no longer be changed.' using errcode='23514'; end if;
  if p_status='CONFIRMED' then
    perform pg_advisory_xact_lock(hashtextextended(row_booking.tenant_id::text||':'||(row_booking.starts_at at time zone 'Africa/Nairobi')::date::text,0));
    if (select count(*) from public.carwash_public_bookings b where b.tenant_id=row_booking.tenant_id and b.id<>row_booking.id and (b.status='CONFIRMED' or (b.status='PENDING' and b.created_at>now()-interval '15 minutes')) and b.starts_at<row_booking.ends_at and b.ends_at>row_booking.starts_at)>= (select booking_capacity from public.carwash_tenants where id=row_booking.tenant_id) then raise exception 'This time is now full. Cancel this booking or choose a different time.' using errcode='23505'; end if;
  end if;
  update public.carwash_public_bookings set status=p_status,reviewed_by=auth.uid(),reviewed_at=now() where id=p_booking returning * into row_booking;
  insert into public.carwash_audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,details)
    values(row_booking.tenant_id,auth.uid(),'PUBLIC_BOOKING_'||p_status,'PUBLIC_BOOKING',row_booking.id::text,jsonb_build_object('status',p_status));
  return row_booking;
end $$;

revoke all on function public.carwash_public_booking_page(text) from public,authenticated;
revoke all on function public.carwash_public_booking_availability(text,uuid,date) from public,authenticated;
revoke all on function public.carwash_create_public_booking(text,uuid,timestamptz,text,text,text,text,text) from public,authenticated;
revoke all on function public.carwash_review_public_booking(uuid,text) from public,anon;
grant execute on function public.carwash_public_booking_page(text) to anon,authenticated;
grant execute on function public.carwash_public_booking_availability(text,uuid,date) to anon,authenticated;
grant execute on function public.carwash_create_public_booking(text,uuid,timestamptz,text,text,text,text,text) to anon,authenticated;
grant execute on function public.carwash_review_public_booking(uuid,text) to authenticated;

notify pgrst,'reload schema';
