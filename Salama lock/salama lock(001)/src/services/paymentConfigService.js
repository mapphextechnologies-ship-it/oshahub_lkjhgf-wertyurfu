const buildTimePaybillNumber = String(
  import.meta.env.VITE_PAYBILL_NUMBER ||
  import.meta.env.VITE_DARAJA_C2B_SHORT_CODE ||
  ''
).trim();

export const defaultPaymentConfig = {
  paybillNumber: buildTimePaybillNumber,
  accountReferenceLabel: 'National ID',
  paybillNote: 'Works for payments from any M-PESA line.'
};
