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

/** ISO datetime de la API → valor para input type=date (componentes en hora local). */
export function isoDatetimeToDateInputValue(iso: string | null | undefined): string {
  if (!iso || typeof iso !== 'string') return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
