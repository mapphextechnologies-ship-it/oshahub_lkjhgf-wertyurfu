export function formatKes(value) {
  if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) {
    return 'No data yet';
  }

  return `KES ${new Intl.NumberFormat('en-KE', {
    maximumFractionDigits: 0
  }).format(Number(value))}`;
}
