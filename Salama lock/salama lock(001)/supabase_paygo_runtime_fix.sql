-- SALAMA LOCK Paygo runtime fix
-- Run this on an existing Supabase database to add the missing Paygo columns
-- and backfill customer schedule state from payment history.

alter table public.customers add column if not exists paygo_started_at timestamptz;
alter table public.customers add column if not exists paygo_first_payment_at timestamptz;
alter table public.customers add column if not exists paygo_last_payment_at timestamptz;
alter table public.customers add column if not exists paygo_next_due_at timestamptz;
alter table public.customers add column if not exists paygo_usage_ends_at timestamptz;
alter table public.customers add column if not exists paygo_grace_until_at timestamptz;
alter table public.customers add column if not exists paygo_installments_paid integer not null default 0;
alter table public.customers add column if not exists paygo_total_installments integer not null default 0;
alter table public.customers add column if not exists paygo_frequency_hours integer not null default 24;
alter table public.customers add column if not exists paygo_grace_period_hours integer not null default 72;
alter table public.customers add column if not exists paygo_schedule_status text not null default 'inactive';

with payment_rollup as (
  select
    p.customer_id,
    min(p.date) filter (where p.status in ('paid', 'completed', 'success')) as first_payment_at,
    max(p.date) filter (where p.status in ('paid', 'completed', 'success')) as last_payment_at,
    coalesce(
      sum(
        case
          when p.status in ('paid', 'completed', 'success')
            then coalesce(p.deposit_credit, 0) + coalesce(p.paygo_payment, 0)
          else 0
        end
      ),
      0
    ) as total_paid
  from public.payments p
  where p.customer_id is not null
  group by p.customer_id
)
update public.customers c
set
  paygo_started_at = coalesce(c.paygo_started_at, r.first_payment_at),
  paygo_first_payment_at = coalesce(c.paygo_first_payment_at, r.first_payment_at),
  paygo_last_payment_at = coalesce(c.paygo_last_payment_at, r.last_payment_at),
  paygo_next_due_at = coalesce(
    c.paygo_next_due_at,
    case
      when r.last_payment_at is not null then r.last_payment_at + interval '24 hours'
      when c.due_date is not null then c.due_date::timestamptz
      else null
    end
  ),
  paygo_usage_ends_at = coalesce(
    c.paygo_usage_ends_at,
    case
      when r.last_payment_at is not null then r.last_payment_at + interval '24 hours'
      when c.due_date is not null then c.due_date::timestamptz
      else null
    end
  ),
  paygo_grace_until_at = coalesce(
    c.paygo_grace_until_at,
    case
      when r.last_payment_at is not null then r.last_payment_at + interval '96 hours'
      when c.due_date is not null then c.due_date::timestamptz + interval '72 hours'
      else null
    end
  ),
  paygo_installments_paid = case
    when c.daily_installment > 0 then greatest(floor(r.total_paid / c.daily_installment)::integer, 0)
    else c.paygo_installments_paid
  end,
  paygo_total_installments = case
    when c.total_payable > 0 and c.daily_installment > 0 then greatest(ceil(c.total_payable / c.daily_installment)::integer, 0)
    else c.paygo_total_installments
  end,
  paygo_frequency_hours = coalesce(nullif(c.paygo_frequency_hours, 0), 24),
  paygo_grace_period_hours = coalesce(nullif(c.paygo_grace_period_hours, 0), 72),
  paygo_schedule_status = case
    when coalesce(r.total_paid, 0) <= 0 then 'inactive'
    when c.total_payable > 0 and coalesce(c.total_payable - r.total_paid, 0) <= 0 then 'complete'
    when coalesce(
      c.paygo_next_due_at,
      case
        when r.last_payment_at is not null then r.last_payment_at + interval '24 hours'
        when c.due_date is not null then c.due_date::timestamptz
        else null
      end
    ) is null then 'inactive'
    when now() < coalesce(
      c.paygo_next_due_at,
      case
        when r.last_payment_at is not null then r.last_payment_at + interval '24 hours'
        when c.due_date is not null then c.due_date::timestamptz
        else null
      end
    ) then 'active'
    when now() < coalesce(
      c.paygo_grace_until_at,
      case
        when r.last_payment_at is not null then r.last_payment_at + interval '96 hours'
        when c.due_date is not null then c.due_date::timestamptz + interval '72 hours'
        else null
      end
    ) then 'due'
    else 'locked'
  end
from payment_rollup r
where c.id = r.customer_id;

update public.customers
set
  paygo_frequency_hours = coalesce(nullif(paygo_frequency_hours, 0), 24),
  paygo_grace_period_hours = coalesce(nullif(paygo_grace_period_hours, 0), 72),
  paygo_schedule_status = coalesce(paygo_schedule_status, 'inactive'),
  paygo_installments_paid = coalesce(paygo_installments_paid, 0),
  paygo_total_installments = coalesce(paygo_total_installments, 0)
where true;
