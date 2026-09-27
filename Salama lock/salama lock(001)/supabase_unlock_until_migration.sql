-- Rebuild PAYGO unlock timing from successful payment history.
-- Customers receive exactly the paid usage window:
-- unlock_duration = (payment_amount / daily_installment) * 24 hours

begin;

alter table public.customers
  add column if not exists unlock_until timestamptz;

create index if not exists idx_customers_unlock_until
  on public.customers (unlock_until)
  where unlock_until is not null;

with recursive successful_payments as (
  select
    p.customer_id,
    c.daily_installment,
    coalesce(p.provider_paid_at, p.date, p.created_at, p.updated_at, now()) as payment_at,
    coalesce(p.deposit_credit, 0) + coalesce(p.paygo_payment, 0) as payment_amount,
    row_number() over (
      partition by p.customer_id
      order by coalesce(p.provider_paid_at, p.date, p.created_at, p.updated_at, now()), p.id
    ) as rn
  from public.payments p
  join public.customers c
    on c.id = p.customer_id
  where p.customer_id is not null
    and c.product_type = 'phone'
    and c.daily_installment > 0
    and p.status in ('paid', 'completed', 'success')
    and coalesce(p.deposit_credit, 0) + coalesce(p.paygo_payment, 0) > 0
),
payment_unlocks as (
  select
    customer_id,
    rn,
    payment_at,
    payment_amount,
    daily_installment,
    payment_at + ((payment_amount / daily_installment) * interval '24 hours') as unlock_until
  from successful_payments
  where rn = 1

  union all

  select
    p.customer_id,
    p.rn,
    p.payment_at,
    p.payment_amount,
    p.daily_installment,
    greatest(u.unlock_until, p.payment_at) + ((p.payment_amount / p.daily_installment) * interval '24 hours') as unlock_until
  from payment_unlocks u
  join successful_payments p
    on p.customer_id = u.customer_id
   and p.rn = u.rn + 1
),
latest_unlocks as (
  select
    customer_id,
    max(unlock_until) as unlock_until
  from payment_unlocks
  group by customer_id
)
update public.customers c
set
  unlock_until = latest_unlocks.unlock_until,
  paygo_usage_ends_at = latest_unlocks.unlock_until,
  paygo_next_due_at = latest_unlocks.unlock_until,
  paygo_schedule_status = case
    when now() < latest_unlocks.unlock_until then 'active'
    else 'locked'
  end,
  updated_at = now()
from latest_unlocks
where c.id = latest_unlocks.customer_id;

update public.customers c
set
  unlock_until = null,
  paygo_usage_ends_at = null,
  paygo_next_due_at = null,
  paygo_schedule_status = 'inactive',
  updated_at = now()
where c.product_type = 'phone'
  and not exists (
    select 1
    from public.payments p
    where p.customer_id = c.id
      and p.status in ('paid', 'completed', 'success')
      and coalesce(p.deposit_credit, 0) + coalesce(p.paygo_payment, 0) > 0
  );

commit;
