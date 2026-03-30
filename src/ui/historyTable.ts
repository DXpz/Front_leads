import { stageById } from '../stages';
import type { OpportunityForm, StageEntry } from '../types';
import { formatDate, formatMoney } from '../utils/format';
import { escapeHtml } from '../utils/escapeHtml';

function formatDoc(s: OpportunityForm): string {
  const c = s.relatedDocClass.trim();
  const n = s.relatedDocNumber.trim();
  if (!c && !n) return '—';
  if (c && n) return `${escapeHtml(c)} / ${escapeHtml(n)}`;
  return escapeHtml(c || n);
}

function formatPercent(v: number | ''): string {
  if (v === '' || v === undefined) return '—';
  return `${escapeHtml(String(v))}%`;
}

/** Coincidencia como GET /api/history: substring en nº oportunidad o igualdad en clientId. */
export function filterHistoryByOpportunityNumber(rows: readonly StageEntry[], rawQuery: string): StageEntry[] {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return [...rows];
  return rows.filter((r) => {
    const on = (r.snapshot.opportunityNumber ?? '').trim().toLowerCase();
    const cid = (r.snapshot.clientId ?? '').trim().toLowerCase();
    if (on.includes(q)) return true;
    if (cid === q || on === q) return true;
    return false;
  });
}

export type HistoryTableRenderOpts = {
  /** Total de filas en historial antes de filtrar (para el texto del contador). */
  totalUnfiltered: number;
  /** Si hay texto de búsqueda activo (aunque esté vacío tras trim). */
  filterActive: boolean;
  /** Sin búsqueda: no se listan filas hasta que el usuario escriba un nº de oportunidad. */
  idleAwaitingSearch?: boolean;
};

export function renderHistoryTable(
  tbody: HTMLElement,
  rows: readonly StageEntry[],
  rowCountEl: HTMLElement,
  emptyHintEl: HTMLElement,
  opts?: HistoryTableRenderOpts,
): void {
  if (opts?.idleAwaitingSearch) {
    rowCountEl.textContent = '—';
    emptyHintEl.classList.remove('hidden');
    emptyHintEl.textContent =
      'Escribe un número de oportunidad para ver el historial guardado en la base de datos.';
    tbody.innerHTML = '';
    return;
  }

  const total = opts?.totalUnfiltered ?? rows.length;
  const filtered = rows.length;
  const filterOn = Boolean(opts?.filterActive);

  if (filterOn && total > 0) {
    rowCountEl.textContent = `${filtered} de ${total} registro${total !== 1 ? 's' : ''}`;
  } else {
    rowCountEl.textContent = `${rows.length} registro${rows.length !== 1 ? 's' : ''}`;
  }

  emptyHintEl.classList.toggle('hidden', rows.length > 0);
  if (rows.length === 0) {
    emptyHintEl.textContent =
      total === 0
        ? 'Sin registros.'
        : filterOn
          ? 'Ningún envío coincide con ese número de oportunidad.'
          : 'Sin registros.';
  }

  tbody.innerHTML = rows
    .map((r, i) => {
      const stage = stageById(r.stageId) ?? { label: r.stageId };
      const s = r.snapshot;
      const oppNum = (s.opportunityNumber ?? '').trim();
      const safeNotes = escapeHtml(s.notes);
      const shortNotes = safeNotes.length > 60 ? `${safeNotes.slice(0, 60)}…` : safeNotes;
      const submitted = new Date(r.createdAt).toLocaleString('es', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      const clientLine = [escapeHtml(s.clientName), escapeHtml(s.clientEmail), escapeHtml(s.clientPhone)]
        .filter(Boolean)
        .join(' · ');
      return `
        <tr class="animate-row-in border-b-2 border-ink-200 hover:bg-ink-100">
          <td class="px-2 py-2 font-medium text-ink-500 sm:px-3 sm:py-3">${i + 1}</td>
          <td class="px-2 py-2 font-mono text-xs font-semibold text-ink-800 sm:px-3 sm:py-3">${oppNum ? escapeHtml(oppNum) : '—'}</td>
          <td class="px-2 py-2 font-semibold text-ink-900 sm:px-3 sm:py-3">${escapeHtml(stage.label)}</td>
          <td class="px-2 py-2 text-ink-600 text-xs whitespace-nowrap sm:px-3 sm:py-3">${escapeHtml(submitted)}</td>
          <td class="px-2 py-2 text-ink-700 max-w-[200px] text-xs sm:px-3 sm:py-3" title="${clientLine}">${clientLine || '—'}</td>
          <td class="px-2 py-2 text-ink-700 sm:px-3 sm:py-3">${escapeHtml(s.sellerName) || '—'}</td>
          <td class="px-2 py-2 text-ink-700 sm:px-3 sm:py-3">${formatDate(s.opportunityStartDate)}</td>
          <td class="px-2 py-2 text-ink-700 sm:px-3 sm:py-3">${formatDate(s.opportunityClosingDate)}</td>
          <td class="px-2 py-2 sm:px-3 sm:py-3">${formatPercent(s.closingPercent)}</td>
          <td class="px-2 py-2 font-medium text-ink-800 sm:px-3 sm:py-3">${formatMoney(s.potentialAmount === '' ? null : s.potentialAmount)}</td>
          <td class="px-2 py-2 text-ink-700 text-xs max-w-[140px] sm:px-3 sm:py-3">${formatDoc(s)}</td>
          <td class="px-2 py-2 max-w-[200px] text-ink-600 text-xs sm:px-3 sm:py-3" title="${safeNotes}">${shortNotes || '—'}</td>
        </tr>`;
    })
    .join('');
}
