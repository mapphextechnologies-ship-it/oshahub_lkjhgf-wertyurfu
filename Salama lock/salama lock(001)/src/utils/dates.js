export function formatDate(value) {
  return new Intl.DateTimeFormat('en-KE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(new Date(value));
}

export function formatShortDate(value) {
  return new Intl.DateTimeFormat('en-KE', {
    day: '2-digit',
    month: 'short'
  }).format(new Date(value));
}
