import { STAGES, STAGE_COUNT } from './stages';
import type { AppState, OpportunityForm, StageEntry } from './types';
import { clearStorage, loadState, saveState } from './store';
import { todayIsoDate } from './utils/format';
import { renderStepper, stepIndexFromTarget } from './ui/stepper';
import { renderHistoryTable } from './ui/historyTable';
import {
  bindClosingPercentBar,
  queryOpportunityFormElements,
  readOpportunityForm,
  updateClosingPercentBar,
  writeOpportunityForm,
  type OpportunityFormElements,
} from './opportunityForm';

type Elements = {
  stepper: HTMLElement;
  stageTitle: HTMLElement;
  stageBadge: HTMLElement;
  leadForm: HTMLFormElement;
  form: OpportunityFormElements;
  historyBody: HTMLElement;
  rowCount: HTMLElement;
  emptyHint: HTMLElement;
  advanceNext: HTMLInputElement;
  btnExport: HTMLButtonElement;
  btnReset: HTMLButtonElement;
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
    form: queryOpportunityFormElements(),
    historyBody: q('history-body'),
    rowCount: q('row-count'),
    emptyHint: q('empty-hint'),
    advanceNext: q<HTMLInputElement>('advance-next'),
    btnExport: q<HTMLButtonElement>('btn-export'),
    btnReset: q<HTMLButtonElement>('btn-reset'),
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

function updateStagePanel(els: Elements, state: AppState): void {
  const s = STAGES[state.currentStageIndex];
  if (!s) return;
  els.stageTitle.textContent = s.label;
  els.stageBadge.textContent = `Paso ${state.currentStageIndex + 1} de ${STAGE_COUNT}`;
  els.stageBadge.className = `inline-flex w-fit items-center rounded-sm border-2 border-white px-3 py-1 text-xs font-bold uppercase tracking-wide text-white ${s.color}`;
}

function fullRender(els: Elements, state: AppState): void {
  renderStepper(els.stepper, state.currentStageIndex);
  updateStagePanel(els, state);
  renderHistoryTable(els.historyBody, state.history, els.rowCount, els.emptyHint);
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
  updateClosingPercentBar(els.form);
  bindClosingPercentBar(els.form);
  ensureDefaultDates(els);
  fullRender(els, state);

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
    els.form.closingPercent,
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

  els.stepper.addEventListener('click', (e) => {
    const idx = stepIndexFromTarget(e.target);
    if (idx === null) return;
    state = persistDraft(els, state);
    state = { ...state, currentStageIndex: idx };
    saveState(state);
    fullRender(els, state);
  });

  els.leadForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!els.leadForm.reportValidity()) return;

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
    writeOpportunityForm(els.form, state.draft);
    updateClosingPercentBar(els.form);
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
    if (!confirm('¿Borrar todos los datos guardados en este navegador?')) return;
    clearStorage();
    state = { draft: {}, history: [], currentStageIndex: 0 };
    els.leadForm.reset();
    els.form.documentStatus.value = 'abierto';
    ensureDefaultDates(els);
    updateClosingPercentBar(els.form);
    saveState(state);
    fullRender(els, state);
  });
}
