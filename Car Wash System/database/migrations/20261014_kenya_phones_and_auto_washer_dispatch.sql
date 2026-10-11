-- Accept both Kenyan mobile prefixes and dispatch work to the least-loaded active washer.
create or replace function public.carwash_create_staff_invite(target_tenant uuid,target_phone text,target_role text)
returns text language plpgsql security definer set search_path=pg_catalog,extensions,public,pg_temp as $$
declare actor public.carwash_memberships%rowtype; raw_token text; normalized_phone text; digits text;
begin
  select * into actor from public.carwash_memberships where user_id=auth.uid() and tenant_id=target_tenant and role='BUSINESS_ADMIN' and status='ACTIVE' limit 1;
  if not found or not public.carwash_can_operate(target_tenant) then raise exception 'Active business administrator access is required.' using errcode='42501'; end if;
  perform public.carwash_consume_rate_limit('STAFF_INVITE',10,3600);
  digits:=regexp_replace(coalesce(target_phone,''),'[^0-9]','','g');
  if digits ~ '^254[17][0-9]{8}$' then digits:='0'||substr(digits,4); end if;
  if digits !~ '^0[17][0-9]{8}$' then raise exception 'Enter a valid Kenyan mobile number beginning with 01 or 07.' using errcode='22023'; end if;
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

-- The client no longer chooses a washer; jobs go to whoever has the lightest active queue.
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
  if actor.role='RECEPTIONIST' and (
    not exists(select 1 from public.carwash_customers c where c.id=target_customer and c.tenant_id=target_tenant and (
      c.created_by=auth.uid() or exists(select 1 from public.carwash_orders o where o.tenant_id=target_tenant and o.customer_id=c.id and o.created_by=auth.uid())
    ))
    or not exists(select 1 from public.carwash_vehicles v where v.id=target_vehicle and v.tenant_id=target_tenant and v.customer_id=target_customer and (
      v.created_by=auth.uid() or exists(select 1 from public.carwash_orders o where o.tenant_id=target_tenant and o.vehicle_id=v.id and o.created_by=auth.uid())
    ))
  ) then raise exception 'Receptionists can only use customers and vehicles from their own records.' using errcode='42501'; end if;
  select count(*) into service_count from public.carwash_services where tenant_id=target_tenant and id=any(target_services) and active;
  if service_count<>cardinality(target_services) then raise exception 'A selected wash service is no longer available.' using errcode='22023'; end if;
  select w.id into target_washer from public.carwash_memberships w
    where w.tenant_id=target_tenant and w.role='WASHER' and w.status='ACTIVE'
    order by (select count(*) from public.carwash_orders o where o.tenant_id=target_tenant
      and o.washer_membership_id=w.id and o.status in ('ASSIGNED','IN PROGRESS')) asc,w.created_at asc
    limit 1;
  insert into public.carwash_orders(tenant_id,customer_id,vehicle_id,washer_membership_id,status,payment_status,subtotal_kes,created_by)
  select target_tenant,target_customer,target_vehicle,target_washer,case when target_washer is null then 'WAITING' else 'ASSIGNED' end,'UNPAID',sum(s.price_kes),auth.uid()
    from public.carwash_services s where s.tenant_id=target_tenant and s.id=any(target_services)
    returning * into created_order;
  insert into public.carwash_order_services(tenant_id,order_id,service_id,service_name_snapshot,price_kes_snapshot,commission_kes_snapshot,rule_version)
    select target_tenant,created_order.id,s.id,s.name,s.price_kes,s.commission_kes,'v1'
    from public.carwash_services s where s.tenant_id=target_tenant and s.id=any(target_services);
  insert into public.carwash_audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,details)
    values(target_tenant,auth.uid(),'ORDER_CREATED','WASH_ORDER',created_order.id::text,jsonb_build_object('subtotal_kes',created_order.subtotal_kes,'washer_membership_id',target_washer));
  return created_order;
end;
$$;

create or replace function public.carwash_transition_order(target_order uuid, target_state text)
returns public.carwash_orders language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  current_order public.carwash_orders%rowtype;
  next_order public.carwash_orders%rowtype;
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
  if actor.role='RECEPTIONIST' and current_order.created_by is distinct from auth.uid() then
    raise exception 'Receptionists can only update orders they created.' using errcode='42501';
  end if;

  is_allowed := case
    when current_order.status='WAITING' and target_state='ASSIGNED' then actor.role in ('BUSINESS_ADMIN','RECEPTIONIST') and current_order.washer_membership_id is not null and exists(select 1 from public.carwash_memberships w where w.id=current_order.washer_membership_id and w.tenant_id=current_order.tenant_id and w.role='WASHER' and w.status='ACTIVE')
    when current_order.status='ASSIGNED' and target_state='IN PROGRESS' then actor.role='WASHER' and current_order.washer_membership_id=actor.id
    when current_order.status='IN PROGRESS' and target_state='COMPLETED' then actor.role='WASHER' and current_order.washer_membership_id=actor.id
    when current_order.status='COMPLETED' and target_state='READY' then actor.role in ('BUSINESS_ADMIN','RECEPTIONIST')
    when current_order.status='READY' and target_state='DELIVERED' then actor.role in ('BUSINESS_ADMIN','RECEPTIONIST') and current_order.payment_status='PAID'
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
    select * into next_order from public.carwash_orders
      where tenant_id=current_order.tenant_id and status='WAITING'
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
    values(current_order.tenant_id,current_order.customer_id, current_order.id,loyalty_points,'EARN');
  end if;

  insert into public.carwash_audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,details)
  values(current_order.tenant_id,auth.uid(),'ORDER_'||replace(target_state,' ','_'),'WASH_ORDER',current_order.id::text,jsonb_build_object('from',previous_state,'to',target_state));
  return current_order;
end;
$$;

-- Let the completion RPC atomically move the freed washer to the next waiting order.
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
    if actor.role='RECEPTIONIST' and old.created_by=auth.uid() then
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
        or new.created_by is distinct from old.created_by then
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
    if actor.role='RECEPTIONIST' and order_row.created_by=auth.uid() and new.recorded_by=auth.uid() then return new; end if;
    raise exception 'Receptionists can only record payments for orders they created.' using errcode='42501';
  end if;
  return new;
end;
$$;
