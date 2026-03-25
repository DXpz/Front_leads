import { STAGES, STAGE_COUNT } from './stages';
import type { AppState, OpportunityForm, StageEntry } from './types';
import { emptySnapshot, normalizeHistoryRow } from './migrate';
import { loadState, saveState } from './store';
import { apiUrl } from './api';
import { todayIsoDate } from './utils/format';
import { downloadHistoryCsv } from './utils/historyCsv';
import { renderStepper, stepIndexFromTarget } from './ui/stepper';
import { filterHistoryByOpportunityNumber, renderHistoryTable } from './ui/historyTable';
import {
  queryOpportunityFormElements,
  readOpportunityForm,
  updateClosingPercentBar,
  writeOpportunityForm,
  type OpportunityFormElements,
} from './opportunityForm';

function stageAutoClosingPercent(stageIndex: number): number {
  // 5 etapas: 20/40/60/80/100
  const pct = (stageIndex + 1) * 20;
  return Math.min(100, Math.max(0, pct));
}

function syncClosingPercentToStage(els: Elements, stageIndex: number): void {
  els.form.closingPercent.value = String(stageAutoClosingPercent(stageIndex));
  updateClosingPercentBar(els.form);
}

type Elements = {
  stepper: HTMLElement;
  stageTitle: HTMLElement;
  stageBadge: HTMLElement;
  leadForm: HTMLFormElement;
  leadGrid: HTMLElement;
  clientPanel: HTMLDetailsElement;
  leftStack: HTMLElement;
  obsBlock: HTMLElement;
  form: OpportunityFormElements;
  historyBody: HTMLElement;
  rowCount: HTMLElement;
  emptyHint: HTMLElement;
  advanceNext: HTMLInputElement;
  btnExport: HTMLButtonElement;
  btnReset: HTMLButtonElement;
  historyOpportunitySearch: HTMLInputElement;
  btnExportHistoryCsv: HTMLButtonElement;
  btnOpenActivities: HTMLButtonElement;
  activitiesModal: HTMLElement;
  btnCloseActivities: HTMLButtonElement;
  btnCancelActivity: HTMLButtonElement;
  activitiesForm: HTMLFormElement;
  activitiesSubtitle: HTMLElement;
  activitiesList: HTMLElement;
  activitiesEmpty: HTMLElement;
  activityTitle: HTMLInputElement;
  activityDatetime: HTMLInputElement;
  activityNotes: HTMLTextAreaElement;
  submitStatus: HTMLElement;
};

function queryElements(): Elements {
  const q = <T extends HTMLElement>(id: string) => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Missing #${id}`);
    return el as T;
  };
  return {
    stepper: q('stepper'),
    stageTitle: q('stage-title'),
    stageBadge: q('stage-badge'),
    leadForm: q<HTMLFormElement>('lead-form'),
    leadGrid: q('lead-grid'),
    clientPanel: q<HTMLDetailsElement>('client-panel'),
    leftStack: q('left-stack'),
    obsBlock: q('obs-block'),
    form: queryOpportunityFormElements(),
    historyBody: q('history-body'),
    rowCount: q('row-count'),
    emptyHint: q('empty-hint'),
    advanceNext: q<HTMLInputElement>('advance-next'),
    btnExport: q<HTMLButtonElement>('btn-export'),
    btnReset: q<HTMLButtonElement>('btn-reset'),
    historyOpportunitySearch: q<HTMLInputElement>('history-opportunity-search'),
    btnExportHistoryCsv: q<HTMLButtonElement>('btn-export-history-csv'),
    btnOpenActivities: q<HTMLButtonElement>('btn-open-activities'),
    activitiesModal: q('activities-modal'),
    btnCloseActivities: q<HTMLButtonElement>('btn-close-activities'),
    btnCancelActivity: q<HTMLButtonElement>('btn-cancel-activity'),
    activitiesForm: q<HTMLFormElement>('activities-form'),
    activitiesSubtitle: q('activities-subtitle'),
    activitiesList: q('activities-list'),
    activitiesEmpty: q('activities-empty'),
    activityTitle: q<HTMLInputElement>('activity-title'),
    activityDatetime: q<HTMLInputElement>('activity-datetime'),
    activityNotes: q<HTMLTextAreaElement>('activity-notes'),
    submitStatus: q('submit-status'),
  };
}

function persistDraft(els: Elements, state: AppState): AppState {
  const next: AppState = {
    ...state,
    draft: readOpportunityForm(els.form),
  };
  saveState(next);
  return next;
}

type OpportunityDirectory = {
  opportunityNumber: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  sellerName: string;
  updatedAt: string;
};

let opportunityLookupTimer: ReturnType<typeof setTimeout> | null = null;
let opportunityLookupLastKey = '';
let opportunityAutoNumberTimer: ReturnType<typeof setTimeout> | null = null;
let opportunityAutoNumberInFlight = false;

function fillIfEmpty(input: HTMLInputElement, value: string): void {
  if (input.value.trim() !== '') return;
  if (!value.trim()) return;
  input.value = value;
}

async function lookupOpportunityAndFill(els: Elements): Promise<void> {
  const key = els.form.opportunityNumber.value.trim();
  if (!key) return;
  if (key === opportunityLookupLastKey) return;
  opportunityLookupLastKey = key;

  try {
    const r = await fetch(apiUrl(`/api/opportunity?number=${encodeURIComponent(key)}`));
    if (!r.ok) return;
    const d = (await r.json()) as OpportunityDirectory;
    if (!d || typeof d !== 'object') return;
    fillIfEmpty(els.form.clientName, d.clientName ?? '');
    fillIfEmpty(els.form.clientEmail, d.clientEmail ?? '');
    fillIfEmpty(els.form.clientPhone, d.clientPhone ?? '');
    fillIfEmpty(els.form.sellerName, d.sellerName ?? '');
  } catch {
    /* ignore */
  }
}

async function assignOpportunityNumberIfMissing(els: Elements): Promise<void> {
  if (opportunityAutoNumberInFlight) return;
  if (els.form.opportunityNumber.value.trim()) return;
  // Si aún no hay nombre de oportunidad, no asignamos número.
  if (!els.form.opportunityName.value.trim()) return;
  opportunityAutoNumberInFlight = true;
  try {
    const r = await fetch('/api/opportunity/next-number');
    if (!r.ok) return;
    const data = (await r.json()) as { opportunityNumber?: string };
    const n = String(data?.opportunityNumber ?? '').trim();
    if (!n) return;
    if (!els.form.opportunityNumber.value.trim()) {
      els.form.opportunityNumber.value = n;
    }
  } finally {
    opportunityAutoNumberInFlight = false;
  }
}

type ActivityDto = {
  id: string;
  opportunity_number: string;
  title: string;
  scheduled_at: string;
  notes: string;
  created_at: string;
};

function openActivitiesModal(els: Elements): void {
  els.activitiesModal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeActivitiesModal(els: Elements): void {
  els.activitiesModal.classList.add('hidden');
  document.body.style.overflow = '';
}

function isoFromDatetimeLocal(v: string): string {
  // datetime-local no incluye zona; lo tratamos como local y lo enviamos como ISO.
  const d = new Date(v);
  return d.toISOString();
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('es', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

async function refreshActivities(els: Elements): Promise<void> {
  const num = els.form.opportunityNumber.value.trim();
  if (!num) {
    els.form.openActivitiesCount.value = '';
    els.activitiesList.innerHTML = '';
    els.activitiesEmpty.classList.remove('hidden');
    return;
  }
  try {
    const r = await fetch(`/api/activities?number=${encodeURIComponent(num)}`);
    if (!r.ok) throw new Error('bad');
    const data = (await r.json()) as { entries: ActivityDto[]; count: number };
    els.form.openActivitiesCount.value = String(data.count ?? 0);
    els.activitiesEmpty.classList.toggle('hidden', (data.count ?? 0) > 0);
    els.activitiesList.innerHTML = (data.entries ?? [])
      .map((a) => {
        const title = a.title ?? '';
        const when = formatWhen(a.scheduled_at);
        const notes = (a.notes ?? '').trim();
        return `<li class="rounded-sm border border-ink-300 bg-white px-3 py-2">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="text-xs font-extrabold uppercase tracking-wide text-ink-700">${when}</div>
              <div class="font-semibold text-ink-900">${title}</div>
              ${notes ? `<div class="mt-1 text-xs text-ink-600">${notes.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>` : ''}
            </div>
            <button type="button" class="rounded-sm border border-ink-300 bg-brand-surface px-2 py-1 text-[10px] font-extrabold uppercase tracking-widest text-ink-700 hover:bg-ink-100" data-activity-del="${a.id}">
              Borrar
            </button>
          </div>
        </li>`;
      })
      .join('');
  } catch {
    // si falla la API, no bloqueamos; dejamos el valor actual
  }
}

function updateStagePanel(els: Elements, state: AppState): void {
  const s = STAGES[state.currentStageIndex];
  if (!s) return;
  els.stageTitle.textContent = s.label;
  els.stageBadge.textContent = `Paso ${state.currentStageIndex + 1} de ${STAGE_COUNT}`;
  els.stageBadge.className = `inline-flex w-fit items-center rounded-sm border-2 border-white px-3 py-1 text-xs font-bold uppercase tracking-wide text-white ${s.color}`;
}

let historySearchTimer: ReturnType<typeof setTimeout> | null = null;
/** Filas mostradas en la tabla (mismo conjunto que exporta el CSV). */
let lastHistoryTableRows: StageEntry[] = [];

function setHistoryExportButtonEnabled(els: Elements, enabled: boolean): void {
  els.btnExportHistoryCsv.disabled = !enabled;
  els.btnExportHistoryCsv.classList.toggle('opacity-50', !enabled);
  els.btnExportHistoryCsv.classList.toggle('cursor-not-allowed', !enabled);
}

/** Pinta el historial desde PostgreSQL (GET /api/history); si la API falla, usa el estado en memoria. */
async function paintHistoryTable(els: Elements, state: AppState): Promise<void> {
  const raw = els.historyOpportunitySearch.value;
  const trimmed = raw.trim();

  if (!trimmed) {
    lastHistoryTableRows = [];
    setHistoryExportButtonEnabled(els, false);
    renderHistoryTable(els.historyBody, [], els.rowCount, els.emptyHint, {
      totalUnfiltered: 0,
      filterActive: false,
      idleAwaitingSearch: true,
    });
    return;
  }

  try {
    const r = await fetch(apiUrl(`/api/history?opportunityNumber=${encodeURIComponent(trimmed)}`));
    if (!r.ok) throw new Error('api');
    const data = (await r.json()) as { entries: unknown[]; total: number };
    const rows = data.entries
      .map((e) => normalizeHistoryRow(e))
      .filter((x): x is StageEntry => x !== null);
    lastHistoryTableRows = rows;
    setHistoryExportButtonEnabled(els, rows.length > 0);
    renderHistoryTable(els.historyBody, rows, els.rowCount, els.emptyHint, {
      totalUnfiltered: data.total,
      filterActive: true,
    });
  } catch {
    const filtered = filterHistoryByOpportunityNumber(state.history, raw);
    lastHistoryTableRows = filtered;
    setHistoryExportButtonEnabled(els, filtered.length > 0);
    renderHistoryTable(els.historyBody, filtered, els.rowCount, els.emptyHint, {
      totalUnfiltered: state.history.length,
      filterActive: true,
    });
  }
}

/** Para animar solo el conector que acaba de “llenarse” al cambiar de etapa. */
let stepperPreviousRenderedIndex: number | null = null;

function scheduleHistoryPaint(els: Elements, state: AppState): void {
  if (historySearchTimer) clearTimeout(historySearchTimer);
  historySearchTimer = setTimeout(() => {
    historySearchTimer = null;
    void paintHistoryTable(els, state);
  }, 280);
}

function fullRender(els: Elements, state: AppState): void {
  syncClosingPercentToStage(els, state.currentStageIndex);
  renderStepper(els.stepper, state.currentStageIndex, stepperPreviousRenderedIndex);
  stepperPreviousRenderedIndex = state.currentStageIndex;
  updateStagePanel(els, state);
  void paintHistoryTable(els, state);
}

let submitStatusTimer: ReturnType<typeof setTimeout> | null = null;
function setSubmitStatus(els: Elements, msg: string): void {
  els.submitStatus.textContent = msg;
  if (submitStatusTimer) clearTimeout(submitStatusTimer);
  if (msg) {
    submitStatusTimer = setTimeout(() => {
      submitStatusTimer = null;
      els.submitStatus.textContent = '';
    }, 2200);
  }
}

function cloneSnapshot(form: OpportunityForm): OpportunityForm {
  return { ...form };
}

function ensureDefaultDates(els: Elements): void {
  if (!els.form.opportunityStartDate.value) {
    els.form.opportunityStartDate.value = todayIsoDate();
  }
}

export async function mountApp(): Promise<void> {
  const els = queryElements();
  let state: AppState = await loadState();

  writeOpportunityForm(els.form, state.draft);
  syncClosingPercentToStage(els, state.currentStageIndex);
  ensureDefaultDates(els);
  fullRender(els, state);

  const syncObservationsPlacement = () => {
    // Abierto: Observaciones a ancho completo debajo de ambas columnas.
    if (els.clientPanel.open) {
      if (els.obsBlock.parentElement !== els.leadGrid) {
        els.leadGrid.appendChild(els.obsBlock);
      }
      els.obsBlock.classList.add('md:col-span-2');
      return;
    }
    // Cerrado: Observaciones debajo de Clientes (columna izquierda).
    if (els.obsBlock.parentElement !== els.leftStack) {
      els.leftStack.appendChild(els.obsBlock);
    }
    els.obsBlock.classList.remove('md:col-span-2');
  };
  syncObservationsPlacement();
  els.clientPanel.addEventListener('toggle', syncObservationsPlacement);

  const formInputs: HTMLElement[] = [
    els.form.clientName,
    els.form.clientEmail,
    els.form.clientPhone,
    els.form.sellerName,
    els.form.totalInvoiceAmount,
    els.form.territory,
    els.form.displaySystemCurrency,
    els.form.opportunityName,
    els.form.opportunityNumber,
    els.form.documentStatus,
    els.form.opportunityStartDate,
    els.form.opportunityClosingDate,
    els.form.openActivitiesCount,
    els.form.potentialAmount,
    els.form.relatedDocClass,
    els.form.relatedDocNumber,
    els.form.notes,
  ];

  const onDraftChange = () => {
    state = persistDraft(els, state);
  };

  for (const el of formInputs) {
    el.addEventListener('input', onDraftChange);
    el.addEventListener('change', onDraftChange);
  }

  // Autocompletar cliente/vendedor por nº de oportunidad (debounce).
  const scheduleOpportunityLookup = () => {
    if (opportunityLookupTimer) clearTimeout(opportunityLookupTimer);
    opportunityLookupTimer = setTimeout(() => {
      opportunityLookupTimer = null;
      void lookupOpportunityAndFill(els).then(() => {
        state = persistDraft(els, state);
      });
    }, 420);
  };
  els.form.opportunityNumber.addEventListener('input', scheduleOpportunityLookup);
  els.form.opportunityNumber.addEventListener('change', scheduleOpportunityLookup);

  // Autonumeración: al escribir el nombre de oportunidad o al salir del campo,
  // si no hay número, pide uno a PostgreSQL.
  const scheduleAutoNumber = () => {
    if (opportunityAutoNumberTimer) clearTimeout(opportunityAutoNumberTimer);
    opportunityAutoNumberTimer = setTimeout(() => {
      opportunityAutoNumberTimer = null;
      void assignOpportunityNumberIfMissing(els).then(() => {
        state = persistDraft(els, state);
        void refreshActivities(els);
      });
    }, 350);
  };
  els.form.opportunityName.addEventListener('input', scheduleAutoNumber);
  els.form.opportunityName.addEventListener('change', scheduleAutoNumber);
  els.form.opportunityName.addEventListener('blur', scheduleAutoNumber);
  els.form.opportunityNumber.addEventListener('focus', scheduleAutoNumber);

  // Al cambiar nº oportunidad, refresca actividades (contador) desde BD.
  els.form.opportunityNumber.addEventListener('input', () => void refreshActivities(els));
  els.form.opportunityNumber.addEventListener('change', () => void refreshActivities(els));
  void refreshActivities(els);

  // Modal agenda
  els.btnOpenActivities.addEventListener('click', () => {
    const num = els.form.opportunityNumber.value.trim();
    if (!num) {
      alert('Primero escribe el número de oportunidad para anexar actividades.');
      els.form.opportunityNumber.focus();
      return;
    }
    els.activitiesSubtitle.textContent = `Oportunidad Nº ${num}`;
    openActivitiesModal(els);
    void refreshActivities(els);
    els.activityTitle.focus();
  });
  els.btnCloseActivities.addEventListener('click', () => closeActivitiesModal(els));
  els.btnCancelActivity.addEventListener('click', () => closeActivitiesModal(els));
  els.activitiesModal.addEventListener('click', (e) => {
    if (e.target === els.activitiesModal) closeActivitiesModal(els);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !els.activitiesModal.classList.contains('hidden')) closeActivitiesModal(els);
  });
  els.activitiesList.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const btn = t?.closest?.('button[data-activity-del]') as HTMLButtonElement | null;
    const id = btn?.getAttribute('data-activity-del');
    if (!id) return;
    if (!confirm('¿Borrar esta actividad?')) return;
    void fetch(`/api/activities/${encodeURIComponent(id)}`, { method: 'DELETE' })
      .then(() => refreshActivities(els))
      .catch(() => void 0);
  });
  els.activitiesForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const num = els.form.opportunityNumber.value.trim();
    if (!num) return;
    if (!els.activityTitle.value.trim() || !els.activityDatetime.value) {
      els.activitiesForm.reportValidity();
      return;
    }
    const payload = {
      id: crypto.randomUUID(),
      opportunityNumber: num,
      title: els.activityTitle.value.trim(),
      scheduledAt: isoFromDatetimeLocal(els.activityDatetime.value),
      notes: els.activityNotes.value.trim(),
    };
    void fetch('/api/activities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(() => {
        els.activityTitle.value = '';
        els.activityDatetime.value = '';
        els.activityNotes.value = '';
        return refreshActivities(els);
      })
      .catch(() => void 0);
  });

  els.historyOpportunitySearch.addEventListener('input', () => scheduleHistoryPaint(els, state));
  els.historyOpportunitySearch.addEventListener('search', () => void paintHistoryTable(els, state));

  setHistoryExportButtonEnabled(els, false);
  els.btnExportHistoryCsv.addEventListener('click', () => {
    if (lastHistoryTableRows.length === 0) {
      alert('Busca un número de oportunidad y espera a que aparezcan filas en la tabla.');
      return;
    }
    downloadHistoryCsv(lastHistoryTableRows, els.historyOpportunitySearch.value);
  });

  els.stepper.addEventListener('click', (e) => {
    const idx = stepIndexFromTarget(e.target);
    if (idx === null) return;
    state = persistDraft(els, state);
    state = { ...state, currentStageIndex: idx };
    syncClosingPercentToStage(els, state.currentStageIndex);
    saveState(state);
    fullRender(els, state);
  });

  els.leadForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!els.leadForm.reportValidity()) return;

    // % cierre automático en función de la etapa actual.
    syncClosingPercentToStage(els, state.currentStageIndex);

    const snapshot = cloneSnapshot(readOpportunityForm(els.form));
    const stage = STAGES[state.currentStageIndex];
    if (!stage) return;

    const entry: StageEntry = {
      id: crypto.randomUUID(),
      stageId: stage.id,
      createdAt: new Date().toISOString(),
      snapshot,
    };

    state = {
      ...state,
      draft: snapshot,
      history: [...state.history, entry],
    };

    if (els.advanceNext.checked && state.currentStageIndex < STAGE_COUNT - 1) {
      state = { ...state, currentStageIndex: state.currentStageIndex + 1 };
    }

    saveState(state);
    setSubmitStatus(els, 'Guardado');

    // Guarda directorio para autocompletar por nº oportunidad.
    if (snapshot.opportunityNumber.trim()) {
      void fetch(apiUrl('/api/opportunity'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          opportunityNumber: snapshot.opportunityNumber.trim(),
          clientName: snapshot.clientName,
          clientEmail: snapshot.clientEmail,
          clientPhone: snapshot.clientPhone,
          sellerName: snapshot.sellerName,
        }),
      }).catch(() => void 0);
    }

    writeOpportunityForm(els.form, state.draft);
    updateClosingPercentBar(els.form);
    // Feedback visible + tabla inmediata (para verificar guardado).
    if (snapshot.opportunityNumber.trim()) {
      els.historyOpportunitySearch.value = snapshot.opportunityNumber.trim();
    }
    fullRender(els, state);
  });

  els.btnExport.addEventListener('click', () => {
    state = persistDraft(els, state);
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), ...state }, null, 2)], {
      type: 'application/json',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const name = (readOpportunityForm(els.form).opportunityName || 'export').slice(0, 40).replace(/\s+/g, '-');
    a.download = `oportunidad-${name}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  els.btnReset.addEventListener('click', () => {
    if (!confirm('¿Vaciar solo los campos del formulario? El historial y la base de datos no se borran.')) return;
    state = { ...state, draft: {} };
    writeOpportunityForm(els.form, emptySnapshot());
    ensureDefaultDates(els);
    updateClosingPercentBar(els.form);
    saveState(state);
    fullRender(els, state);
  });
}
