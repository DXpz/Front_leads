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

export function renderHistoryTable(
  tbody: HTMLElement,
  rows: readonly StageEntry[],
  rowCountEl: HTMLElement,
  emptyHintEl: HTMLElement,
): void {
  rowCountEl.textContent = `${rows.length} registro${rows.length !== 1 ? 's' : ''}`;
  emptyHintEl.classList.toggle('hidden', rows.length > 0);

  tbody.innerHTML = rows
    .map((r, i) => {
      const stage = stageById(r.stageId) ?? { label: r.stageId };
      const s = r.snapshot;
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
