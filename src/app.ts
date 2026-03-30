import { STAGES, STAGE_COUNT } from './stages';
import type { AppState, OpportunityForm, StageEntry, StageId } from './types';
import { emptySnapshot, normalizeHistoryRow } from './migrate';
import { loadState, saveState, saveStateLocal, saveStateSynced } from './store';
import { apiFetch } from './api';
import { isoDatetimeToDateInputValue, todayIsoDate } from './utils/format';
import { escapeHtml } from './utils/escapeHtml';
import { downloadHistoryCsv } from './utils/historyCsv';
import { renderStepper, stepIndexFromTarget } from './ui/stepper';
import { filterHistoryByOpportunityNumber, renderHistoryTable } from './ui/historyTable';
import {
  queryOpportunityFormElements,
  readOpportunityForm,
  setLeadFormFieldsReadonly,
  updateClosingPercentBar,
  writeOpportunityForm,
  type OpportunityFormElements,
} from './opportunityForm';
import { renderStageQuestions, readStageQuestionValues } from './stageQuestions';

const SESSION_CLIENT_KEY = 'lead-session-client-id';

/** La API local no expone POST /api/logs; se deja el hook por si se añade telemetría más adelante. */
function logEvent(_payload: {
  opportunityNumber?: string;
  eventType: string;
  stageId?: string;
  fromStage?: string;
  toStage?: string;
  sellerName?: string;
  clientName?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  durationSeconds?: number;
}): void {
  /* noop */
}

/** Timestamp de cuando se empezó a trabajar en la etapa actual (para calcular duración). */
let stageEnteredAt: number = Date.now();

function stageAutoClosingPercent(stageIndex: number): number {
  const pct = Math.round(((stageIndex + 1) / STAGE_COUNT) * 100);
  return Math.min(100, Math.max(0, pct));
}

function syncClosingPercentToStage(els: Elements, stageIndex: number): void {
  els.form.closingPercent.value = String(stageAutoClosingPercent(stageIndex));
  updateClosingPercentBar(els.form);
}

/** Índice de etapa CRM 0..5 desde GET /api/audit (-1 = sin dato). */
let crmOpportunityStageIndexFromApi = -1;

/**
 * Mapa de feedback por etapa desde `audit.stage_feedback_json`.
 * Clave = número de etapa API (1..6, donde 2 = REUNIÓN).
 */
let auditStageFeedbackJsonByStageNumber: Record<number, string> = {};

/** Progreso mostrado en stepper / barra: prioriza `opportunity_stage` de la API. */
let stepperPreviousProgressIndex: number | null = null;

function historyMaxStageIndex(history: readonly StageEntry[]): number {
  let m = -1;
  for (const e of history) {
    const ix = STAGES.findIndex((s) => s.id === e.stageId);
    if (ix > m) m = ix;
  }
  return m;
}

function effectiveProgressIndex(state: AppState): number {
  if (crmOpportunityStageIndexFromApi >= 0) {
    return crmOpportunityStageIndexFromApi;
  }
  const h = historyMaxStageIndex(state.history);
  return Math.max(0, h);
}

/** Tope del embudo alcanzado (para saber qué etapa sigue editable). */
function furthestReachedStageIndex(state: AppState): number {
  const h = historyMaxStageIndex(state.history);
  if (crmOpportunityStageIndexFromApi >= 0) {
    return Math.max(h, crmOpportunityStageIndexFromApi);
  }
  return h;
}

function isCurrentStageEditable(state: AppState): boolean {
  const f = furthestReachedStageIndex(state);
  if (f < 0) return true;
  return state.currentStageIndex === f;
}

function mergeLoadedCacheFromStateHistory(state: AppState, oppKey: string): void {
  const needle = oppKey.trim().toLowerCase();
  if (!needle) return;
  for (const e of state.history) {
    const sn = (e.snapshot.opportunityNumber ?? '').trim().toLowerCase();
    const sc = (e.snapshot.clientId ?? '').trim().toLowerCase();
    if (sn !== needle && sc !== needle) continue;
    loadedStageDataCache[e.stageId] = { ...e.snapshot.stageData };
  }
}

function latestSnapshotForStageIndex(
  history: readonly StageEntry[],
  oppKey: string,
  stageIndex: number,
): OpportunityForm | null {
  const needle = oppKey.trim().toLowerCase();
  if (!needle) return null;
  const sid = STAGES[stageIndex]?.id as StageId | undefined;
  if (!sid) return null;
  let best: StageEntry | null = null;
  for (const e of history) {
    if (e.stageId !== sid) continue;
    const sn = (e.snapshot.opportunityNumber ?? '').trim().toLowerCase();
    const sc = (e.snapshot.clientId ?? '').trim().toLowerCase();
    if (sn !== needle && sc !== needle) continue;
    if (!best || e.createdAt > best.createdAt) best = e;
  }
  return best
    ? { ...best.snapshot, stageData: { ...best.snapshot.stageData } }
    : null;
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
  stageQuestionsPanel: HTMLElement;
  stageQuestionsTitle: HTMLElement;
  stageQuestionsContainer: HTMLElement;
  btnSubmitStage: HTMLButtonElement;
  btnCloseOpportunity: HTMLButtonElement;
  clientGate: HTMLElement;
  appWorkspace: HTMLElement;
  gateClientId: HTMLInputElement;
  gateContinue: HTMLButtonElement;
  gateHint: HTMLElement;
  btnChangeClientId: HTMLButtonElement;
  pageHeader: HTMLElement;
  loadingOverlay: HTMLElement;
  loadingText: HTMLElement;
  closeOpportunityModal: HTMLElement;
  closeOpportunityJustification: HTMLTextAreaElement;
  closeOpportunityHint: HTMLElement;
  btnCloseOpportunityDismiss: HTMLButtonElement;
  btnCloseOpportunityCancel: HTMLButtonElement;
  btnCloseOpportunityConfirm: HTMLButtonElement;
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
    stageQuestionsPanel: q('stage-questions-panel'),
    stageQuestionsTitle: q('stage-questions-title'),
    stageQuestionsContainer: q('stage-questions-container'),
    btnSubmitStage: q<HTMLButtonElement>('btn-submit-stage'),
    btnCloseOpportunity: q<HTMLButtonElement>('btn-close-opportunity'),
    clientGate: q('client-id-gate'),
    appWorkspace: q('app-workspace'),
    gateClientId: q<HTMLInputElement>('gate-client-id'),
    gateContinue: q<HTMLButtonElement>('gate-continue'),
    gateHint: q('gate-hint'),
    btnChangeClientId: q<HTMLButtonElement>('btn-change-client-id'),
    pageHeader: q('app-page-header'),
    loadingOverlay: q('app-loading'),
    loadingText: q('app-loading-text'),
    closeOpportunityModal: q('close-opportunity-modal'),
    closeOpportunityJustification: q<HTMLTextAreaElement>('close-opportunity-justification'),
    closeOpportunityHint: q('close-opportunity-hint'),
    btnCloseOpportunityDismiss: q<HTMLButtonElement>('btn-close-opportunity-dismiss'),
    btnCloseOpportunityCancel: q<HTMLButtonElement>('btn-close-opportunity-cancel'),
    btnCloseOpportunityConfirm: q<HTMLButtonElement>('btn-close-opportunity-confirm'),
  };
}

function readUrlClientIdParam(): string {
  try {
    const v = new URLSearchParams(window.location.search).get('client_id');
    return (v ?? '').trim();
  } catch {
    return '';
  }
}

function setGateVisibility(els: Elements, gateActive: boolean): void {
  els.clientGate.classList.toggle('hidden', !gateActive);
  els.appWorkspace.classList.toggle('hidden', gateActive);
  els.pageHeader.classList.toggle('hidden', gateActive);
  els.btnChangeClientId.classList.toggle('hidden', gateActive);
}

let loadingDepth = 0;
function showLoading(els: Elements, msg: string): void {
  loadingDepth += 1;
  els.loadingText.textContent = msg;
  els.loadingOverlay.classList.remove('hidden');
}

function hideLoading(els: Elements): void {
  loadingDepth = Math.max(0, loadingDepth - 1);
  if (loadingDepth === 0) {
    els.loadingOverlay.classList.add('hidden');
  }
}

function mergeCloseJustificationIntoNotes(existingNotes: string, justification: string): string {
  const j = justification.trim();
  const e = existingNotes.trim();
  const block = `[Motivo de cierre]\n${j}`;
  return e ? `${e}\n\n${block}` : block;
}

function showCloseOpportunityModal(els: Elements): void {
  els.closeOpportunityHint.textContent = '';
  els.closeOpportunityJustification.value = '';
  els.closeOpportunityModal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => els.closeOpportunityJustification.focus());
}

function hideCloseOpportunityModal(els: Elements): void {
  els.closeOpportunityModal.classList.add('hidden');
  document.body.style.overflow = '';
}

/** Historial: mismo criterio que el número de oportunidad / client_id. */
function syncHistorySearchWithOpportunity(els: Elements, state: AppState): void {
  const n = els.form.opportunityNumber.value.trim();
  if (!n) return;
  els.historyOpportunitySearch.value = n;
  void paintHistoryTable(els, state);
}

async function applyClientIdAndOpenWorkspace(
  els: Elements,
  state: AppState,
  rawId: string,
): Promise<AppState> {
  const id = rawId.trim();
  if (!id) {
    els.gateHint.textContent = 'Escribe el ID del cliente para continuar.';
    return state;
  }
  els.gateHint.textContent = '';
  sessionStorage.setItem(SESSION_CLIENT_KEY, id);
  els.gateClientId.value = id;
  crmOpportunityStageIndexFromApi = -1;
  loadedStageDataCache = {};
  auditStageFeedbackJsonByStageNumber = {};
  // Al cambiar de cliente, reiniciamos el formulario para evitar arrastre de datos.
  const freshDraft: Partial<OpportunityForm> = {
    ...emptySnapshot(),
    opportunityNumber: id,
    clientId: id,
  };
  let s: AppState = { ...state, currentStageIndex: 0, draft: freshDraft };
  mergeLoadedCacheFromStateHistory(s, id);
  writeOpportunityForm(els.form, freshDraft);
  els.form.opportunityNumber.value = id;
  ensureDefaultDates(els);
  setGateVisibility(els, false);
  opportunityLookupLastKey = '';
  showLoading(els, 'Cargando cliente...');
  try {
    s = await lookupOpportunityAndFill(els, s);
    s = persistDraft(els, s);
    fullRender(els, s);
    syncHistorySearchWithOpportunity(els, s);
    return s;
  } finally {
    hideLoading(els);
  }
}

/** Guarda el borrador solo en localStorage (sin llamar a la API). */
function persistDraft(els: Elements, state: AppState): AppState {
  if (!isCurrentStageEditable(state)) return state;
  const stage = STAGES[state.currentStageIndex];
  const stageData = stage ? readStageQuestionValues(stage.id) : {};
  const next: AppState = {
    ...state,
    draft: readOpportunityForm(els.form, stageData),
  };
  saveStateLocal(next);
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

/** Nombres de asesor conocidos en `audits` (documentado: GET /api/metrics/lista-asesores). */
async function refreshSellerNameDatalist(): Promise<void> {
  const dl = document.getElementById('seller-name-list');
  if (!dl || !(dl instanceof HTMLDataListElement)) return;
  try {
    const r = await apiFetch('/api/metrics/lista-asesores');
    if (!r.ok) return;
    const data = (await r.json()) as { asesores?: { asesor?: string }[] };
    const rows = Array.isArray(data.asesores) ? data.asesores : [];
    const options = rows
      .map((row) => {
        const v = String(row.asesor ?? '').trim();
        if (!v || v === '(sin asesor)') return '';
        return `<option value="${escapeHtml(v)}"></option>`;
      })
      .join('');
    dl.innerHTML = options;
  } catch {
    /* API no disponible: el campo sigue siendo texto libre */
  }
}

/**
 * Última auditoría para `client_id` (GET /api/audit/by-client/…): complementa directorio
 * con asunto, descripción, país, fechas de reunión, etc.
 */
async function fillFromLatestAuditByClientId(els: Elements, clientKey: string): Promise<void> {
  const cid = clientKey.trim();
  if (!cid) {
    crmOpportunityStageIndexFromApi = -1;
    return;
  }
  try {
    const r = await apiFetch(`/api/audit/by-client/${encodeURIComponent(cid)}`);
    if (!r.ok) {
      crmOpportunityStageIndexFromApi = -1;
      return;
    }
    const body = (await r.json()) as { audit?: Record<string, unknown> };
    const a = body.audit;
    if (!a || typeof a !== 'object') {
      crmOpportunityStageIndexFromApi = -1;
      return;
    }
    {
      const rawSt = a.opportunity_stage;
      let stn = typeof rawSt === 'number' ? rawSt : parseInt(String(rawSt ?? '1'), 10);
      if (!Number.isFinite(stn)) stn = 1;
      stn = Math.max(1, Math.min(6, stn));
      crmOpportunityStageIndexFromApi = stn - 1;
    }

    // stage_feedback_json: feedback por etapa (1..6). 2 = REUNIÓN (bloquea escalación vía advisor_feedback).
    auditStageFeedbackJsonByStageNumber = {};
    {
      const sfj = (a as { stage_feedback_json?: unknown }).stage_feedback_json;
      if (sfj && typeof sfj === 'object' && !Array.isArray(sfj)) {
        const obj = sfj as Record<string, unknown>;
        for (const [k, v] of Object.entries(obj)) {
          const stageNum = parseInt(k, 10);
          if (!Number.isFinite(stageNum) || stageNum < 1 || stageNum > 6) continue;
          const txt = typeof v === 'string' ? v.trim() : String(v ?? '').trim();
          if (txt) auditStageFeedbackJsonByStageNumber[stageNum] = txt;
        }
      }
    }
    fillIfEmpty(els.form.clientName, String(a.client_name ?? ''));
    fillIfEmpty(els.form.clientEmail, String(a.client_email ?? ''));
    fillIfEmpty(els.form.clientPhone, String(a.client_phone ?? ''));
    fillIfEmpty(els.form.sellerName, String(a.advisor_name ?? ''));
    fillIfEmpty(els.form.opportunityName, String(a.subject ?? ''));
    const st = isoDatetimeToDateInputValue(a.start_time as string | undefined);
    const en = isoDatetimeToDateInputValue(a.end_time as string | undefined);
    if (st) fillIfEmpty(els.form.opportunityStartDate, st);
    if (en) fillIfEmpty(els.form.opportunityClosingDate, en);
    fillIfEmpty(els.form.territory, String(a.country ?? ''));
    fillIfEmpty(els.form.notes, String(a.description ?? ''));
    if (a.id != null && String(a.id).trim() !== '') {
      fillIfEmpty(els.form.relatedDocNumber, String(a.id));
    }
  } catch {
    crmOpportunityStageIndexFromApi = -1;
  }
}

/** Cache local de datos de etapa cargados desde BD (por oportunidad). */
let loadedStageDataCache: Record<string, Record<string, string>> = {};

/** Reconstruye respuestas por etapa desde el historial en `lead_app_state` (no hay GET /api/stage-data en la API). */
async function loadAllStageData(oppNumber: string): Promise<Record<string, Record<string, string>>> {
  if (!oppNumber) return {};
  const needle = oppNumber.trim().toLowerCase();
  try {
    const r = await apiFetch('/api/state');
    if (!r.ok) return {};
    const body = (await r.json()) as { history?: unknown[] };
    const rawHistory = Array.isArray(body.history) ? body.history : [];
    const byStage: Record<string, Record<string, string>> = {};
    for (const item of rawHistory) {
      if (!item || typeof item !== 'object') continue;
      const row = item as {
        stageId?: string;
        snapshot?: { opportunityNumber?: string; stageData?: Record<string, string> };
      };
      const snap = row.snapshot;
      if (!snap) continue;
      const num = String(snap.opportunityNumber ?? '')
        .trim()
        .toLowerCase();
      const cid = String(
        (snap as { clientId?: string; client_id?: string }).clientId ??
          (snap as { client_id?: string }).client_id ??
          '',
      )
        .trim()
        .toLowerCase();
      if (num !== needle && cid !== needle) continue;
      const sid = row.stageId;
      const sd = snap.stageData;
      if (sid && sd && typeof sd === 'object') {
        byStage[sid] = { ...sd };
      }
    }
    return byStage;
  } catch {
    return {};
  }
}

async function lookupOpportunityAndFill(els: Elements, state: AppState): Promise<AppState> {
  const key = els.form.opportunityNumber.value.trim();
  if (!key) {
    opportunityLookupLastKey = '';
    crmOpportunityStageIndexFromApi = -1;
    return state;
  }
  if (key === opportunityLookupLastKey) return state;
  opportunityLookupLastKey = key;

  try {
    const r = await apiFetch(`/api/opportunity?number=${encodeURIComponent(key)}`);
    if (r.ok) {
      const d = (await r.json()) as OpportunityDirectory;
      if (d && typeof d === 'object') {
        fillIfEmpty(els.form.clientName, d.clientName ?? '');
        fillIfEmpty(els.form.clientEmail, d.clientEmail ?? '');
        fillIfEmpty(els.form.clientPhone, d.clientPhone ?? '');
        fillIfEmpty(els.form.sellerName, d.sellerName ?? '');
      }
    }
  } catch {
    /* ignore */
  }

  await fillFromLatestAuditByClientId(els, key);
  loadedStageDataCache = await loadAllStageData(key);
  mergeLoadedCacheFromStateHistory(state, key);

  if (crmOpportunityStageIndexFromApi >= 0) {
    const tIdx = crmOpportunityStageIndexFromApi;
    const snap = latestSnapshotForStageIndex(state.history, key, tIdx);
    state = { ...state, currentStageIndex: tIdx };
    if (snap) {
      state = { ...state, draft: snap };
      writeOpportunityForm(els, snap);
    } else {
      const st = STAGES[tIdx];
      const sd = st ? loadedStageDataCache[st.id] ?? {} : {};
      const stageNum = tIdx + 1; // API 1..6 (2 = REUNIÓN)
      const fb = auditStageFeedbackJsonByStageNumber[stageNum] ?? '';
      const existingNotes = els.form.notes.value.trim();
      const nextNotes = fb || existingNotes || '';
      const nextDraft: Partial<OpportunityForm> = {
        ...state.draft,
        stageData: { ...sd },
        notes: nextNotes,
      };
      state = { ...state, draft: nextDraft };
      writeOpportunityForm(els, nextDraft);
    }
  } else {
    const cur = STAGES[state.currentStageIndex];
    if (cur && loadedStageDataCache[cur.id]) {
      const sd = loadedStageDataCache[cur.id] ?? {};
      const stageNum = state.currentStageIndex + 1; // API 1..6
      const fb = auditStageFeedbackJsonByStageNumber[stageNum] ?? '';
      const existingNotes = els.form.notes.value.trim();
      const nextNotes = fb || existingNotes || '';
      const nextDraft: Partial<OpportunityForm> = {
        ...state.draft,
        stageData: { ...sd },
        notes: nextNotes,
      };
      state = { ...state, draft: nextDraft };
      writeOpportunityForm(els, nextDraft);
    }
  }

  return state;
}

const OPP_SEQ_KEY = 'formulario-leads-opp-seq';

function nextLocalOpportunityNumber(): string {
  let n = parseInt(localStorage.getItem(OPP_SEQ_KEY) || '0', 10);
  if (!Number.isFinite(n) || n < 0) n = 0;
  n += 1;
  localStorage.setItem(OPP_SEQ_KEY, String(n));
  return String(n);
}

async function assignOpportunityNumberIfMissing(els: Elements): Promise<void> {
  if (opportunityAutoNumberInFlight) return;
  if (els.form.opportunityNumber.value.trim()) return;
  // Si aún no hay nombre de oportunidad, no asignamos número.
  if (!els.form.opportunityName.value.trim()) return;
  opportunityAutoNumberInFlight = true;
  try {
    const n = nextLocalOpportunityNumber();
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

/** La API no incluye CRUD de actividades; se persisten en localStorage por número de oportunidad. */
const ACTIVITIES_STORAGE_KEY = 'formulario-leads-activities-v1';
type ActivitiesStore = Record<string, ActivityDto[]>;

function readActivitiesStore(): ActivitiesStore {
  try {
    const raw = localStorage.getItem(ACTIVITIES_STORAGE_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as unknown;
    return p && typeof p === 'object' ? (p as ActivitiesStore) : {};
  } catch {
    return {};
  }
}

function getActivitiesForOpp(num: string): ActivityDto[] {
  const all = readActivitiesStore();
  const list = all[num];
  return Array.isArray(list) ? list : [];
}

function setActivitiesForOpp(num: string, entries: ActivityDto[]): void {
  const all = readActivitiesStore();
  all[num] = entries;
  localStorage.setItem(ACTIVITIES_STORAGE_KEY, JSON.stringify(all));
}

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
    const entries = getActivitiesForOpp(num);
    const count = entries.length;
    els.form.openActivitiesCount.value = String(count);
    els.activitiesEmpty.classList.toggle('hidden', count > 0);
    els.activitiesList.innerHTML = entries
      .map((a: ActivityDto) => {
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

function updateStagePanel(els: Elements, state: AppState, readOnly: boolean): void {
  const s = STAGES[state.currentStageIndex];
  if (!s) return;
  els.stageTitle.textContent = s.label;
  const prog = effectiveProgressIndex(state);
  els.stageBadge.textContent = readOnly
    ? `Revisión paso ${state.currentStageIndex + 1} · CRM paso ${prog + 1}`
    : `Paso ${state.currentStageIndex + 1} de ${STAGE_COUNT} · Avance CRM ${prog + 1}/${STAGE_COUNT}`;
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
    const q = encodeURIComponent(trimmed);
    const merge = '&mergeAudit=1';
    let r = await apiFetch(`/api/history?opportunityNumber=${q}${merge}`);
    if (!r.ok) throw new Error('api');
    let data = (await r.json()) as { entries: unknown[]; total: number };
    if (!data.entries?.length) {
      const r2 = await apiFetch(`/api/history?clientId=${q}${merge}`);
      if (r2.ok) {
        data = (await r2.json()) as { entries: unknown[]; total: number };
      }
    }
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

function renderCurrentStageQuestions(els: Elements, state: AppState, readOnly: boolean): void {
  const stage = STAGES[state.currentStageIndex];
  if (!stage) return;
  els.stageQuestionsTitle.textContent = readOnly
    ? `Preguntas — ${stage.label} (solo lectura)`
    : `Preguntas — ${stage.label}`;
  const stageData = state.draft.stageData ?? loadedStageDataCache[stage.id] ?? {};
  renderStageQuestions(els.stageQuestionsContainer, stage.id, stageData, readOnly);
}

function applyStageViewLock(els: Elements, state: AppState): void {
  const ro = !isCurrentStageEditable(state);
  setLeadFormFieldsReadonly(els.form, ro);
  els.advanceNext.disabled = ro;
  els.btnSubmitStage.disabled = ro;
  els.btnCloseOpportunity.disabled = ro;
  els.btnReset.disabled = ro;
  els.btnOpenActivities.disabled = ro;
  els.stageQuestionsPanel.classList.toggle('opacity-95', ro);
}

function fullRender(els: Elements, state: AppState): void {
  const progressIdx = effectiveProgressIndex(state);
  syncClosingPercentToStage(els, progressIdx);
  const ro = !isCurrentStageEditable(state);
  renderStepper(
    els.stepper,
    state.currentStageIndex,
    progressIdx,
    stepperPreviousRenderedIndex,
    stepperPreviousProgressIndex,
  );
  stepperPreviousRenderedIndex = state.currentStageIndex;
  stepperPreviousProgressIndex = progressIdx;
  updateStagePanel(els, state, ro);
  renderCurrentStageQuestions(els, state, ro);
  applyStageViewLock(els, state);
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
  return { ...form, stageData: { ...form.stageData } };
}

function ensureDefaultDates(els: Elements): void {
  if (!els.form.opportunityStartDate.value) {
    els.form.opportunityStartDate.value = todayIsoDate();
  }
}

export async function mountApp(): Promise<void> {
  const els = queryElements();
  showLoading(els, 'Cargando aplicacion...');
  let state: AppState;
  try {
    state = await loadState();
  } finally {
    hideLoading(els);
  }

  void refreshSellerNameDatalist();

  const urlClientId = readUrlClientIdParam();
  const sessionId = (sessionStorage.getItem(SESSION_CLIENT_KEY) ?? '').trim();
  const draftOpp = (state.draft.opportunityNumber ?? '').trim();
  const suggestedId = (urlClientId || sessionId || draftOpp).trim();
  if (suggestedId) els.gateClientId.value = suggestedId;

  setGateVisibility(els, true);
  requestAnimationFrame(() => els.gateClientId.focus());

  els.gateContinue.addEventListener('click', () => {
    void applyClientIdAndOpenWorkspace(els, state, els.gateClientId.value).then((s) => {
      state = s;
    });
  });
  els.gateClientId.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      els.gateContinue.click();
    }
  });
  els.btnChangeClientId.addEventListener('click', () => {
    sessionStorage.removeItem(SESSION_CLIENT_KEY);
    const prev = els.form.opportunityNumber.value.trim();
    setGateVisibility(els, true);
    els.gateClientId.value = prev;
    els.gateHint.textContent = prev
      ? 'Puedes confirmar el mismo identificador o escribir otro. Pulsa Continuar.'
      : 'Escribe el identificador del cliente.';
    void els.gateClientId.focus();
  });

  // Observaciones siempre debajo de Cliente (columna izquierda) para evitar huecos.
  if (els.obsBlock.parentElement !== els.leftStack) {
    els.leftStack.appendChild(els.obsBlock);
  }
  els.obsBlock.classList.remove('md:col-span-2');

  const formInputs: HTMLElement[] = [
    els.form.clientName,
    els.form.clientEmail,
    els.form.clientPhone,
    els.form.sellerName,
    els.form.opportunityName,
    els.form.opportunityNumber,
    els.form.documentStatus,
    els.form.opportunityStartDate,
    els.form.opportunityClosingDate,
    els.form.potentialAmount,
    els.form.notes,
  ];

  const onDraftChange = () => {
    if (!isCurrentStageEditable(state)) return;
    state = persistDraft(els, state);
  };

  for (const el of formInputs) {
    el.addEventListener('input', onDraftChange);
    el.addEventListener('change', onDraftChange);
  }

  // Autocompletar cliente/vendedor por nº de oportunidad (solo al salir del campo o confirmar).
  const doOpportunityLookup = () => {
    if (opportunityLookupTimer) clearTimeout(opportunityLookupTimer);
    opportunityLookupTimer = setTimeout(() => {
      opportunityLookupTimer = null;
      showLoading(els, 'Actualizando cliente...');
      void lookupOpportunityAndFill(els, state)
        .then((s) => {
          state = s;
          state = persistDraft(els, state);
          syncHistorySearchWithOpportunity(els, state);
          fullRender(els, state);
        })
        .finally(() => hideLoading(els));
    }, 300);
  };
  els.form.opportunityNumber.addEventListener('blur', doOpportunityLookup);
  els.form.opportunityNumber.addEventListener('change', doOpportunityLookup);

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

  // Al confirmar nº oportunidad, refresca actividades (contador) desde BD.
  els.form.opportunityNumber.addEventListener('blur', () => void refreshActivities(els));
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
    Promise.resolve()
      .then(() => {
        const num = els.form.opportunityNumber.value.trim();
        const next = getActivitiesForOpp(num).filter((a) => a.id !== id);
        setActivitiesForOpp(num, next);
        logEvent({
          opportunityNumber: num,
          eventType: 'activity_deleted',
          sellerName: els.form.sellerName.value.trim(),
          clientName: els.form.clientName.value.trim(),
          description: `Actividad eliminada (id: ${id})`,
          metadata: { activityId: id },
        });
        return refreshActivities(els);
      })
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
    const row: ActivityDto = {
      id: payload.id,
      opportunity_number: num,
      title: payload.title,
      scheduled_at: payload.scheduledAt,
      notes: payload.notes,
      created_at: new Date().toISOString(),
    };
    const list = [...getActivitiesForOpp(num), row];
    setActivitiesForOpp(num, list);
    logEvent({
      opportunityNumber: num,
      eventType: 'activity_created',
      sellerName: els.form.sellerName.value.trim(),
      clientName: els.form.clientName.value.trim(),
      description: `Actividad creada: "${payload.title}" programada ${payload.scheduledAt}`,
      metadata: { activityId: payload.id, title: payload.title, scheduledAt: payload.scheduledAt },
    });
    els.activityTitle.value = '';
    els.activityDatetime.value = '';
    els.activityNotes.value = '';
    void refreshActivities(els);
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
    const prevIdx = state.currentStageIndex;
    state = persistDraft(els, state);
    const opp = els.form.opportunityNumber.value.trim();
    let nextState: AppState = { ...state, currentStageIndex: idx };
    const prevStage = STAGES[prevIdx];
    const newStage = STAGES[idx];
    const nextEditable = isCurrentStageEditable(nextState);
    const stageNum = idx + 1; // API 1..6 (2 = REUNIÓN)
    const fb = auditStageFeedbackJsonByStageNumber[stageNum] ?? '';

    if (!nextEditable) {
      const snap = latestSnapshotForStageIndex(nextState.history, opp, idx);
      if (snap) {
        nextState = { ...nextState, draft: cloneSnapshot(snap) };
        writeOpportunityForm(els, snap);
      } else if (newStage && loadedStageDataCache[newStage.id]) {
        nextState = {
          ...nextState,
          draft: {
            ...nextState.draft,
            stageData: { ...loadedStageDataCache[newStage.id] },
            notes: fb,
          },
        };
        writeOpportunityForm(els, nextState.draft);
      } else {
        nextState = { ...nextState, draft: { ...nextState.draft, stageData: {}, notes: fb } };
        writeOpportunityForm(els, nextState.draft);
      }
    } else {
      const tipSnap = latestSnapshotForStageIndex(nextState.history, opp, idx);
      if (tipSnap) {
        nextState = { ...nextState, draft: cloneSnapshot(tipSnap) };
        writeOpportunityForm(els, tipSnap);
      } else if (newStage && loadedStageDataCache[newStage.id]) {
        nextState = {
          ...nextState,
          draft: {
            ...nextState.draft,
            stageData: loadedStageDataCache[newStage.id] ?? {},
            notes: fb,
          },
        };
        writeOpportunityForm(els, nextState.draft);
      } else {
        nextState = { ...nextState, draft: { ...nextState.draft, stageData: {}, notes: fb } };
        writeOpportunityForm(els, nextState.draft);
      }
    }

    state = nextState;
    saveState(state);
    if (idx !== prevIdx) {
      const elapsed = Math.round((Date.now() - stageEnteredAt) / 1000);
      logEvent({
        opportunityNumber: els.form.opportunityNumber.value.trim(),
        eventType: 'stage_change',
        stageId: newStage?.id,
        fromStage: prevStage?.id ?? '',
        toStage: newStage?.id ?? '',
        sellerName: els.form.sellerName.value.trim(),
        clientName: els.form.clientName.value.trim(),
        description: `Cambió de "${prevStage?.label ?? ''}" a "${newStage?.label ?? ''}"`,
        durationSeconds: elapsed,
      });
      stageEnteredAt = Date.now();
    }
    fullRender(els, state);
  });

  els.leadForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!isCurrentStageEditable(state)) return;
    if (!els.leadForm.reportValidity()) return;

    const stage = STAGES[state.currentStageIndex];
    if (!stage) return;
    const currentStageData = readStageQuestionValues(stage.id);
    // Actualiza cache local para que al cambiar etapa se vean los datos.
    loadedStageDataCache[stage.id] = currentStageData;
    const snapshot = cloneSnapshot(readOpportunityForm(els.form, currentStageData));

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

    const submittedStageIdx = STAGES.indexOf(stage);
    const advancedToNext = els.advanceNext.checked && state.currentStageIndex > submittedStageIdx;

    void (async () => {
      const synced = await saveStateSynced(state);
      setSubmitStatus(els, synced ? 'Guardado' : 'Guardado solo en este equipo (revisa la API)');

      const elapsed = Math.round((Date.now() - stageEnteredAt) / 1000);
      logEvent({
        opportunityNumber: snapshot.opportunityNumber.trim(),
        eventType: 'stage_submit',
        stageId: stage.id,
        sellerName: snapshot.sellerName,
        clientName: snapshot.clientName,
        description: `Envió etapa "${stage.label}" — % cierre: ${snapshot.closingPercent}%`,
        metadata: { closingPercent: snapshot.closingPercent, stageData: currentStageData },
        durationSeconds: elapsed,
      });

      if (advancedToNext) {
        const newStage = STAGES[state.currentStageIndex];
        logEvent({
          opportunityNumber: snapshot.opportunityNumber.trim(),
          eventType: 'stage_advance',
          fromStage: stage.id,
          toStage: newStage?.id ?? '',
          sellerName: snapshot.sellerName,
          clientName: snapshot.clientName,
          description: `Avanzó automáticamente de "${stage.label}" a "${newStage?.label ?? ''}"`,
        });
        stageEnteredAt = Date.now();
      }

      // Retroalimentación al auditor: ahora el backend guarda por etapa en `stage_feedback_json`,
      // y solo la etapa 2 usa el campo viejo `advisor_feedback` para frenar la escalación.
      // Enviamos siempre `stage` (API 1..6).
      {
        const submittedStageNum = submittedStageIdx + 1; // API 1..6
        const clientId = (snapshot.clientId ?? snapshot.opportunityNumber).trim();
        const retroText = (snapshot.notes ?? '').trim();
        if (clientId && retroText) {
          void apiFetch(`/api/audit/client/${encodeURIComponent(clientId)}/retroalimentacion`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              retroalimentacion: retroText,
              stage: submittedStageNum,
            }),
          }).catch(() => void 0);
        }
      }

      if (snapshot.opportunityNumber.trim()) {
        void apiFetch('/api/opportunity', {
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
      if (snapshot.opportunityNumber.trim()) {
        syncHistorySearchWithOpportunity(els, state);
      }
      fullRender(els, state);
    })();
  });

  els.btnCloseOpportunity.addEventListener('click', () => {
    if (!isCurrentStageEditable(state)) return;
    const opp = els.form.opportunityNumber.value.trim();
    if (!opp) {
      setSubmitStatus(els, 'Falta el ID de oportunidad.');
      els.form.opportunityNumber.focus();
      return;
    }
    showCloseOpportunityModal(els);
  });

  const dismissCloseOpportunityModal = () => hideCloseOpportunityModal(els);

  els.btnCloseOpportunityDismiss.addEventListener('click', dismissCloseOpportunityModal);
  els.btnCloseOpportunityCancel.addEventListener('click', dismissCloseOpportunityModal);
  els.closeOpportunityModal.addEventListener('click', (e) => {
    if (e.target === els.closeOpportunityModal) dismissCloseOpportunityModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!els.closeOpportunityModal.classList.contains('hidden')) {
      e.preventDefault();
      dismissCloseOpportunityModal();
    }
  });

  els.btnCloseOpportunityConfirm.addEventListener('click', () => {
    const justification = els.closeOpportunityJustification.value.trim();
    if (!justification) {
      els.closeOpportunityHint.textContent = 'Escribe la justificación del cierre.';
      els.closeOpportunityJustification.focus();
      return;
    }
    els.closeOpportunityHint.textContent = '';
    if (!isCurrentStageEditable(state)) {
      hideCloseOpportunityModal(els);
      return;
    }
    const opp = els.form.opportunityNumber.value.trim();
    if (!opp) {
      hideCloseOpportunityModal(els);
      setSubmitStatus(els, 'Falta el ID de oportunidad.');
      return;
    }

    els.form.notes.value = mergeCloseJustificationIntoNotes(els.form.notes.value, justification);
    hideCloseOpportunityModal(els);

    const closureStage = STAGES[STAGE_COUNT - 1];
    if (!closureStage) return;
    const closureStageData = readStageQuestionValues(closureStage.id);
    loadedStageDataCache[closureStage.id] = closureStageData;

    els.form.documentStatus.value = 'cerrado_perdido';
    els.form.opportunityClosingDate.value = todayIsoDate();
    els.form.closingPercent.value = '0';
    updateClosingPercentBar(els.form);

    const snapshot = cloneSnapshot(readOpportunityForm(els.form, closureStageData));
    const entry: StageEntry = {
      id: crypto.randomUUID(),
      stageId: closureStage.id,
      createdAt: new Date().toISOString(),
      snapshot,
    };

    state = {
      ...state,
      currentStageIndex: STAGE_COUNT - 1,
      draft: snapshot,
      history: [...state.history, entry],
    };

    void (async () => {
      const synced = await saveStateSynced(state);
      setSubmitStatus(els, synced ? 'Oportunidad cerrada' : 'Cerrada en local; API no disponible');

      // Retroalimentación de cierre: backend guarda por etapa en `stage_feedback_json`.
      {
        const stageNum = STAGE_COUNT; // API 1..6
        const clientId = (snapshot.clientId ?? snapshot.opportunityNumber).trim();
        const retroText = (snapshot.notes ?? '').trim();
        if (clientId && retroText) {
          void apiFetch(`/api/audit/client/${encodeURIComponent(clientId)}/retroalimentacion`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              retroalimentacion: retroText,
              stage: stageNum,
            }),
          }).catch(() => void 0);
        }
      }

      if (snapshot.opportunityNumber.trim()) {
        void apiFetch('/api/opportunity', {
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
      logEvent({
        opportunityNumber: snapshot.opportunityNumber.trim(),
        eventType: 'opportunity_closed',
        stageId: closureStage.id,
        sellerName: snapshot.sellerName,
        clientName: snapshot.clientName,
        description: `Cierre manual: ${justification.slice(0, 120)}`,
      });
      stageEnteredAt = Date.now();
      syncHistorySearchWithOpportunity(els, state);
      fullRender(els, state);
    })();
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
    const prevOpp = els.form.opportunityNumber.value.trim();
    const prevSeller = els.form.sellerName.value.trim();
    const prevClient = els.form.clientName.value.trim();
    const prevStage = STAGES[state.currentStageIndex];
    state = { ...state, draft: {} };
    writeOpportunityForm(els.form, emptySnapshot());
    ensureDefaultDates(els);
    updateClosingPercentBar(els.form);
    saveState(state);
    logEvent({
      opportunityNumber: prevOpp,
      eventType: 'form_reset',
      stageId: prevStage?.id ?? '',
      sellerName: prevSeller,
      clientName: prevClient,
      description: `Formulario reiniciado desde etapa "${prevStage?.label ?? ''}"`,
    });
    stageEnteredAt = Date.now();
    fullRender(els, state);
  });
}
