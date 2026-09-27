const DAY_MS = 24 * 60 * 60 * 1000;

function dateKeyFromUtcTimestamp(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function recordDateKey(value) {
  const text = String(value || '').trim();
  const isoDate = text.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (isoDate) return isoDate;

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

function appendUnique(target, values) {
  for (const value of Array.isArray(values) ? values : []) {
    if (value && !target.includes(value)) target.push(value);
  }
}

export function buildLastSevenDayCollectionTrend(records = [], now = new Date()) {
  const current = now instanceof Date ? now : new Date(now);
  const endTimestamp = Number.isNaN(current.getTime())
    ? Date.now()
    : Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate());
  const dates = Array.from({ length: 7 }, (_, index) =>
    dateKeyFromUtcTimestamp(endTimestamp - ((6 - index) * DAY_MS))
  );
  const buckets = new Map(dates.map((date) => [date, {
    date,
    amount: 0,
    records: 0,
    customers: [],
    accounts: []
  }]));

  for (const record of Array.isArray(records) ? records : []) {
    const date = recordDateKey(record?.date);
    const bucket = buckets.get(date);
    if (!bucket) continue;

    const amount = Number(record.amount || 0);
    const recordCount = Number(record.records || 0);
    bucket.amount += Number.isFinite(amount) ? amount : 0;
    bucket.records += Number.isFinite(recordCount) ? recordCount : 0;
    appendUnique(bucket.customers, record.customers);
    appendUnique(bucket.accounts, record.accounts);
  }

  return dates.map((date) => buckets.get(date));
}
