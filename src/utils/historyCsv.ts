import { stageById } from '../stages';
import type { OpportunityForm, StageEntry } from '../types';
import { formatDate, formatMoney } from './format';

function csvCell(value: string): string {
  const s = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function docPlain(s: OpportunityForm): string {
  const c = s.relatedDocClass.trim();
  const n = s.relatedDocNumber.trim();
  if (!c && !n) return '';
  if (c && n) return `${c} / ${n}`;
  return c || n;
}

function pctPlain(v: number | ''): string {
  if (v === '' || v === undefined) return '';
  return `${v}%`;
}

function clientPlain(s: OpportunityForm): string {
  return [s.clientName, s.clientEmail, s.clientPhone].filter(Boolean).join(' | ');
}

const HEADERS = [
  '#',
  'Nº oportunidad',
  'Etapa',
  'Enviado',
  'Cliente',
  'Vendedor',
  'Inicio',
  'Cierre',
  '% cierre',
  'Monto potencial',
  'Documento',
  'Observaciones',
] as const;

/** CSV (UTF-8 con BOM para Excel) del mismo criterio que la tabla del historial. */
export function historyRowsToCsv(rows: readonly StageEntry[]): string {
  const lines: string[] = [HEADERS.map((h) => csvCell(h)).join(';')];
  rows.forEach((r, i) => {
    const stage = stageById(r.stageId) ?? { label: r.stageId };
    const s = r.snapshot;
    const submitted = new Date(r.createdAt).toLocaleString('es', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    const cells = [
      String(i + 1),
      (s.opportunityNumber ?? '').trim(),
      stage.label,
      submitted,
      clientPlain(s),
      s.sellerName.trim(),
      formatDate(s.opportunityStartDate),
      formatDate(s.opportunityClosingDate),
      pctPlain(s.closingPercent),
      formatMoney(s.potentialAmount === '' ? null : s.potentialAmount),
      docPlain(s),
      (s.notes ?? '').trim(),
    ];
    lines.push(cells.map(csvCell).join(';'));
  });
  return lines.join('\r\n');
}

export function downloadHistoryCsv(rows: readonly StageEntry[], searchQuery: string): void {
  if (rows.length === 0) return;
  const csv = historyRowsToCsv(rows);
  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const q = searchQuery.trim().replace(/[^\w.-]+/g, '-').slice(0, 40) || 'busqueda';
  a.download = `historial-${q}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
