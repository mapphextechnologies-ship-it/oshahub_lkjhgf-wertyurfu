function toNumberValue(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function pick(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return '';
}

export function normalizeCustomerRecord(customer = {}) {
  return {
    id: customer.id,
    customerName: customer.customerName ?? customer.customer_name ?? customer.name ?? '',
    customerPhone: customer.customerPhone ?? customer.customer_phone ?? customer.phone ?? '',
    nationalId: customer.nationalId ?? customer.national_id ?? '',
    email: customer.email ?? '',
    dateOfBirth: customer.dateOfBirth ?? customer.date_of_birth ?? '',
    gender: customer.gender ?? '',
    location: customer.location ?? '',
    occupation: customer.occupation ?? '',
    agentId: customer.agentId ?? customer.agent_id ?? '',
    agentName: customer.agentName ?? customer.agent_name ?? '',
    productType: customer.productType ?? customer.product_type ?? 'product',
    productModel: customer.productModel ?? customer.product_model ?? customer.bikeModel ?? customer.bike_model ?? '',
    bikeModel: customer.bikeModel ?? customer.bike_model ?? customer.productModel ?? customer.product_model ?? '',
    chassisNumber: customer.chassisNumber ?? customer.chassis_number ?? '',
    serialNumber: customer.serialNumber ?? customer.serial_number ?? customer.chassisNumber ?? customer.chassis_number ?? '',
    totalPayable: toNumberValue(customer.totalPayable ?? customer.total_payable, 0),
    paidAmount: toNumberValue(customer.paidAmount ?? customer.paid_amount, 0),
    balance: toNumberValue(customer.balance, 0),
    dailyInstallment: toNumberValue(customer.dailyInstallment ?? customer.daily_installment, 0),
    dueDate: customer.dueDate ?? customer.due_date ?? '',
    lastPaymentDate: customer.lastPaymentDate ?? customer.last_payment_date ?? '',
    unlockUntil: customer.unlockUntil ?? customer.unlock_until ?? '',
    paygoScheduleStatus: customer.paygoScheduleStatus ?? customer.paygo_schedule_status ?? '',
    applicationStatus: customer.applicationStatus ?? customer.application_status ?? customer.status ?? 'active',
    repaymentStatus: customer.repaymentStatus ?? customer.status ?? 'active',
    overdueDays: toNumberValue(customer.overdueDays ?? customer.overdue_days, 0),
    overdueAmount: toNumberValue(customer.overdueAmount ?? customer.overdue_amount, 0),
    registrationStatus: customer.registrationStatus ?? customer.registration_status ?? customer.status ?? 'active',
    nextOfKin: customer.nextOfKin ?? {
      name: customer.next_of_kin_name ?? '',
      phone: customer.next_of_kin_phone ?? '',
      relationship: customer.next_of_kin_relationship ?? '',
      nationalId: customer.next_of_kin_national_id ?? '',
      gender: customer.next_of_kin_gender ?? '',
      location: customer.next_of_kin_location ?? '',
      occupation: customer.next_of_kin_occupation ?? ''
    },
    createdAt: customer.createdAt ?? customer.created_at ?? ''
  };
}

export function normalizeProductRecord(product = {}) {
  const productType = String(product.productType ?? product.product_type ?? product.type ?? 'product').toLowerCase() || 'product';
  const imei1 = product.imei1 ?? product.imei_1 ?? '';
  const imei2 = product.imei2 ?? product.imei_2 ?? '';
  const serialNumber = pick(imei1, product.serialNumber, product.serial_number);
  const chassisNumber = pick(imei2, product.chassisNumber, product.chassis_number);
  const isPhone = productType === 'phone';

  return {
    id: product.id,
    productType,
    productModel: product.productModel ?? product.product_model ?? product.model ?? '',
    totalPayable: toNumberValue(product.totalPayable ?? product.total_payable, 0),
    imageUrl: product.imageUrl ?? product.image_url ?? '',
    serialNumber: isPhone
      ? serialNumber
      : (product.serialNumber ?? product.serial_number ?? ''),
    chassisNumber: isPhone
      ? chassisNumber
      : (product.chassisNumber ?? product.chassis_number ?? ''),
    imei1: isPhone ? imei1 : '',
    imei2: isPhone ? imei2 : '',
    lockerId: isPhone ? (product.lockerId ?? product.locker_id ?? serialNumber) : '',
    lockerProvider: isPhone ? (product.lockerProvider ?? product.locker_provider ?? '') : '',
    providerState: isPhone ? (product.providerState ?? product.provider_state ?? product.honorDeviceState ?? product.deviceState ?? product.device_state ?? '') : '',
    providerLockStatus: isPhone ? (product.providerLockStatus ?? product.provider_lock_status ?? product.finalDeviceState ?? product.final_device_state ?? product.lockStatus ?? product.lock_status ?? product.honorLockStatus ?? product.honor_lock_status ?? '') : '',
    providerTaskId: isPhone ? (product.providerTaskId ?? product.provider_task_id ?? product.honorTaskId ?? product.honor_task_id ?? '') : '',
    providerRequestId: isPhone ? (product.providerRequestId ?? product.provider_request_id ?? '') : '',
    providerResponse: isPhone ? (product.providerResponse ?? product.provider_response ?? product.honorLastResponse ?? product.honor_last_response ?? null) : null,
    providerErrorCode: isPhone ? (product.providerErrorCode ?? product.provider_error_code ?? '') : '',
    providerErrorMessage: isPhone ? (product.providerErrorMessage ?? product.provider_error_message ?? '') : '',
    syncStatus: isPhone ? (product.syncStatus ?? product.sync_status ?? product.lockerSyncStatus ?? product.locker_sync_status ?? '') : '',
    commandStatus: isPhone ? (product.commandStatus ?? product.command_status ?? '') : '',
    lastProviderSyncAt: isPhone ? (product.lastProviderSyncAt ?? product.last_provider_sync_at ?? product.lockerLastSyncedAt ?? product.locker_last_synced_at ?? null) : null,
    lastCommandAt: isPhone ? (product.lastCommandAt ?? product.last_command_at ?? product.lockerLastRequestAt ?? product.locker_last_request_at ?? null) : null,
    lastVerifiedAt: isPhone ? (product.lastVerifiedAt ?? product.last_verified_at ?? null) : null,
    unlockUntilAt: isPhone ? (product.unlockUntilAt ?? product.unlock_until_at ?? '') : '',
    finalDeviceState: isPhone ? (product.finalDeviceState ?? product.final_device_state ?? product.providerLockStatus ?? product.provider_lock_status ?? product.lockStatus ?? product.lock_status ?? product.honorLockStatus ?? product.honor_lock_status ?? '') : '',
    honorTaskId: isPhone ? (product.honorTaskId ?? product.honor_task_id ?? '') : '',
    lockStatus: isPhone ? (product.providerLockStatus ?? product.provider_lock_status ?? product.finalDeviceState ?? product.final_device_state ?? product.lockStatus ?? product.lock_status ?? product.honorLockStatus ?? product.honor_lock_status ?? '') : '',
    honorLockStatus: isPhone ? (product.providerLockStatus ?? product.provider_lock_status ?? product.honorLockStatus ?? product.honor_lock_status ?? '') : '',
    honorDeviceState: isPhone ? (product.providerLockStatus ?? product.provider_lock_status ?? product.finalDeviceState ?? product.final_device_state ?? product.honorDeviceState ?? product.deviceState ?? product.device_state ?? product.honorLockStatus ?? product.honor_lock_status ?? product.lockStatus ?? product.lock_status ?? '') : '',
    honorLastResponse: isPhone ? (product.honorLastResponse ?? product.honor_last_response ?? null) : null,
    lockerSyncStatus: isPhone ? (product.lockerSyncStatus ?? product.locker_sync_status ?? '') : '',
    lockerLastSyncedAt: isPhone ? (product.lockerLastSyncedAt ?? product.locker_last_synced_at ?? null) : null,
    lockerLastError: isPhone ? (product.lockerLastError ?? product.locker_last_error ?? '') : '',
    lockerLastRequestAt: isPhone ? (product.lockerLastRequestAt ?? product.locker_last_request_at ?? null) : null,
    lastLockRequestAt: isPhone ? (product.lastLockRequestAt ?? product.last_lock_request_at ?? product.lockerLastRequestAt ?? product.locker_last_request_at ?? null) : null,
    lockReason: isPhone ? (product.lockReason ?? product.lock_reason ?? '') : '',
    lockedAt: isPhone ? (product.lockedAt ?? product.locked_at ?? null) : null,
    unlockedAt: isPhone ? (product.unlockedAt ?? product.unlocked_at ?? null) : null,
    lastSyncAt: isPhone ? (product.lastSyncAt ?? product.last_sync_at ?? null) : null,
    branch: product.branch ?? '',
    status: product.status ?? 'available',
    assignedCustomerId: product.assignedCustomerId ?? product.assigned_customer_id ?? null,
    assignedAgentId: product.assignedAgentId ?? product.assigned_agent_id ?? null,
    assignedAgentCode: product.assignedAgentCode ?? product.assigned_agent_code ?? null,
    storageGb: product.storageGb ?? product.storage_gb ?? null,
    ramGb: product.ramGb ?? product.ram_gb ?? null,
    color: product.color ?? '',
    simSlotCount: product.simSlotCount ?? product.sim_slot_count ?? null,
    engineNumber: product.engineNumber ?? product.engine_number ?? '',
    frameNumber: product.frameNumber ?? product.frame_number ?? '',
    registrationNumber: product.registrationNumber ?? product.registration_number ?? '',
    trackerId: product.trackerId ?? product.tracker_id ?? '',
    odometerKm: product.odometerKm ?? product.odometer_km ?? 0,
    serviceDueDate: product.serviceDueDate ?? product.service_due_date ?? null,
    mechanicalStatus: product.mechanicalStatus ?? product.mechanical_status ?? '',
    createdAt: product.createdAt ?? product.created_at ?? ''
  };
}

export function normalizePaymentRecord(payment = {}) {
  const normalized = {
    id: payment.id,
    customerId: payment.customerId ?? payment.customer_id ?? '',
    customerName: payment.customerName ?? payment.customer_name ?? payment.name ?? '',
    customerPhone: payment.customerPhone ?? payment.customer_phone ?? payment.phone ?? '',
    agentName: payment.agentName ?? payment.agent_name ?? '',
    agentId: payment.agentId ?? payment.agent_id ?? payment.agentCode ?? payment.agent_code ?? '',
    agentCode: payment.agentCode ?? payment.agent_code ?? payment.agentId ?? payment.agent_id ?? '',
    bikeModel: payment.bikeModel ?? payment.bike_model ?? payment.productModel ?? payment.product_model ?? '',
    productType: payment.productType ?? payment.product_type ?? 'product',
    productModel: payment.productModel ?? payment.product_model ?? payment.bikeModel ?? payment.bike_model ?? '',
    chassisNumber: payment.chassisNumber ?? payment.chassis_number ?? '',
    serialNumber: payment.serialNumber ?? payment.serial_number ?? payment.chassisNumber ?? payment.chassis_number ?? '',
    totalPayable: toNumberValue(payment.totalPayable ?? payment.total_payable, 0),
    paidAmount: toNumberValue(payment.paidAmount ?? payment.paid_amount, 0),
    customerPaidAmount: toNumberValue(payment.customerPaidAmount ?? payment.customer_paid_amount, 0),
    amount: toNumberValue(payment.amount ?? payment.totalAmount ?? payment.total_amount ?? payment.paidAmount ?? payment.paid_amount, 0),
    balance: toNumberValue(payment.balance, 0),
    dueDate: payment.dueDate ?? payment.due_date ?? null,
    lastPaymentDate: payment.lastPaymentDate ?? payment.last_payment_date ?? null,
    registrationStatus: payment.registrationStatus ?? payment.registration_status ?? 'registered',
    depositCredit: toNumberValue(payment.depositCredit ?? payment.deposit_credit, 0),
    paygoPayment: toNumberValue(payment.paygoPayment ?? payment.paygo_payment, 0),
    dailyTarget: toNumberValue(payment.dailyTarget ?? payment.daily_target ?? payment.dailyInstallment ?? payment.daily_installment, 0),
    dailyInstallment: toNumberValue(payment.dailyInstallment ?? payment.daily_installment ?? payment.dailyTarget ?? payment.daily_target, 0),
    date: payment.date ?? payment.createdAt ?? payment.created_at ?? '',
    receipt: payment.receipt ?? payment.receiptNumber ?? payment.receipt_number ?? '',
    providerReference: payment.providerReference ?? payment.provider_reference ?? '',
    providerTransactionId: payment.providerTransactionId ?? payment.provider_transaction_id ?? '',
    providerAccountReference: payment.providerAccountReference ?? payment.provider_account_reference ?? '',
    providerPayerPhone: payment.providerPayerPhone ?? payment.provider_payer_phone ?? '',
    providerPaidAt: payment.providerPaidAt ?? payment.provider_paid_at ?? null,
    method: payment.method ?? '',
    status: String(payment.status ?? '').toLowerCase() === 'paid' || String(payment.status ?? '').toLowerCase() === 'completed' || String(payment.status ?? '').toLowerCase() === 'success'
      ? 'success'
      : (payment.status ?? 'pending'),
    overdueDays: toNumberValue(payment.overdueDays ?? payment.overdue_days, 0),
    overdueAmount: toNumberValue(payment.overdueAmount ?? payment.overdue_amount, 0),
    paygoState: payment.paygoState ?? payment.paygo_state ?? '',
    repaymentStatus: payment.repaymentStatus ?? payment.repayment_status ?? payment.customerStatus ?? payment.customer_status ?? '',
    followUp: payment.followUp ?? payment.follow_up ?? '',
    sourcePortal: payment.sourcePortal ?? payment.source_portal ?? ''
  };

  return normalized;
}

export function normalizeAgentRecord(agent = {}) {
  return {
    id: agent.id,
    code: agent.code ?? agent.agentCode ?? agent.agent_code ?? agent.id ?? '',
    name: agent.name ?? agent.full_name ?? agent.agent_name ?? '',
    nationalId: agent.nationalId ?? agent.national_id ?? '',
    phone: agent.phone ?? '',
    email: agent.email ?? '',
    role: agent.role ?? 'field_agent',
    region: agent.region ?? '',
    status: agent.status ?? 'active',
    totalCustomers: toNumberValue(agent.totalCustomers ?? agent.total_customers, 0),
    commissionBalance: toNumberValue(agent.commissionBalance ?? agent.commission_balance, 0)
  };
}
