-- Link request history to confirmed subscription payments. A registration that
-- only received its free trial stays out of the approved request history until
-- a payment is actually recorded and workspace access becomes ACTIVE.

alter table public.carwash_access_requests
  add column if not exists payment_reviewed_at timestamptz,
  add column if not exists payment_reviewed_by uuid references auth.users(id) on delete set null;

create or replace function public.carwash_mark_request_payment_reviewed()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,pg_temp
as $$
begin
  update public.carwash_tenants
  set status='ACTIVE'
  where id=new.tenant_id;

  update public.carwash_access_requests r
  set status='APPROVED',
      payment_reviewed_at=coalesce(r.payment_reviewed_at,new.paid_at,now()),
      payment_reviewed_by=coalesce(r.payment_reviewed_by,new.confirmed_by)
  where r.status='APPROVED'
    and r.user_id in (
      select m.user_id
      from public.carwash_memberships m
      where m.tenant_id=new.tenant_id
        and m.role='BUSINESS_ADMIN'
        and m.status='ACTIVE'
    );
  return new;
end;
$$;

revoke all on function public.carwash_mark_request_payment_reviewed() from public,anon,authenticated;

drop trigger if exists carwash_payment_activates_request_history
  on public.carwash_subscription_payments;
create trigger carwash_payment_activates_request_history
  after insert on public.carwash_subscription_payments
  for each row execute function public.carwash_mark_request_payment_reviewed();

-- Backfill payment review markers for accounts paid before this migration.
with latest_payment as (
  select distinct on (tenant_id) tenant_id,paid_at,confirmed_by
  from public.carwash_subscription_payments
  order by tenant_id,paid_at desc
)
update public.carwash_access_requests r
set payment_reviewed_at=coalesce(r.payment_reviewed_at,p.paid_at,now()),
    payment_reviewed_by=coalesce(r.payment_reviewed_by,p.confirmed_by)
from public.carwash_memberships m
join latest_payment p on p.tenant_id=m.tenant_id
where m.user_id=r.user_id
  and m.role='BUSINESS_ADMIN'
  and r.status='APPROVED';

notify pgrst,'reload schema';
