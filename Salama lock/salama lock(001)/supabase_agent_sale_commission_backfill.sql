-- Agent sale commission backfill.
-- Creates missing sale-activation commissions for existing sold/customer accounts.
-- Safe behavior:
-- - Uses the earliest successful payment per customer as the sale/deposit basis.
-- - Skips rows without an agent code/name.
-- - Skips customers/payments that already have a sale_activation_commission.
-- - Does not update balances, payments, or paid commission records.

with ranked_payments as (
  select
    p.*,
    row_number() over (
      partition by p.customer_id
      order by coalesce(p.date, p.created_at), p.created_at, p.id
    ) as payment_rank
  from public.payments p
  where p.customer_id is not null
    and lower(coalesce(nullif(p.status, ''), nullif(p.payment_status, ''), '')) in ('paid', 'completed', 'success', 'successful')
    and (
      coalesce(p.deposit_credit, 0) > 0
      or coalesce(p.paygo_payment, 0) > 0
      or coalesce(p.paid_amount, 0) > 0
    )
),
first_sale_payments as (
  select
    rp.*,
    coalesce(nullif(rp.agent_id, ''), nullif(c.agent_id, '')) as resolved_agent_code,
    coalesce(nullif(rp.agent_name, ''), nullif(c.agent_name, '')) as resolved_agent_name,
    coalesce(nullif(rp.customer_name, ''), nullif(c.customer_name, 'Customer'), 'Customer') as resolved_customer_name,
    case
      when lower(coalesce(nullif(rp.product_type, ''), '')) in ('phone', 'phones', 'mobile', 'mobile phone') then 'phone'
      when lower(coalesce(nullif(rp.product_type, ''), '')) in ('bike', 'bikes', 'motorbike', 'motorcycle') then 'bike'
      when lower(coalesce(nullif(c.product_type, ''), '')) in ('phone', 'phones', 'mobile', 'mobile phone') then 'phone'
      when lower(coalesce(nullif(c.product_type, ''), '')) in ('bike', 'bikes', 'motorbike', 'motorcycle') then 'bike'
      when concat_ws(' ', rp.product_model, rp.bike_model, c.product_model, c.bike_model)
        ~* '(^|[^a-z0-9])(phone|mobile|smartphone|tecno|samsung|infinix|itel|oppo|vivo|redmi|xiaomi|nokia|iphone|honor|motorola)([^a-z0-9]|$)' then 'phone'
      when concat_ws(' ', rp.product_model, rp.bike_model, c.product_model, c.bike_model)
        ~* '(^|[^a-z0-9])(bike|motorbike|motorcycle|boxer|tvs|bajaj|honda|yamaha|hero)([^a-z0-9]|$)' then 'bike'
      when length(regexp_replace(coalesce(nullif(rp.serial_number, ''), nullif(c.serial_number, ''), ''), '[^0-9]', '', 'g')) = 15 then 'phone'
      else 'product'
    end as resolved_product_type,
    coalesce(nullif(rp.product_model, ''), nullif(rp.bike_model, ''), nullif(c.product_model, ''), nullif(c.bike_model, ''), 'Product') as resolved_product_model,
    coalesce(nullif(rp.serial_number, ''), nullif(c.serial_number, '')) as resolved_serial_number,
    coalesce(nullif(rp.chassis_number, ''), nullif(c.chassis_number, '')) as resolved_chassis_number,
    coalesce(a.phone, null) as resolved_agent_phone,
    case
      when coalesce(rp.deposit_credit, 0) > 0 then coalesce(rp.deposit_credit, 0)
      when coalesce(rp.paid_amount, 0) > 0 then coalesce(rp.paid_amount, 0)
      else coalesce(rp.paygo_payment, 0)
    end as commission_base
  from ranked_payments rp
  join public.customers c on c.id = rp.customer_id
  left join public.agents a on lower(a.agent_code) = lower(coalesce(nullif(rp.agent_id, ''), nullif(c.agent_id, '')))
  where rp.payment_rank = 1
),
eligible_sale_payments as (
  select *
  from first_sale_payments fsp
  where nullif(fsp.resolved_agent_code, '') is not null
    and nullif(fsp.resolved_agent_name, '') is not null
    and fsp.commission_base > 0
    and not exists (
      select 1
      from public.commissions c
      where c.type = 'sale_activation_commission'
        and (
          c.payment_id = fsp.id
          or (
            lower(c.agent_code) = lower(fsp.resolved_agent_code)
            and lower(coalesce(c.customer_name, '')) = lower(coalesce(fsp.resolved_customer_name, ''))
            and coalesce(c.serial_number, '') = coalesce(fsp.resolved_serial_number, '')
            and coalesce(c.chassis_number, '') = coalesce(fsp.resolved_chassis_number, '')
          )
        )
    )
)
insert into public.commissions (
  id,
  payment_id,
  agent_name,
  agent_code,
  agent_phone,
  customer_name,
  product_type,
  product_model,
  serial_number,
  chassis_number,
  type,
  amount,
  status,
  earned_at,
  source_portal
)
select
  'COM-SALE-' || coalesce(nullif(receipt, ''), id),
  id,
  resolved_agent_name,
  resolved_agent_code,
  resolved_agent_phone,
  resolved_customer_name,
  resolved_product_type,
  resolved_product_model,
  resolved_serial_number,
  resolved_chassis_number,
  'sale_activation_commission',
  round(commission_base * case when lower(resolved_product_type) = 'phone' then 0.03 else 0.04 end),
  'earned',
  coalesce(date, created_at, now()),
  'finance_backfill'
from eligible_sale_payments
on conflict (id) do nothing;
