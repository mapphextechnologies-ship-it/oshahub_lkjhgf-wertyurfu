export function normalizeProductScope(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (['phone', 'phones'].includes(normalized)) return 'phone';
  if (['bike', 'bikes', 'product', 'products'].includes(normalized)) return 'bike';
  return '';
}

export function matchesProductScope(value, scope) {
  const normalizedScope = normalizeProductScope(scope);
  if (!normalizedScope) return true;

  const normalizedValue = String(value || '').trim().toLowerCase();
  if (normalizedScope === 'phone') return normalizedValue === 'phone';
  return ['bike', 'product', ''].includes(normalizedValue);
}
