-- Immutable, versioned payment corrections. Run once on existing deployments.
alter table public.payments add column if not exists ledger_state text not null default 'active';
alter table public.payments add column if not exists revision_of text references public.payments(id) on delete restrict;
alter table public.payments add column if not exists revision_number integer not null default 1;
alter table public.payments add column if not exists correction_reason text;
alter table public.payments add column if not exists corrected_by uuid references auth.users(id) on delete set null;
alter table public.payments add column if not exists corrected_by_email text;
alter table public.payments add column if not exists corrected_at timestamptz;

alter table public.payments drop constraint if exists payments_ledger_state_check;
alter table public.payments add constraint payments_ledger_state_check
  check (ledger_state in ('active', 'superseded'));
alter table public.payments drop constraint if exists payments_revision_number_check;
alter table public.payments add constraint payments_revision_number_check check (revision_number >= 1);

create index if not exists idx_payments_active_customer
  on public.payments (customer_id, date)
  where ledger_state = 'active';
create index if not exists idx_payments_revision_of on public.payments (revision_of);

create or replace function public.correct_payment_financials(
  p_payment_id text,
  p_deposit_credit numeric,
  p_paygo_payment numeric,
  p_total_payable numeric,
  p_daily_installment numeric,
  p_status text,
  p_paid_at timestamptz,
  p_reason text,
  p_actor_user_id uuid,
  p_actor_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_original public.payments%rowtype;
  v_revision public.payments%rowtype;
  v_customer public.customers%rowtype;
  v_paid numeric(14,2);
  v_balance numeric(14,2);
  v_now timestamptz := now();
begin
  if coalesce(length(trim(p_reason)), 0) < 5 then
    raise exception 'A correction reason of at least 5 characters is required.' using errcode = '22023';
  end if;
  if coalesce(p_deposit_credit, 0) < 0 or coalesce(p_paygo_payment, 0) < 0 then
    raise exception 'Corrected payment amounts cannot be negative.' using errcode = '22023';
  end if;
  if coalesce(p_total_payable, 0) <= 0 or coalesce(p_daily_installment, 0) <= 0 then
    raise exception 'Total payable and daily installment must be greater than zero.' using errcode = '22023';
  end if;
  if lower(coalesce(p_status, '')) not in ('paid', 'completed', 'unpaid') then
    raise exception 'Invalid corrected payment status.' using errcode = '22023';
  end if;

  select * into v_original from public.payments where id = p_payment_id for update;
  if not found then raise exception 'Payment record was not found.' using errcode = 'P0002'; end if;
  if v_original.ledger_state <> 'active' then
    raise exception 'This payment revision is no longer active. Refresh and edit the latest revision.' using errcode = '40001';
  end if;

  if v_original.customer_id is not null then
    select * into v_customer from public.customers where id = v_original.customer_id for update;
  end if;

  insert into public.payments (
    customer_id, customer_name, customer_phone, product_type, product_model,
    agent_name, agent_id, bike_model, serial_number, chassis_number,
    total_payable, paid_amount, balance, daily_target, daily_installment, due_date,
    registration_status, payment_status, deposit_credit, paygo_payment, date,
    receipt, provider_reference, provider_transaction_id, provider_account_reference,
    provider_payer_phone, provider_payer_phone_raw, provider_paid_at,
    reconciliation_status, verified_at, verified_by, method, status, source_portal,
    ledger_state, revision_of, revision_number, correction_reason,
    corrected_by, corrected_by_email, corrected_at, created_at, updated_at
  ) values (
    v_original.customer_id, v_original.customer_name, v_original.customer_phone,
    v_original.product_type, v_original.product_model, v_original.agent_name,
    v_original.agent_id, v_original.bike_model, v_original.serial_number,
    v_original.chassis_number, p_total_payable,
    coalesce(p_deposit_credit, 0) + coalesce(p_paygo_payment, 0), 0,
    p_daily_installment, p_daily_installment, v_original.due_date,
    v_original.registration_status, p_status, coalesce(p_deposit_credit, 0),
    coalesce(p_paygo_payment, 0), coalesce(p_paid_at, v_original.date),
    null, null, null, v_original.provider_account_reference,
    v_original.provider_payer_phone, v_original.provider_payer_phone_raw,
    v_original.provider_paid_at, 'matched', v_original.verified_at,
    v_original.verified_by, 'adjustment', p_status, 'finance_correction',
    'active', coalesce(v_original.revision_of, v_original.id),
    v_original.revision_number + 1, trim(p_reason), p_actor_user_id,
    p_actor_email, v_now, v_now, v_now
  ) returning * into v_revision;

  update public.payments set
    ledger_state = 'superseded', corrected_by = p_actor_user_id,
    corrected_by_email = p_actor_email, corrected_at = v_now, updated_at = v_now
  where id = v_original.id;

  if v_original.customer_id is not null then
    select coalesce(sum(
      case when coalesce(deposit_credit, 0) + coalesce(paygo_payment, 0) > 0
        then coalesce(deposit_credit, 0) + coalesce(paygo_payment, 0)
        else coalesce(paid_amount, 0) end
    ), 0)
    into v_paid
    from public.payments
    where customer_id = v_original.customer_id
      and ledger_state = 'active'
      and lower(coalesce(status, payment_status, '')) in ('paid', 'completed', 'success');

    v_balance := greatest(p_total_payable - v_paid, 0);
    update public.customers set
      total_payable = p_total_payable, paid_amount = v_paid, balance = v_balance,
      daily_installment = p_daily_installment,
      paygo_total_installments = greatest(1, ceil(p_total_payable / p_daily_installment)::integer),
      status = case
        when status in ('next_of_kin_pending', 'pending_screening', 'info_required', 'rejected') then status
        when v_balance <= 0 then 'paid' else 'active' end,
      updated_at = v_now
    where id = v_original.customer_id returning * into v_customer;
  else
    v_paid := coalesce(p_deposit_credit, 0) + coalesce(p_paygo_payment, 0);
    v_balance := greatest(p_total_payable - v_paid, 0);
  end if;

  update public.payments set balance = v_balance where id = v_revision.id returning * into v_revision;

  insert into public.admin_audit_logs (
    actor_user_id, actor_email, action, target_table, target_id, source_portal, details
  ) values (
    p_actor_user_id, p_actor_email, 'payment_correction_created', 'payments', v_revision.id,
    'finance', jsonb_build_object(
      'originalPaymentId', v_original.id, 'revisionPaymentId', v_revision.id,
      'customerId', v_original.customer_id, 'reason', trim(p_reason),
      'before', jsonb_build_object('depositCredit', v_original.deposit_credit, 'paygoPayment', v_original.paygo_payment, 'status', v_original.status),
      'after', jsonb_build_object('depositCredit', v_revision.deposit_credit, 'paygoPayment', v_revision.paygo_payment, 'status', v_revision.status),
      'accountPaidAmount', v_paid, 'accountBalance', v_balance
    )
  );

  return jsonb_build_object(
    'payment', to_jsonb(v_revision), 'customer', case when v_customer.id is null then null else to_jsonb(v_customer) end,
    'replacedPaymentId', v_original.id
  );
end;
$$;

revoke all on function public.correct_payment_financials(text,numeric,numeric,numeric,numeric,text,timestamptz,text,uuid,text) from public, anon, authenticated;
grant execute on function public.correct_payment_financials(text,numeric,numeric,numeric,numeric,text,timestamptz,text,uuid,text) to service_role;

create or replace function public.correct_payment_financials_v2(
  p_payment_id text,
  p_deposit_credit numeric,
  p_paygo_payment numeric,
  p_total_payable numeric,
  p_balance numeric,
  p_daily_installment numeric,
  p_status text,
  p_paid_at timestamptz,
  p_reason text,
  p_actor_user_id uuid,
  p_actor_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_revision public.payments%rowtype;
  v_customer public.customers%rowtype;
  v_ledger_paid numeric(14,2);
  v_target_paid numeric(14,2);
  v_adjustment numeric(14,2);
  v_now timestamptz := now();
begin
  if p_balance is null or p_balance < 0 or p_balance > p_total_payable then
    raise exception 'Balance must be between zero and total payable.' using errcode = '22023';
  end if;

  v_result := public.correct_payment_financials(
    p_payment_id, p_deposit_credit, p_paygo_payment, p_total_payable,
    p_daily_installment, p_status, p_paid_at,
    coalesce(nullif(trim(p_reason), ''), 'Finance portal payment correction'),
    p_actor_user_id, p_actor_email
  );

  select * into v_revision
  from public.payments
  where id = v_result->'payment'->>'id'
  for update;

  if v_revision.customer_id is not null then
    select * into v_customer
    from public.customers
    where id = v_revision.customer_id
    for update;

    select coalesce(sum(
      case when coalesce(deposit_credit, 0) + coalesce(paygo_payment, 0) > 0
        then coalesce(deposit_credit, 0) + coalesce(paygo_payment, 0)
        else coalesce(paid_amount, 0) end
    ), 0)
    into v_ledger_paid
    from public.payments
    where customer_id = v_revision.customer_id
      and ledger_state = 'active'
      and lower(coalesce(status, payment_status, '')) in ('paid', 'completed', 'success');

    v_target_paid := p_total_payable - p_balance;
    v_adjustment := v_target_paid - v_ledger_paid;

    if abs(v_adjustment) > 0.005 then
      insert into public.payments (
        customer_id, customer_name, customer_phone, product_type, product_model,
        agent_name, agent_id, bike_model, serial_number, chassis_number,
        total_payable, paid_amount, balance, daily_target, daily_installment, due_date,
        registration_status, payment_status, deposit_credit, paygo_payment, date,
        provider_account_reference, provider_payer_phone, provider_payer_phone_raw,
        reconciliation_status, method, status, source_portal, ledger_state,
        revision_number, correction_reason, corrected_by, corrected_by_email,
        corrected_at, created_at, updated_at
      ) values (
        v_revision.customer_id, v_revision.customer_name, v_revision.customer_phone,
        v_revision.product_type, v_revision.product_model, v_revision.agent_name,
        v_revision.agent_id, v_revision.bike_model, v_revision.serial_number,
        v_revision.chassis_number, p_total_payable, v_adjustment, p_balance,
        p_daily_installment, p_daily_installment, v_revision.due_date,
        v_revision.registration_status, 'paid', 0, 0, v_now,
        v_revision.provider_account_reference, v_revision.provider_payer_phone,
        v_revision.provider_payer_phone_raw, 'matched', 'adjustment', 'paid',
        'finance_balance_adjustment', 'active', 1,
        'Automatic ledger adjustment for finance balance override',
        p_actor_user_id, p_actor_email, v_now, v_now, v_now
      );
    end if;

    update public.customers set
      total_payable = p_total_payable,
      paid_amount = v_target_paid,
      balance = p_balance,
      daily_installment = p_daily_installment,
      paygo_total_installments = greatest(1, ceil(p_total_payable / p_daily_installment)::integer),
      status = case
        when status in ('next_of_kin_pending', 'pending_screening', 'info_required', 'rejected') then status
        when p_balance <= 0 then 'paid' else 'active' end,
      updated_at = v_now
    where id = v_revision.customer_id
    returning * into v_customer;

    update public.payments set balance = p_balance, updated_at = v_now
    where id = v_revision.id returning * into v_revision;
  end if;

  return jsonb_build_object(
    'payment', to_jsonb(v_revision),
    'customer', case when v_customer.id is null then null else to_jsonb(v_customer) end,
    'replacedPaymentId', v_result->>'replacedPaymentId'
  );
end;
$$;

revoke all on function public.correct_payment_financials_v2(text,numeric,numeric,numeric,numeric,numeric,text,timestamptz,text,uuid,text) from public, anon, authenticated;
grant execute on function public.correct_payment_financials_v2(text,numeric,numeric,numeric,numeric,numeric,text,timestamptz,text,uuid,text) to service_role;
