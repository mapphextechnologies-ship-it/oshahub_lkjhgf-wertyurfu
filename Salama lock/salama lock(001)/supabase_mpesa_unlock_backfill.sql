-- Backfill the missing M-PESA deposit for account 29352273.
-- Payment time used here is 11 Jul 2026 19:51:00 Africa/Nairobi.
-- The unlock window is extended to 24 hours after that payment time.
-- This script is idempotent for the payment row receipt, and it rebuilds
-- the customer PAYGO summary from the ledger so reruns do not double-count.

begin;

do $$
declare
  v_account_reference text := '29352273';
  v_customer_phone text := '0768114333';
  v_customer_name_hint text := 'James Atsali';
  v_receipt text := 'UGBDHAST2G';
  v_transaction_id text := 'UGBDHAST2G';
  v_payer_phone_raw text := '+254 740 418079';
  v_payer_phone text := '254740418079';
  v_paid_at timestamptz := timestamptz '2026-07-11 19:51:00+03:00';
  v_paid_amount numeric(14,2) := 500.00;
  v_fallback_daily_installment numeric(14,2) := 80.00;
  v_customer public.customers%rowtype;
  v_customer_name text;
  v_customer_phone_value text;
  v_product_type text;
  v_product_model text;
  v_agent_name text;
  v_agent_id text;
  v_serial_number text;
  v_chassis_number text;
  v_total_payable numeric(14,2);
  v_current_balance numeric(14,2);
  v_daily_installment numeric(14,2);
  v_due_date date;
  v_rollup_total_paid numeric(14,2) := 0;
  v_rollup_paygo_paid numeric(14,2) := 0;
  v_rollup_first_payment_at timestamptz;
  v_rollup_last_payment_at timestamptz;
  v_effective_unlock_until timestamptz;
  v_status text;
begin
  select c.*
  into v_customer
  from public.customers c
  where c.national_id = v_account_reference
     or c.customer_phone = v_customer_phone
     or c.id = v_account_reference
     or exists (
       select 1
       from public.customer_device_mappings m
       where m.customer_id = c.id
         and m.customer_account = v_account_reference
     )
  order by
    case
      when c.national_id = v_account_reference then 1
      when c.customer_phone = v_customer_phone then 2
      when c.id = v_account_reference then 3
      when exists (
        select 1
        from public.customer_device_mappings m
        where m.customer_id = c.id
          and m.customer_account = v_account_reference
      ) then 4
      else 99
    end
  limit 1;

  if not found then
    raise exception 'No customer found for account reference % or phone %', v_account_reference, v_customer_phone;
  end if;

  v_customer_name := coalesce(nullif(btrim(v_customer.customer_name), ''), v_customer_name_hint, 'Customer');
  v_customer_phone_value := coalesce(nullif(btrim(v_customer.customer_phone), ''), v_customer_phone);
  v_product_type := coalesce(nullif(btrim(v_customer.product_type), ''), 'phone');
  v_product_model := coalesce(nullif(btrim(v_customer.product_model), ''), nullif(btrim(v_customer.bike_model), ''), 'Phone');
  v_agent_name := coalesce(nullif(btrim(v_customer.agent_name), ''), 'Agent');
  v_agent_id := coalesce(nullif(btrim(v_customer.agent_id), ''), 'AG-BACKFILL');
  v_serial_number := coalesce(nullif(btrim(v_customer.serial_number), ''), nullif(btrim(v_customer.chassis_number), ''), v_account_reference);
  v_chassis_number := coalesce(nullif(btrim(v_customer.chassis_number), ''), nullif(btrim(v_customer.serial_number), ''), v_account_reference);
  v_total_payable := greatest(coalesce(v_customer.total_payable, v_customer.balance, 0), v_paid_amount);
  v_current_balance := greatest(coalesce(nullif(v_customer.balance, 0), v_customer.total_payable, 0), v_paid_amount);
  v_daily_installment := coalesce(nullif(v_customer.daily_installment, 0), v_fallback_daily_installment);
  v_due_date := (v_paid_at + interval '24 hours')::date;

  insert into public.payments (
    id,
    customer_id,
    customer_name,
    customer_phone,
    product_type,
    product_model,
    agent_name,
    agent_id,
    bike_model,
    serial_number,
    chassis_number,
    total_payable,
    paid_amount,
    balance,
    daily_target,
    daily_installment,
    due_date,
    registration_status,
    payment_status,
    deposit_credit,
    paygo_payment,
    date,
    receipt,
    provider_reference,
    provider_transaction_id,
    provider_account_reference,
    provider_payer_phone,
    provider_payer_phone_raw,
    provider_paid_at,
    reconciliation_status,
    verified_at,
    verified_by,
    method,
    status,
    source_portal,
    created_at,
    updated_at
  ) values (
    'PAY-' || v_receipt,
    v_customer.id,
    v_customer_name,
    v_customer_phone_value,
    v_product_type,
    v_product_model,
    v_agent_name,
    v_agent_id,
    null,
    v_serial_number,
    v_chassis_number,
    v_total_payable,
    v_paid_amount,
    greatest(v_current_balance - v_paid_amount, 0),
    v_daily_installment,
    v_daily_installment,
    v_due_date,
    'registered',
    'paid',
    v_paid_amount,
    0,
    v_paid_at,
    v_receipt,
    v_transaction_id,
    v_transaction_id,
    v_account_reference,
    v_payer_phone,
    v_payer_phone_raw,
    v_paid_at,
    'matched',
    v_paid_at,
    'supabase_mpesa_backfill',
    'mpesa_c2b',
    'paid',
    'mpesa_c2b',
    v_paid_at,
    v_paid_at
  )
  on conflict (receipt) do update set
    customer_id = excluded.customer_id,
    customer_name = excluded.customer_name,
    customer_phone = excluded.customer_phone,
    product_type = excluded.product_type,
    product_model = excluded.product_model,
    agent_name = excluded.agent_name,
    agent_id = excluded.agent_id,
    bike_model = excluded.bike_model,
    serial_number = excluded.serial_number,
    chassis_number = excluded.chassis_number,
    total_payable = excluded.total_payable,
    paid_amount = excluded.paid_amount,
    balance = excluded.balance,
    daily_target = excluded.daily_target,
    daily_installment = excluded.daily_installment,
    due_date = excluded.due_date,
    registration_status = excluded.registration_status,
    payment_status = excluded.payment_status,
    deposit_credit = excluded.deposit_credit,
    paygo_payment = excluded.paygo_payment,
    date = excluded.date,
    provider_reference = excluded.provider_reference,
    provider_transaction_id = excluded.provider_transaction_id,
    provider_account_reference = excluded.provider_account_reference,
    provider_payer_phone = excluded.provider_payer_phone,
    provider_payer_phone_raw = excluded.provider_payer_phone_raw,
    provider_paid_at = excluded.provider_paid_at,
    reconciliation_status = excluded.reconciliation_status,
    verified_at = excluded.verified_at,
    verified_by = excluded.verified_by,
    method = excluded.method,
    status = excluded.status,
    source_portal = excluded.source_portal,
    updated_at = excluded.updated_at;

  select
    coalesce(
      sum(
        case
          when coalesce(p.deposit_credit, 0) + coalesce(p.paygo_payment, 0) > 0
            then coalesce(p.deposit_credit, 0) + coalesce(p.paygo_payment, 0)
          else coalesce(p.paid_amount, 0)
        end
      ),
      0
    ),
    coalesce(sum(coalesce(p.paygo_payment, 0)), 0),
    min(coalesce(p.provider_paid_at, p.date, p.created_at, p.updated_at)),
    max(coalesce(p.provider_paid_at, p.date, p.created_at, p.updated_at))
  into
    v_rollup_total_paid,
    v_rollup_paygo_paid,
    v_rollup_first_payment_at,
    v_rollup_last_payment_at
  from public.payments p
  where p.customer_id = v_customer.id
    and lower(coalesce(p.status, p.payment_status, '')) in ('paid', 'completed', 'success')
    and coalesce(p.deposit_credit, 0) + coalesce(p.paygo_payment, 0) + coalesce(p.paid_amount, 0) > 0;

  if v_rollup_first_payment_at is null then
    v_rollup_first_payment_at := v_paid_at;
  end if;
  if v_rollup_last_payment_at is null then
    v_rollup_last_payment_at := v_paid_at;
  end if;

  v_effective_unlock_until := case
    when v_customer.unlock_until is null
      or v_customer.unlock_until < (v_rollup_last_payment_at + interval '24 hours')
      then v_rollup_last_payment_at + interval '24 hours'
    else v_customer.unlock_until
  end;

  v_status := case
    when greatest(coalesce(nullif(v_customer.balance, 0), v_customer.total_payable, 0) - v_rollup_total_paid, 0) <= 0 then 'paid'
    else 'active'
  end;

  update public.customers c
  set
    paid_amount = v_rollup_total_paid,
    balance = greatest(v_current_balance - v_rollup_total_paid, 0),
    daily_installment = v_daily_installment,
    last_payment_date = case
      when v_customer.last_payment_date is null or v_customer.last_payment_date < v_rollup_last_payment_at::date then v_rollup_last_payment_at::date
      else v_customer.last_payment_date
    end,
    status = v_status,
    overdue_days = case
      when greatest(v_current_balance - v_rollup_total_paid, 0) <= 0 then 0
      else coalesce(v_customer.overdue_days, 0)
    end,
    due_date = case
      when v_customer.due_date is null or v_customer.due_date < v_due_date then v_due_date
      else v_customer.due_date
    end,
    unlock_until = v_effective_unlock_until,
    paygo_started_at = coalesce(v_customer.paygo_started_at, v_rollup_first_payment_at),
    paygo_first_payment_at = coalesce(v_customer.paygo_first_payment_at, v_rollup_first_payment_at),
    paygo_last_payment_at = v_rollup_last_payment_at,
    paygo_next_due_at = v_effective_unlock_until,
    paygo_usage_ends_at = v_effective_unlock_until,
    paygo_grace_until_at = v_effective_unlock_until + interval '72 hours',
    paygo_installments_paid = case
      when v_daily_installment > 0 then greatest(floor(v_rollup_paygo_paid / v_daily_installment)::integer, 0)
      else coalesce(v_customer.paygo_installments_paid, 0)
    end,
    paygo_total_installments = case
      when coalesce(v_total_payable, 0) > 0 and v_daily_installment > 0
        then greatest(ceil(v_total_payable / v_daily_installment)::integer, 1)
      else coalesce(v_customer.paygo_total_installments, 0)
    end,
    paygo_frequency_hours = coalesce(nullif(v_customer.paygo_frequency_hours, 0), 24),
    paygo_grace_period_hours = coalesce(nullif(v_customer.paygo_grace_period_hours, 0), 72),
    paygo_schedule_status = case
      when now() < v_effective_unlock_until then 'active'
      else 'locked'
    end,
    updated_at = now()
  where c.id = v_customer.id;

  raise notice 'Backfilled payment % for customer %; unlock_until = %', v_receipt, v_customer.id, v_effective_unlock_until;
end $$;

commit;
