-- Keep receptionist and washer access limited to their own records and assigned work.
alter table public.carwash_customers
  add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.carwash_customers alter column created_by set default auth.uid();

alter table public.carwash_vehicles
  add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.carwash_vehicles alter column created_by set default auth.uid();

drop policy if exists cw_orders_read on public.carwash_orders;
create policy cw_orders_read on public.carwash_orders for select using (
  public.carwash_is_platform_admin()
  or public.carwash_has_tenant_access(tenant_id,array['BUSINESS_ADMIN'])
  or (public.carwash_has_tenant_access(tenant_id,array['RECEPTIONIST']) and created_by=auth.uid())
  or (public.carwash_has_tenant_access(tenant_id,array['WASHER']) and public.carwash_is_assigned_worker(id,tenant_id))
);

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

drop policy if exists cw_customers_read on public.carwash_customers;
create policy cw_customers_read on public.carwash_customers for select using (
  public.carwash_is_platform_admin()
  or public.carwash_has_tenant_access(tenant_id,array['BUSINESS_ADMIN'])
  or (public.carwash_has_tenant_access(tenant_id,array['RECEPTIONIST']) and (
    created_by=auth.uid()
    or exists(select 1 from public.carwash_orders o where o.tenant_id=carwash_customers.tenant_id
      and o.customer_id=carwash_customers.id and o.created_by=auth.uid())
  ))
  or (public.carwash_has_tenant_access(tenant_id,array['WASHER']) and exists(
    select 1 from public.carwash_orders o where o.tenant_id=carwash_customers.tenant_id
      and o.customer_id=carwash_customers.id and public.carwash_is_assigned_worker(o.id,o.tenant_id)
  ))
);
drop policy if exists cw_customers_insert on public.carwash_customers;
create policy cw_customers_insert on public.carwash_customers for insert with check (
  public.carwash_can_operate(tenant_id)
  and (public.carwash_has_tenant_access(tenant_id,array['BUSINESS_ADMIN'])
    or (public.carwash_has_tenant_access(tenant_id,array['RECEPTIONIST']) and created_by=auth.uid()))
);
drop policy if exists cw_customers_update on public.carwash_customers;
create policy cw_customers_update on public.carwash_customers for update using (
  public.carwash_can_operate(tenant_id)
  and (public.carwash_has_tenant_access(tenant_id,array['BUSINESS_ADMIN'])
    or (public.carwash_has_tenant_access(tenant_id,array['RECEPTIONIST']) and (
      created_by=auth.uid() or exists(select 1 from public.carwash_orders o where o.tenant_id=carwash_customers.tenant_id
        and o.customer_id=carwash_customers.id and o.created_by=auth.uid())
    )))
) with check (
  public.carwash_can_operate(tenant_id)
  and (public.carwash_has_tenant_access(tenant_id,array['BUSINESS_ADMIN'])
    or (public.carwash_has_tenant_access(tenant_id,array['RECEPTIONIST']) and (
      created_by=auth.uid() or exists(select 1 from public.carwash_orders o where o.tenant_id=carwash_customers.tenant_id
        and o.customer_id=carwash_customers.id and o.created_by=auth.uid())
    )))
);

drop policy if exists cw_vehicles_read on public.carwash_vehicles;
create policy cw_vehicles_read on public.carwash_vehicles for select using (
  public.carwash_is_platform_admin()
  or public.carwash_has_tenant_access(tenant_id,array['BUSINESS_ADMIN'])
  or (public.carwash_has_tenant_access(tenant_id,array['RECEPTIONIST']) and (
    created_by=auth.uid()
    or exists(select 1 from public.carwash_orders o where o.tenant_id=carwash_vehicles.tenant_id
      and o.vehicle_id=carwash_vehicles.id and o.created_by=auth.uid())
  ))
  or (public.carwash_has_tenant_access(tenant_id,array['WASHER']) and exists(
    select 1 from public.carwash_orders o where o.tenant_id=carwash_vehicles.tenant_id
      and o.vehicle_id=carwash_vehicles.id and public.carwash_is_assigned_worker(o.id,o.tenant_id)
  ))
);
drop policy if exists cw_vehicles_insert on public.carwash_vehicles;
create policy cw_vehicles_insert on public.carwash_vehicles for insert with check (
  public.carwash_can_operate(tenant_id)
  and (public.carwash_has_tenant_access(tenant_id,array['BUSINESS_ADMIN'])
    or (public.carwash_has_tenant_access(tenant_id,array['RECEPTIONIST']) and created_by=auth.uid()))
);
drop policy if exists cw_vehicles_update on public.carwash_vehicles;
create policy cw_vehicles_update on public.carwash_vehicles for update using (
  public.carwash_can_operate(tenant_id)
  and (public.carwash_has_tenant_access(tenant_id,array['BUSINESS_ADMIN'])
    or (public.carwash_has_tenant_access(tenant_id,array['RECEPTIONIST']) and (
      created_by=auth.uid() or exists(select 1 from public.carwash_orders o where o.tenant_id=carwash_vehicles.tenant_id
        and o.vehicle_id=carwash_vehicles.id and o.created_by=auth.uid())
    )))
) with check (
  public.carwash_can_operate(tenant_id)
  and (public.carwash_has_tenant_access(tenant_id,array['BUSINESS_ADMIN'])
    or (public.carwash_has_tenant_access(tenant_id,array['RECEPTIONIST']) and (
      created_by=auth.uid() or exists(select 1 from public.carwash_orders o where o.tenant_id=carwash_vehicles.tenant_id
        and o.vehicle_id=carwash_vehicles.id and o.created_by=auth.uid())
    )))
);

drop policy if exists cw_order_services_read on public.carwash_order_services;
create policy cw_order_services_read on public.carwash_order_services for select using (
  public.carwash_is_platform_admin()
  or public.carwash_has_tenant_access(tenant_id,array['BUSINESS_ADMIN'])
  or (public.carwash_has_tenant_access(tenant_id,array['RECEPTIONIST']) and exists(
    select 1 from public.carwash_orders o where o.id=carwash_order_services.order_id
      and o.tenant_id=carwash_order_services.tenant_id and o.created_by=auth.uid()
  ))
  or (public.carwash_has_tenant_access(tenant_id,array['WASHER']) and exists(
    select 1 from public.carwash_orders o where o.id=carwash_order_services.order_id
      and o.tenant_id=carwash_order_services.tenant_id and public.carwash_is_assigned_worker(o.id,o.tenant_id)
  ))
);

drop policy if exists cw_payments_read on public.carwash_payments;
create policy cw_payments_read on public.carwash_payments for select using (
  public.carwash_is_platform_admin()
  or public.carwash_has_tenant_access(tenant_id,array['BUSINESS_ADMIN'])
  or (public.carwash_has_tenant_access(tenant_id,array['RECEPTIONIST']) and recorded_by=auth.uid())
);

drop policy if exists cw_loyalty_accounts_read on public.carwash_loyalty_accounts;
create policy cw_loyalty_accounts_read on public.carwash_loyalty_accounts for select using (
  public.carwash_is_platform_admin()
  or public.carwash_has_tenant_access(tenant_id,array['BUSINESS_ADMIN'])
  or (public.carwash_has_tenant_access(tenant_id,array['RECEPTIONIST']) and exists(
    select 1 from public.carwash_orders o where o.tenant_id=carwash_loyalty_accounts.tenant_id
      and o.customer_id=carwash_loyalty_accounts.customer_id and o.created_by=auth.uid()
  ))
);
drop policy if exists cw_loyalty_ledger_read on public.carwash_loyalty_ledger;
create policy cw_loyalty_ledger_read on public.carwash_loyalty_ledger for select using (
  public.carwash_is_platform_admin()
  or public.carwash_has_tenant_access(tenant_id,array['BUSINESS_ADMIN'])
  or (public.carwash_has_tenant_access(tenant_id,array['RECEPTIONIST']) and exists(
    select 1 from public.carwash_orders o where o.id=carwash_loyalty_ledger.order_id
      and o.tenant_id=carwash_loyalty_ledger.tenant_id and o.created_by=auth.uid()
  ))
);

-- The server-side RPCs run as security definer, so enforce staff ownership in triggers too.
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
    if tg_op='UPDATE' and actor.role='WASHER' and public.carwash_is_assigned_worker(old.id,old.tenant_id) then
      if new.tenant_id is distinct from old.tenant_id or new.customer_id is distinct from old.customer_id
        or new.vehicle_id is distinct from old.vehicle_id or new.washer_membership_id is distinct from old.washer_membership_id
        or new.payment_status is distinct from old.payment_status or new.subtotal_kes is distinct from old.subtotal_kes
        or new.notes is distinct from old.notes or new.created_by is distinct from old.created_by then
        raise exception 'Washers may update status only on their assigned orders.' using errcode='42501';
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

drop trigger if exists carwash_order_staff_scope on public.carwash_orders;
create trigger carwash_order_staff_scope before update or delete on public.carwash_orders
for each row execute function public.carwash_enforce_staff_record_scope();
drop trigger if exists carwash_payment_staff_scope on public.carwash_payments;
create trigger carwash_payment_staff_scope before insert on public.carwash_payments
for each row execute function public.carwash_enforce_staff_record_scope();

revoke all on function public.carwash_enforce_staff_record_scope() from public,anon,authenticated;
notify pgrst, 'reload schema';
