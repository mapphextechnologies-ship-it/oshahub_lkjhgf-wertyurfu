-- Public bookings become scheduled wash orders and remain isolated by tenant.
alter table public.carwash_orders
  add column if not exists scheduled_at timestamptz;

-- These ownership columns are normally added by the staff-scope migration.
-- Keep this migration safe on databases where that migration was not applied.
alter table public.carwash_customers
  add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.carwash_customers alter column created_by set default auth.uid();
alter table public.carwash_vehicles
  add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.carwash_vehicles alter column created_by set default auth.uid();

alter table public.carwash_public_bookings
  add column if not exists wash_order_id uuid references public.carwash_orders(id) on delete set null;

create unique index if not exists carwash_public_bookings_wash_order_uq
  on public.carwash_public_bookings(wash_order_id) where wash_order_id is not null;
create index if not exists carwash_orders_tenant_schedule
  on public.carwash_orders(tenant_id,scheduled_at) where scheduled_at is not null;

-- A reservation can only be dispatched to a washer whose estimated work window is free.
create or replace function public.carwash_dispatch_public_booking(p_booking uuid)
returns uuid language plpgsql security definer
set search_path=pg_catalog,public,pg_temp as $$
declare
  booking_row public.carwash_public_bookings%rowtype;
  customer_row_id uuid;
  vehicle_id uuid;
  washer_id uuid;
  order_id uuid;
  phone_digits text;
  registration_key text;
begin
  select * into booking_row from public.carwash_public_bookings where id=p_booking for update;
  if not found then raise exception 'Booking not found.' using errcode='P0002'; end if;
  if booking_row.wash_order_id is not null then return booking_row.wash_order_id; end if;
  if booking_row.status not in ('PENDING','CONFIRMED') or booking_row.starts_at<=now() then
    raise exception 'This booking can no longer be sent to the wash queue.' using errcode='23514';
  end if;
  if not public.carwash_can_operate(booking_row.tenant_id) then
    raise exception 'This business cannot accept bookings right now.' using errcode='55000';
  end if;

  phone_digits:=regexp_replace(booking_row.customer_phone,'[^0-9]','','g');
  select c.id into customer_row_id from public.carwash_customers c
    where c.tenant_id=booking_row.tenant_id
      and regexp_replace(c.phone,'[^0-9]','','g')=phone_digits
    order by c.created_at limit 1 for update;
  if customer_row_id is null then
    insert into public.carwash_customers(tenant_id,full_name,phone,email)
      values(booking_row.tenant_id,booking_row.customer_name,booking_row.customer_phone,booking_row.customer_email)
      returning id into customer_row_id;
  else
    update public.carwash_customers set full_name=booking_row.customer_name,
      email=coalesce(booking_row.customer_email,email)
      where id=customer_row_id and tenant_id=booking_row.tenant_id;
  end if;

  registration_key:=upper(regexp_replace(booking_row.vehicle_registration,'[^A-Z0-9]','','g'));
  select v.id into vehicle_id from public.carwash_vehicles v
    where v.tenant_id=booking_row.tenant_id
      and upper(regexp_replace(v.registration,'[^A-Z0-9]','','g'))=registration_key
    order by v.created_at limit 1 for update;
  if vehicle_id is null then
    insert into public.carwash_vehicles(tenant_id,customer_id,registration,make,model)
      values(booking_row.tenant_id,customer_row_id,upper(trim(booking_row.vehicle_registration)),'Not specified','Not specified')
      returning id into vehicle_id;
  else
    update public.carwash_vehicles set customer_id=customer_row_id
      where id=vehicle_id and tenant_id=booking_row.tenant_id;
  end if;

  select w.id into washer_id
    from public.carwash_memberships w
    where w.tenant_id=booking_row.tenant_id and w.role='WASHER' and w.status='ACTIVE'
      and not exists (
        select 1 from public.carwash_orders o
        where o.tenant_id=booking_row.tenant_id and o.washer_membership_id=w.id
          and o.status in ('ASSIGNED','IN PROGRESS')
          and coalesce(case when o.status='IN PROGRESS' then o.started_at end,o.scheduled_at,o.checked_in_at)<booking_row.ends_at
          and coalesce(case when o.status='IN PROGRESS' then o.started_at end,o.scheduled_at,o.checked_in_at)
            + make_interval(mins=>coalesce((
              select sum(s.estimated_minutes)::integer
              from public.carwash_order_services os join public.carwash_services s
                on s.id=os.service_id and s.tenant_id=os.tenant_id
              where os.order_id=o.id and os.tenant_id=o.tenant_id
            ),booking_row.duration_minutes))>booking_row.starts_at
      )
    order by (
      select count(*) from public.carwash_orders active_order
      where active_order.tenant_id=booking_row.tenant_id
        and active_order.washer_membership_id=w.id
        and active_order.status in ('ASSIGNED','IN PROGRESS')
    ),w.created_at
    limit 1;
  if washer_id is null then
    raise exception 'All washers are booked at this time. Choose another available time.' using errcode='23505';
  end if;

  insert into public.carwash_orders(
    tenant_id,customer_id,vehicle_id,washer_membership_id,status,payment_status,
    subtotal_kes,notes,scheduled_at,created_by
  ) values (
    booking_row.tenant_id,customer_row_id,vehicle_id,washer_id,'ASSIGNED','UNPAID',
    booking_row.price_kes,booking_row.customer_notes,booking_row.starts_at,auth.uid()
  ) returning id into order_id;

  insert into public.carwash_order_services(
    tenant_id,order_id,service_id,service_name_snapshot,price_kes_snapshot,commission_kes_snapshot,rule_version
  )
  select booking_row.tenant_id,order_id,s.id,s.name,s.price_kes,s.commission_kes,'v1'
    from public.carwash_services s
    where s.id=booking_row.service_id and s.tenant_id=booking_row.tenant_id and s.active;
  if not found then raise exception 'The selected service is no longer available.' using errcode='22023'; end if;

  update public.carwash_public_bookings
    set status='CONFIRMED',wash_order_id=order_id
    where id=booking_row.id;
  return order_id;
end;
$$;
revoke all on function public.carwash_dispatch_public_booking(uuid) from public,anon,authenticated;

-- Availability uses both the tenant's configured capacity and washer schedules.
create or replace function public.carwash_public_booking_availability(p_slug text,p_service uuid,p_day date)
returns table(slot_start timestamptz) language plpgsql stable security definer
set search_path=pg_catalog,public,pg_temp as $$
declare
  t public.carwash_tenants%rowtype;
  service_row public.carwash_services%rowtype;
  weekday_key text;
  opening time;
  closing time;
  local_slot timestamp;
  local_end timestamp;
  offset_index integer;
begin
  select * into t from public.carwash_tenants
    where booking_slug=p_slug and booking_enabled and status in ('TRIAL','ACTIVE','EXPIRING SOON') limit 1;
  if not found then raise exception 'This booking page is unavailable.' using errcode='P0002'; end if;
  select * into service_row from public.carwash_services where id=p_service and tenant_id=t.id and active;
  if not found then raise exception 'Choose an available service.' using errcode='22023'; end if;
  if p_day < (now() at time zone 'Africa/Nairobi')::date
    or p_day > (now() at time zone 'Africa/Nairobi')::date + 60 then return; end if;
  weekday_key:=lower(to_char(p_day,'Dy'));
  opening:=coalesce((t.settings->'bookingHours'->weekday_key->>0)::time,case when weekday_key='sun' then null else time '08:00' end);
  closing:=coalesce((t.settings->'bookingHours'->weekday_key->>1)::time,case when weekday_key='sun' then null else time '18:00' end);
  if opening is null or closing is null or closing<=opening then return; end if;

  for offset_index in 0..48 loop
    local_slot:=p_day+opening+make_interval(mins=>offset_index*30);
    local_end:=local_slot+make_interval(mins=>service_row.estimated_minutes);
    exit when local_end>p_day+closing;
    if local_slot at time zone 'Africa/Nairobi'>now()
      and (select count(*) from public.carwash_public_bookings b
        where b.tenant_id=t.id
          and (b.status='CONFIRMED' or (b.status='PENDING' and b.created_at>now()-interval '15 minutes'))
          and b.starts_at<(local_end at time zone 'Africa/Nairobi')
          and b.ends_at>(local_slot at time zone 'Africa/Nairobi'))<t.booking_capacity
      and exists (
        select 1 from public.carwash_memberships w
        where w.tenant_id=t.id and w.role='WASHER' and w.status='ACTIVE'
          and not exists (
            select 1 from public.carwash_orders o
            where o.tenant_id=t.id and o.washer_membership_id=w.id
              and o.status in ('ASSIGNED','IN PROGRESS')
              and coalesce(case when o.status='IN PROGRESS' then o.started_at end,o.scheduled_at,o.checked_in_at)<(local_end at time zone 'Africa/Nairobi')
              and coalesce(case when o.status='IN PROGRESS' then o.started_at end,o.scheduled_at,o.checked_in_at)
                + make_interval(mins=>coalesce((
                  select sum(s.estimated_minutes)::integer
                  from public.carwash_order_services os join public.carwash_services s
                    on s.id=os.service_id and s.tenant_id=os.tenant_id
                  where os.order_id=o.id and os.tenant_id=o.tenant_id
                ),30))>(local_slot at time zone 'Africa/Nairobi')
          )
      ) then
      slot_start:=local_slot at time zone 'Africa/Nairobi';
      return next;
    end if;
  end loop;
end;
$$;

-- A selected time is atomically reserved and immediately creates a wash order.
create or replace function public.carwash_create_public_booking(
  p_slug text,p_service uuid,p_starts_at timestamptz,p_customer_name text,p_customer_phone text,
  p_vehicle_registration text,p_customer_email text default null,p_customer_notes text default null
) returns uuid language plpgsql security definer
set search_path=pg_catalog,public,pg_temp as $$
declare
  t public.carwash_tenants%rowtype;
  s public.carwash_services%rowtype;
  ends timestamptz;
  booking_id uuid;
  local_start timestamp;
  weekday_key text;
  opening time;
  closing time;
  bucket timestamptz;
  used_count integer;
begin
  select * into t from public.carwash_tenants
    where booking_slug=p_slug and booking_enabled and status in ('TRIAL','ACTIVE','EXPIRING SOON') for update;
  if not found then raise exception 'This booking page is unavailable.' using errcode='P0002'; end if;
  if not public.carwash_can_operate(t.id) then raise exception 'Online bookings are temporarily unavailable. Contact the business.' using errcode='42501'; end if;
  if length(trim(coalesce(p_customer_name,''))) not between 2 and 120
    or length(regexp_replace(coalesce(p_customer_phone,''),'[^0-9]','','g')) not between 9 and 15
    or length(trim(coalesce(p_vehicle_registration,''))) not between 2 and 20
    or (p_customer_email is not null and (length(p_customer_email)>254 or p_customer_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'))
    or length(coalesce(p_customer_notes,''))>1000 then
    raise exception 'Check the contact and vehicle details.' using errcode='22023';
  end if;
  select * into s from public.carwash_services where id=p_service and tenant_id=t.id and active;
  if not found then raise exception 'Choose an available service.' using errcode='22023'; end if;
  if p_starts_at is null or p_starts_at<=now() or p_starts_at>now()+interval '60 days' then
    raise exception 'Choose a future time within the next 60 days.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(t.id::text||':'||(p_starts_at at time zone 'Africa/Nairobi')::date::text,0));
  local_start:=p_starts_at at time zone 'Africa/Nairobi';
  weekday_key:=lower(to_char(local_start,'Dy'));
  opening:=coalesce((t.settings->'bookingHours'->weekday_key->>0)::time,case when weekday_key='sun' then null else time '08:00' end);
  closing:=coalesce((t.settings->'bookingHours'->weekday_key->>1)::time,case when weekday_key='sun' then null else time '18:00' end);
  ends:=p_starts_at+make_interval(mins=>s.estimated_minutes);
  if opening is null or closing is null or local_start::time<opening or local_start::time>=closing
    or local_start::time<>date_trunc('minute',local_start)::time
    or mod(extract(minute from local_start)::integer,30)<>0
    or (local_start+make_interval(mins=>s.estimated_minutes))::time>closing then
    raise exception 'That time is outside the business booking hours.' using errcode='22023';
  end if;

  bucket:=to_timestamp(floor(extract(epoch from clock_timestamp())/3600)*3600);
  insert into public.carwash_public_booking_limits(tenant_id,phone_hash,bucket_start,request_count)
    values(t.id,encode(digest(regexp_replace(p_customer_phone,'[^0-9]','','g'),'sha256'),'hex'),bucket,1)
    on conflict(tenant_id,phone_hash,bucket_start)
    do update set request_count=public.carwash_public_booking_limits.request_count+1
    returning request_count into used_count;
  if used_count>5 then raise exception 'Too many booking requests. Please try again later.' using errcode='P0001'; end if;
  if (select count(*) from public.carwash_public_bookings b
      where b.tenant_id=t.id
        and (b.status='CONFIRMED' or (b.status='PENDING' and b.created_at>now()-interval '15 minutes'))
        and b.starts_at<ends and b.ends_at>p_starts_at)>=t.booking_capacity then
    raise exception 'That time is already occupied. Choose another available time.' using errcode='23505';
  end if;

  insert into public.carwash_public_bookings(
    tenant_id,service_id,service_name,price_kes,duration_minutes,customer_name,customer_phone,
    customer_email,vehicle_registration,starts_at,ends_at,status,customer_notes
  ) values (
    t.id,s.id,s.name,s.price_kes,s.estimated_minutes,trim(p_customer_name),trim(p_customer_phone),
    nullif(trim(p_customer_email),''),upper(trim(p_vehicle_registration)),p_starts_at,ends,'CONFIRMED',nullif(trim(p_customer_notes),'')
  ) returning id into booking_id;

  perform public.carwash_dispatch_public_booking(booking_id);
  insert into public.carwash_user_messages(user_id,kind,subject,body,reference_key)
    select m.user_id,'SYSTEM','Online wash booking confirmed',
      trim(p_customer_name)||' booked '||s.name||' for '||to_char(p_starts_at at time zone 'Africa/Nairobi','DD Mon YYYY HH24:MI')||'. Vehicle: '||upper(trim(p_vehicle_registration))||'. The wash is in the washer queue.',
      'PUBLIC_BOOKING:'||booking_id::text
    from public.carwash_memberships m
    where m.tenant_id=t.id and m.status='ACTIVE' and m.role in ('BUSINESS_ADMIN','RECEPTIONIST')
    on conflict(user_id,reference_key) where reference_key is not null do nothing;
  return booking_id;
end;
$$;

-- Versioned RPC: the browser can verify that automatic washer dispatch is deployed
-- before it tells a customer the booking was confirmed.
create or replace function public.carwash_create_online_booking(
  p_slug text,p_service uuid,p_starts_at timestamptz,p_customer_name text,p_customer_phone text,
  p_vehicle_registration text,p_customer_email text default null,p_customer_notes text default null
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,pg_temp as $$
declare booking_id uuid; booking_status text; linked_order uuid;
begin
  booking_id:=public.carwash_create_public_booking(
    p_slug,p_service,p_starts_at,p_customer_name,p_customer_phone,
    p_vehicle_registration,p_customer_email,p_customer_notes
  );
  select b.status,b.wash_order_id into booking_status,linked_order
    from public.carwash_public_bookings b where b.id=booking_id;
  if booking_status<>'CONFIRMED' or linked_order is null then
    raise exception 'The booking could not be added to the washer queue.' using errcode='55000';
  end if;
  return jsonb_build_object('status',booking_status,'booking_id',booking_id);
end;
$$;
revoke all on function public.carwash_create_online_booking(text,uuid,timestamptz,text,text,text,text,text) from public,authenticated;
grant execute on function public.carwash_create_online_booking(text,uuid,timestamptz,text,text,text,text,text) to anon,authenticated;

-- Keep staff controls tenant-scoped, send legacy pending bookings through the same dispatcher,
-- and cancel an unstarted washer job together with its booking.
create or replace function public.carwash_review_public_booking(p_booking uuid,p_status text)
returns public.carwash_public_bookings language plpgsql security definer
set search_path=pg_catalog,public,pg_temp as $$
declare
  row_booking public.carwash_public_bookings%rowtype;
  linked_order public.carwash_orders%rowtype;
begin
  if p_status not in ('CONFIRMED','CANCELLED') then
    raise exception 'Wash completion is recorded from the washer app.' using errcode='22023';
  end if;
  select * into row_booking from public.carwash_public_bookings where id=p_booking for update;
  if not found or not public.carwash_has_tenant_access(row_booking.tenant_id,array['BUSINESS_ADMIN','RECEPTIONIST']) then
    raise exception 'Booking not found.' using errcode='42501';
  end if;
  if row_booking.status not in ('PENDING','CONFIRMED') then
    raise exception 'This booking can no longer be changed.' using errcode='23514';
  end if;

  if p_status='CONFIRMED' then
    if row_booking.starts_at<=now() then raise exception 'This appointment time has passed.' using errcode='22023'; end if;
    perform pg_advisory_xact_lock(hashtextextended(row_booking.tenant_id::text||':'||(row_booking.starts_at at time zone 'Africa/Nairobi')::date::text,0));
    if (select count(*) from public.carwash_public_bookings b
        where b.tenant_id=row_booking.tenant_id and b.id<>row_booking.id
          and (b.status='CONFIRMED' or (b.status='PENDING' and b.created_at>now()-interval '15 minutes'))
          and b.starts_at<row_booking.ends_at and b.ends_at>row_booking.starts_at)>=
        (select booking_capacity from public.carwash_tenants where id=row_booking.tenant_id) then
      raise exception 'That time is now occupied. Choose another available time.' using errcode='23505';
    end if;
    perform public.carwash_dispatch_public_booking(row_booking.id);
    update public.carwash_public_bookings set status='CONFIRMED',reviewed_by=auth.uid(),reviewed_at=now()
      where id=row_booking.id returning * into row_booking;
  else
    if row_booking.wash_order_id is not null then
      select * into linked_order from public.carwash_orders where id=row_booking.wash_order_id for update;
      if found then
        if linked_order.status not in ('WAITING','ASSIGNED') or linked_order.payment_status<>'UNPAID' then
          raise exception 'This wash has already started. Ask the washer or business administrator for help.' using errcode='23514';
        end if;
        delete from public.carwash_orders where id=linked_order.id;
      end if;
    end if;
    update public.carwash_public_bookings set status='CANCELLED',reviewed_by=auth.uid(),reviewed_at=now()
      where id=row_booking.id returning * into row_booking;
  end if;

  insert into public.carwash_audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,details)
    values(row_booking.tenant_id,auth.uid(),'PUBLIC_BOOKING_'||p_status,'PUBLIC_BOOKING',row_booking.id::text,
      jsonb_build_object('status',p_status,'wash_order_id',row_booking.wash_order_id));
  return row_booking;
end;
$$;

-- A washer cannot start a scheduled job before the customer’s appointment.
create or replace function public.carwash_guard_scheduled_order_start()
returns trigger language plpgsql set search_path=pg_catalog,public,pg_temp as $$
begin
  if new.status='IN PROGRESS' and old.status is distinct from new.status
    and new.scheduled_at is not null and new.scheduled_at>now() then
    raise exception 'This booking starts at % . Start the wash at its scheduled time.',
      to_char(new.scheduled_at at time zone 'Africa/Nairobi','DD Mon YYYY HH24:MI') using errcode='55000';
  end if;
  return new;
end;
$$;
drop trigger if exists carwash_scheduled_order_start on public.carwash_orders;
create trigger carwash_scheduled_order_start before update of status on public.carwash_orders
for each row execute function public.carwash_guard_scheduled_order_start();
revoke all on function public.carwash_guard_scheduled_order_start() from public,anon,authenticated;

create or replace function public.carwash_sync_booking_from_order()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin
  if new.status in ('COMPLETED','READY','DELIVERED','CLOSED') and old.status is distinct from new.status then
    update public.carwash_public_bookings
      set status='COMPLETED',reviewed_by=auth.uid(),reviewed_at=now()
      where wash_order_id=new.id and tenant_id=new.tenant_id and status='CONFIRMED';
  end if;
  return new;
end;
$$;
drop trigger if exists carwash_sync_public_booking on public.carwash_orders;
create trigger carwash_sync_public_booking after update of status on public.carwash_orders
for each row execute function public.carwash_sync_booking_from_order();
revoke all on function public.carwash_sync_booking_from_order() from public,anon,authenticated;

-- Receptionists may see and service only their tenant's online bookings in the work queue.
drop policy if exists cw_orders_read on public.carwash_orders;
create policy cw_orders_read on public.carwash_orders for select using (
  public.carwash_is_platform_admin()
  or public.carwash_has_tenant_access(tenant_id,array['BUSINESS_ADMIN'])
  or (public.carwash_has_tenant_access(tenant_id,array['RECEPTIONIST']) and (
    created_by=auth.uid() or exists(select 1 from public.carwash_public_bookings b
      where b.tenant_id=carwash_orders.tenant_id and b.wash_order_id=carwash_orders.id)
  ))
  or (public.carwash_has_tenant_access(tenant_id,array['WASHER']) and public.carwash_is_assigned_worker(id,tenant_id))
);

drop policy if exists cw_customers_read on public.carwash_customers;
create policy cw_customers_read on public.carwash_customers for select using (
  public.carwash_is_platform_admin()
  or public.carwash_has_tenant_access(tenant_id,array['BUSINESS_ADMIN'])
  or (public.carwash_has_tenant_access(tenant_id,array['RECEPTIONIST']) and (
    created_by=auth.uid()
    or exists(select 1 from public.carwash_orders o where o.tenant_id=carwash_customers.tenant_id
      and o.customer_id=carwash_customers.id and o.created_by=auth.uid())
    or exists(select 1 from public.carwash_orders o join public.carwash_public_bookings b
      on b.wash_order_id=o.id and b.tenant_id=o.tenant_id
      where o.tenant_id=carwash_customers.tenant_id and o.customer_id=carwash_customers.id)
  ))
  or (public.carwash_has_tenant_access(tenant_id,array['WASHER']) and exists(
    select 1 from public.carwash_orders o where o.tenant_id=carwash_customers.tenant_id
      and o.customer_id=carwash_customers.id and public.carwash_is_assigned_worker(o.id,o.tenant_id)
  ))
);

drop policy if exists cw_vehicles_read on public.carwash_vehicles;
create policy cw_vehicles_read on public.carwash_vehicles for select using (
  public.carwash_is_platform_admin()
  or public.carwash_has_tenant_access(tenant_id,array['BUSINESS_ADMIN'])
  or (public.carwash_has_tenant_access(tenant_id,array['RECEPTIONIST']) and (
    created_by=auth.uid()
    or exists(select 1 from public.carwash_orders o where o.tenant_id=carwash_vehicles.tenant_id
      and o.vehicle_id=carwash_vehicles.id and o.created_by=auth.uid())
    or exists(select 1 from public.carwash_orders o join public.carwash_public_bookings b
      on b.wash_order_id=o.id and b.tenant_id=o.tenant_id
      where o.tenant_id=carwash_vehicles.tenant_id and o.vehicle_id=carwash_vehicles.id)
  ))
  or (public.carwash_has_tenant_access(tenant_id,array['WASHER']) and exists(
    select 1 from public.carwash_orders o where o.tenant_id=carwash_vehicles.tenant_id
      and o.vehicle_id=carwash_vehicles.id and public.carwash_is_assigned_worker(o.id,o.tenant_id)
  ))
);

drop policy if exists cw_order_services_read on public.carwash_order_services;
create policy cw_order_services_read on public.carwash_order_services for select using (
  public.carwash_is_platform_admin()
  or public.carwash_has_tenant_access(tenant_id,array['BUSINESS_ADMIN'])
  or (public.carwash_has_tenant_access(tenant_id,array['RECEPTIONIST']) and exists(
    select 1 from public.carwash_orders o where o.id=carwash_order_services.order_id
      and o.tenant_id=carwash_order_services.tenant_id and (
        o.created_by=auth.uid() or exists(select 1 from public.carwash_public_bookings b
          where b.wash_order_id=o.id and b.tenant_id=o.tenant_id)
      )
  ))
  or (public.carwash_has_tenant_access(tenant_id,array['WASHER']) and exists(
    select 1 from public.carwash_orders o where o.id=carwash_order_services.order_id
      and o.tenant_id=carwash_order_services.tenant_id and public.carwash_is_assigned_worker(o.id,o.tenant_id)
  ))
);

-- Extend existing guard narrowly for orders created from a tenant's public booking.
create or replace function public.carwash_enforce_staff_record_scope()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare actor public.carwash_memberships%rowtype; order_row public.carwash_orders%rowtype;
begin
  if tg_table_name='carwash_orders' then
    select * into actor from public.carwash_memberships
      where user_id=auth.uid() and tenant_id=old.tenant_id and status='ACTIVE' limit 1;
    if public.carwash_is_platform_admin() or actor.role='BUSINESS_ADMIN' then
      if tg_op='DELETE' then return old; end if;
      return new;
    end if;
    if actor.role='RECEPTIONIST' and (old.created_by=auth.uid() or exists(
      select 1 from public.carwash_public_bookings b
      where b.tenant_id=old.tenant_id and b.wash_order_id=old.id
    )) then
      if tg_op='DELETE' then return old; end if;
      return new;
    end if;
    if tg_op='UPDATE' and actor.role='WASHER' and (
      public.carwash_is_assigned_worker(old.id,old.tenant_id)
      or (old.status='WAITING' and new.status='ASSIGNED' and new.washer_membership_id=actor.id)
    ) then
      if new.tenant_id is distinct from old.tenant_id or new.customer_id is distinct from old.customer_id
        or new.vehicle_id is distinct from old.vehicle_id or new.payment_status is distinct from old.payment_status
        or new.subtotal_kes is distinct from old.subtotal_kes or new.notes is distinct from old.notes
        or new.created_by is distinct from old.created_by or new.scheduled_at is distinct from old.scheduled_at then
        raise exception 'Washers may update status only on assigned orders.' using errcode='42501';
      end if;
      if old.status='WAITING' and (new.washer_membership_id is distinct from actor.id or new.status<>'ASSIGNED') then
        raise exception 'A washer can only claim the next waiting order when it is assigned to them.' using errcode='42501';
      end if;
      if old.status<>'WAITING' and new.washer_membership_id is distinct from old.washer_membership_id then
        raise exception 'Washers cannot reassign orders.' using errcode='42501';
      end if;
      return new;
    end if;
    raise exception 'Staff can only change their own orders or assigned work.' using errcode='42501';
  end if;

  if tg_table_name='carwash_payments' then
    select * into order_row from public.carwash_orders where id=new.order_id and tenant_id=new.tenant_id;
    if not found then raise exception 'Wash order not found.' using errcode='P0002'; end if;
    select * into actor from public.carwash_memberships
      where user_id=auth.uid() and tenant_id=new.tenant_id and status='ACTIVE' limit 1;
    if public.carwash_is_platform_admin() or actor.role='BUSINESS_ADMIN' then return new; end if;
    if actor.role='RECEPTIONIST' and new.recorded_by=auth.uid() and (
      order_row.created_by=auth.uid() or exists(select 1 from public.carwash_public_bookings b
        where b.tenant_id=order_row.tenant_id and b.wash_order_id=order_row.id)
    ) then return new; end if;
    raise exception 'Receptionists can only record payments for orders they created or online bookings.' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function public.carwash_enforce_staff_record_scope() from public,anon,authenticated;

-- Keep booking status in sync with the existing washer completion lifecycle.
create or replace function public.carwash_transition_order(target_order uuid,target_state text)
returns public.carwash_orders language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  current_order public.carwash_orders%rowtype;
  next_order public.carwash_orders%rowtype;
  actor public.carwash_memberships%rowtype;
  is_allowed boolean:=false;
  previous_state text;
  loyalty_points bigint;
begin
  select * into current_order from public.carwash_orders where id=target_order for update;
  if not found then raise exception 'Wash order not found.' using errcode='P0002'; end if;
  select * into actor from public.carwash_memberships
    where user_id=auth.uid() and tenant_id=current_order.tenant_id and status='ACTIVE' limit 1;
  if not found then raise exception 'Active tenant membership required.' using errcode='42501'; end if;
  if not public.carwash_can_operate(current_order.tenant_id) then
    raise exception 'This subscription is restricted. Contact the platform administrator.' using errcode='55000';
  end if;
  if actor.role='RECEPTIONIST' and current_order.created_by is distinct from auth.uid()
    and not exists(select 1 from public.carwash_public_bookings b
      where b.tenant_id=current_order.tenant_id and b.wash_order_id=current_order.id) then
    raise exception 'Receptionists can only update their own orders and online bookings.' using errcode='42501';
  end if;

  is_allowed:=case
    when current_order.status='WAITING' and target_state='ASSIGNED' then actor.role in ('BUSINESS_ADMIN','RECEPTIONIST') and current_order.washer_membership_id is not null and exists(select 1 from public.carwash_memberships w where w.id=current_order.washer_membership_id and w.tenant_id=current_order.tenant_id and w.role='WASHER' and w.status='ACTIVE')
    when current_order.status='ASSIGNED' and target_state='IN PROGRESS' then actor.role='WASHER' and current_order.washer_membership_id=actor.id
    when current_order.status='IN PROGRESS' and target_state='COMPLETED' then actor.role='WASHER' and current_order.washer_membership_id=actor.id
    when current_order.status='COMPLETED' and target_state='READY' then actor.role in ('BUSINESS_ADMIN','RECEPTIONIST')
    when current_order.status='READY' and target_state='DELIVERED' then actor.role in ('BUSINESS_ADMIN','RECEPTIONIST') and current_order.payment_status='PAID'
    when current_order.status='DELIVERED' and target_state='CLOSED' then actor.role='BUSINESS_ADMIN'
    else false end;
  if not is_allowed then raise exception 'This job transition is not allowed.' using errcode='42501'; end if;
  if target_state='DELIVERED' and coalesce((select sum(amount_kes) from public.carwash_payments where order_id=target_order and status='PAID'),0)<current_order.subtotal_kes then
    raise exception 'The order must be fully paid before delivery.' using errcode='23514';
  end if;

  previous_state:=current_order.status;
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
    select * into next_order from public.carwash_orders
      where tenant_id=current_order.tenant_id and status='WAITING' and scheduled_at is null
      order by checked_in_at asc limit 1 for update skip locked;
    if found then
      update public.carwash_orders set washer_membership_id=actor.id,status='ASSIGNED' where id=next_order.id;
      insert into public.carwash_audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,details)
        values(current_order.tenant_id,auth.uid(),'ORDER_AUTO_ASSIGNED','WASH_ORDER',next_order.id::text,jsonb_build_object('washer_membership_id',actor.id));
    end if;
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

revoke all on function public.carwash_public_booking_availability(text,uuid,date) from public,authenticated;
revoke all on function public.carwash_create_public_booking(text,uuid,timestamptz,text,text,text,text,text) from public,anon,authenticated;
revoke all on function public.carwash_review_public_booking(uuid,text) from public,anon;
grant execute on function public.carwash_public_booking_availability(text,uuid,date) to anon,authenticated;
grant execute on function public.carwash_review_public_booking(uuid,text) to authenticated;

notify pgrst,'reload schema';
