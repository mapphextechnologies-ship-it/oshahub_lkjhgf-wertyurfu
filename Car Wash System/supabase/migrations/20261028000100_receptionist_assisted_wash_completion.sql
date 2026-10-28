-- Let reception finish a wash on behalf of its assigned washer without changing
-- the washer's ownership, commission, or the existing checkout/payment flow.
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
    if tg_op='UPDATE' and actor.role='RECEPTIONIST' and old.status='IN PROGRESS'
      and new.status='COMPLETED' and old.washer_membership_id is not null
      and new.washer_membership_id=old.washer_membership_id
      and (to_jsonb(new)-'status'-'completed_at'-'updated_at')=(to_jsonb(old)-'status'-'completed_at'-'updated_at') then
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
      where b.tenant_id=current_order.tenant_id and b.wash_order_id=current_order.id)
    and not (current_order.status='IN PROGRESS' and target_state='COMPLETED'
      and current_order.washer_membership_id is not null) then
    raise exception 'Receptionists can only update their own orders, online bookings, or record completion for an assigned washer.' using errcode='42501';
  end if;

  is_allowed:=case
    when current_order.status='WAITING' and target_state='ASSIGNED' then actor.role in ('BUSINESS_ADMIN','RECEPTIONIST') and current_order.washer_membership_id is not null and exists(select 1 from public.carwash_memberships w where w.id=current_order.washer_membership_id and w.tenant_id=current_order.tenant_id and w.role='WASHER' and w.status='ACTIVE')
    when current_order.status='ASSIGNED' and target_state='IN PROGRESS' then actor.role='WASHER' and current_order.washer_membership_id=actor.id
    when current_order.status='IN PROGRESS' and target_state='COMPLETED' then
      (actor.role='WASHER' and current_order.washer_membership_id=actor.id)
      or (actor.role='RECEPTIONIST' and exists(select 1 from public.carwash_memberships w
        where w.id=current_order.washer_membership_id and w.tenant_id=current_order.tenant_id and w.role='WASHER'))
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
    select current_order.tenant_id,current_order.washer_membership_id,current_order.id,os.id,os.rule_version,os.commission_kes_snapshot
      from public.carwash_order_services os where os.order_id=current_order.id and os.tenant_id=current_order.tenant_id
      on conflict(order_service_id) do nothing;
    select * into next_order from public.carwash_orders
      where tenant_id=current_order.tenant_id and status='WAITING' and scheduled_at is null
        and exists(select 1 from public.carwash_memberships w where w.id=current_order.washer_membership_id and w.tenant_id=current_order.tenant_id and w.role='WASHER' and w.status='ACTIVE')
      order by checked_in_at asc limit 1 for update skip locked;
    if found then
      update public.carwash_orders set washer_membership_id=current_order.washer_membership_id,status='ASSIGNED' where id=next_order.id;
      insert into public.carwash_audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,details)
        values(current_order.tenant_id,auth.uid(),'ORDER_AUTO_ASSIGNED','WASH_ORDER',next_order.id::text,jsonb_build_object('washer_membership_id',current_order.washer_membership_id));
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
    values(current_order.tenant_id,auth.uid(),'ORDER_'||replace(target_state,' ','_'),'WASH_ORDER',current_order.id::text,
      jsonb_build_object('from',previous_state,'to',target_state)||case when target_state='COMPLETED' then
        jsonb_build_object('performed_by_membership_id',current_order.washer_membership_id,'entered_by_user_id',auth.uid(),'entered_by_role',actor.role)
        else '{}'::jsonb end);
  return current_order;
end;
$$;

notify pgrst,'reload schema';
