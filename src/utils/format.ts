export function formatDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatMoney(value: FormDataEntryValue | number | null | undefined): string {
  if (value == null || value === '') return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('es', { style: 'currency', currency: 'EUR' }).format(n);
}

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}
