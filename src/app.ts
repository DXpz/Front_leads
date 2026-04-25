import { STAGES, STAGE_COUNT, getStages, getStageCount } from './stages';
import type { AppState, OpportunityForm, StageEntry, StageId } from './types';
import { emptySnapshot, mapLegacyStageIdToCurrent, normalizeHistoryRow } from './migrate';
import { loadState, saveState, saveStateLocal, saveStateSynced } from './store';
import { apiUrl, apiFetch } from './api';
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

/** Prefijo del ID de lead: `LD` + uno o más dígitos (ej. LD42, LD1234). */
const LEAD_ID_PREFIX = 'LD';

const LEAD_ID_PATTERN = /^LD\d+$/;

function leadDigitsOnly(s: string): string {
  return s.replace(/\D/g, '');
}

/** Convierte `L` + dígitos o `LD` + dígitos al formato LD + números. Resto sin cambios. */
function normalizeLeadIdInput(raw: string): string {
  const t = raw.trim().toUpperCase();
  let m = /^L(\d+)$/.exec(t);
  if (m) return `${LEAD_ID_PREFIX}${leadDigitsOnly(m[1])}`;
  m = /^LD(\d+)$/.exec(t);
  if (m) return `${LEAD_ID_PREFIX}${leadDigitsOnly(m[1])}`;
  return t;
}

function isValidLeadIdFormat(id: string): boolean {
  return LEAD_ID_PATTERN.test(id.trim().toUpperCase());
}

/**
 * Normaliza la clave estable del lead/oportunidad para requests:
 * - NFKC para caracteres equivalentes
 * - elimina espacios (incluidos unicode)
 * - mayúsculas
 */
function normalizeOpportunityKey(raw: string): string {
  return raw.normalize('NFKC').replace(/\s+/g, '').toUpperCase();
}

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

function stageAutoClosingPercent(stageIndex: number, showDemo: boolean = false): number {
  const pct = Math.round(((stageIndex + 1) / getStageCount(showDemo)) * 100);
  return Math.min(100, Math.max(0, pct));
}

function syncClosingPercentToStage(els: Elements, stageIndex: number, showDemo: boolean = false): void {
  els.form.closingPercent.value = String(stageAutoClosingPercent(stageIndex, showDemo));
  updateClosingPercentBar(els.form);
}

/** Índice de etapa CRM 0..5 desde GET /api/audit (-1 = sin dato). */
let crmOpportunityStageIndexFromApi = -1;

/** Progreso mostrado en stepper / barra: prioriza `opportunity_stage` de la API. */
let stepperPreviousProgressIndex: number | null = null;

function historyMaxStageIndex(history: readonly StageEntry[]): number {
  let m = -1;
  for (const e of history) {
    const ix = STAGES.findIndex((s) => s.id === mapLegacyStageIdToCurrent(e.stageId));
    if (ix > m) m = ix;
  }
  return m;
}

function effectiveProgressIndex(state: AppState): number {
  const h = historyMaxStageIndex(state.history);
  const byApi = crmOpportunityStageIndexFromApi;
  const ds = (state.draft.documentStatus ?? '').trim();
  const byDocumentStatus = ds === 'cerrado_ganado' || ds === 'cerrado_perdido' || ds === 'pausa' ? 4 : -1;
  const best = Math.max(h, byApi, byDocumentStatus);
  // Si no hay historial, pero empezamos en la etapa 1, el progreso efectivo es 0 (Asignación completada)
  if (best < 0 && state.currentStageIndex > 0) {
    return 0;
  }
  return Math.max(0, best);
}

/** Tope del embudo alcanzado (para saber qué etapa sigue editable). */
function furthestReachedStageIndex(state: AppState): number {
  // Para edición usamos solo historial local del lead activo.
  // El `opportunity_stage` de auditoría puede venir adelantado y no debe bloquear
  // el registro manual de feedback en etapas previas pendientes.
  return historyMaxStageIndex(state.history);
}

function isCurrentStageEditable(state: AppState): boolean {
  // Las etapas automáticas (ej. Asignación) nunca son editables por el asesor.
  const stage = STAGES[state.currentStageIndex];
  if (stage?.autoOnly) return false;
  const f = furthestReachedStageIndex(state);
  // La etapa actual es editable si es la más lejana alcanzada o si está más allá.
  return state.currentStageIndex >= f;
}

function mergeLoadedCacheFromStateHistory(state: AppState, oppKey: string): void {
  const needle = oppKey.trim().toLowerCase();
  if (!needle) return;
  for (const e of state.history) {
    const sn = (e.snapshot.opportunityNumber ?? '').trim().toLowerCase();
    const sc = (e.snapshot.clientId ?? '').trim().toLowerCase();
    if (sn !== needle && sc !== needle) continue;
    const targetId = mapLegacyStageIdToCurrent(e.stageId);
    loadedStageDataCache[targetId] = {
      ...(loadedStageDataCache[targetId] ?? {}),
      ...e.snapshot.stageData,
    };
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
    if (mapLegacyStageIdToCurrent(e.stageId) !== sid) continue;
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
  submitStatus: HTMLElement;
  stageQuestionsPanel: HTMLElement;
  stageQuestionsTitle: HTMLElement;
  stageQuestionsContainer: HTMLElement;
  btnSubmitStage: HTMLButtonElement;
  clientGate: HTMLElement;
  appWorkspace: HTMLElement;
  gateClientId: HTMLInputElement;
  gateContinue: HTMLButtonElement;
  gateHint: HTMLElement;
  gateError: HTMLElement;
  btnChangeClientId: HTMLButtonElement;
  pageHeader: HTMLElement;
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
    submitStatus: q('submit-status'),
    stageQuestionsPanel: q('stage-questions-panel'),
    stageQuestionsTitle: q('stage-questions-title'),
    stageQuestionsContainer: q('stage-questions-container'),
    btnSubmitStage: q<HTMLButtonElement>('btn-submit-stage'),
    clientGate: q('client-id-gate'),
    appWorkspace: q('app-workspace'),
    gateClientId: q<HTMLInputElement>('gate-client-id'),
    gateContinue: q<HTMLButtonElement>('gate-continue'),
    gateHint: q('gate-hint'),
    gateError: q('gate-error'),
    btnChangeClientId: q<HTMLButtonElement>('btn-change-client-id'),
    pageHeader: q('app-page-header'),
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

/** Historial: mismo criterio que el número de oportunidad / client_id. */
function syncHistorySearchWithOpportunity(els: Elements, state: AppState): void {
  const n = els.form.opportunityNumber.value.trim();
  if (!n) return;
  els.historyOpportunitySearch.value = n;
  void paintHistoryTable(els, state);
}

async function validateClientExists(clientId: string): Promise<boolean> {
  if (!clientId.trim()) {
    return false;
  }
  try {
    const response = await apiFetch(`/api/opportunity?number=${encodeURIComponent(clientId)}`);
    // Si la respuesta es OK (200), el cliente existe. Si es 404, no existe.
    return response.ok;
  } catch (error) {
    console.error('Error validando el cliente:', error);
    return false;
  }
}


async function applyClientIdAndOpenWorkspace(
  els: Elements,
  state: AppState,
  rawId: string,
): Promise<AppState> {
  try {
    const id = normalizeLeadIdInput(rawId);
    if (!id) {
      els.gateHint.textContent = 'Escribe el ID del lead para continuar.';
      return state;
    }
    if (!isValidLeadIdFormat(id)) {
      els.gateHint.textContent = 'El ID del lead debe ser LD seguido de números (ej. LD123).';
      return state;
    }
    els.gateHint.textContent = '';
    sessionStorage.setItem(SESSION_CLIENT_KEY, id);
    els.gateClientId.value = id;

    // Construir un estado limpio SOLO con las entradas del historial que pertenecen a este lead.
    // Esto evita que el historial global del servidor (singleton) bloquee en read-only etapas
    // de un lead que en realidad aún no las ha completado.
    const needle = id.trim().toLowerCase();
    const leadHistory = state.history.filter((e) => {
      const sn = (e.snapshot.opportunityNumber ?? '').trim().toLowerCase();
      const sc = (e.snapshot.clientId ?? '').trim().toLowerCase();
      return sn === needle || sc === needle;
    });
    let s: AppState = { draft: {}, history: leadHistory, currentStageIndex: 1 };

    // Limpiar completamente el formulario antes de escribir los datos del nuevo lead.
    clearLookupAutofillFields(els);
    els.form.opportunityNumber.value = id;
    ensureDefaultDates(els);
    setGateVisibility(els, false);

    opportunityLookupLastKey = '';
    mergeLoadedCacheFromStateHistory(s, id);
    s = await lookupOpportunityAndFill(els, s);
    s = persistDraft(els, s);
    fullRender(els, s);
    syncHistorySearchWithOpportunity(els, s);
    return s;
  } catch (error) {
    console.error('ERROR FATAL AL ABRIR EL WORKSPACE:', error);
    els.gateError.textContent = 'Ocurrió un error al cargar el formulario. Revisa la consola.';
    els.gateError.style.display = 'block';
    els.gateContinue.disabled = false;
    els.gateContinue.textContent = 'Continuar al formulario';
    els.gateClientId.disabled = false;
    return state;
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
let stageSubmitInFlight = false;

function fillIfEmpty(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  if (input.value.trim() !== '') return;
  if (!value.trim()) return;
  input.value = value;
}

/** Limpia TODOS los campos del formulario principal para que no queden datos de otro lead. */
function clearLookupAutofillFields(els: Elements): void {
  els.form.clientName.value = '';
  els.form.clientEmail.value = '';
  els.form.clientPhone.value = '';
  els.form.sellerName.value = '';
  els.form.territory.value = '';
  els.form.notes.value = '';
  els.form.relatedDocNumber.value = '';
  els.form.opportunityStartDate.value = '';
  els.form.opportunityClosingDate.value = '';
els.form.documentStatus.value = 'abierto';
  els.form.totalInvoiceAmount.value = '';
  els.form.closingPercent.value = '0';
  updateClosingPercentBar(els.form);
}

/** Nombres de asesor conocidos en `audits` (documentado: GET /api/metrics/lista-asesores). */
async function refreshSellerNameDatalist(): Promise<void> {
  const dl = document.getElementById('seller-name-list');
  if (!dl || !(dl instanceof HTMLDataListElement)) return;
  if (dl.options.length > 0) return; // Evita recargas innecesarias en HMR
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
      // CRM con 6 etapas: construcción (3) y envío (4) → una sola etapa UI «Propuesta» (índice 2).
      if (stn <= 2) crmOpportunityStageIndexFromApi = stn - 1;
      else if (stn <= 4) crmOpportunityStageIndexFromApi = 2;
      else if (stn === 5) crmOpportunityStageIndexFromApi = 3;
      else crmOpportunityStageIndexFromApi = 4;
    }
    // Campos que /api/opportunity puede haber llenado: solo rellenar si están vacíos
    fillIfEmpty(els.form.clientName, String(a.client_name ?? ''));
    fillIfEmpty(els.form.clientEmail, String(a.client_email ?? ''));
    fillIfEmpty(els.form.clientPhone, String(a.client_phone ?? ''));
    fillIfEmpty(els.form.sellerName, String(a.advisor_name ?? ''));
    // Campos exclusivos de la auditoría: asignar siempre si hay valor
    const st = isoDatetimeToDateInputValue(a.start_time as string | undefined);
    const en = isoDatetimeToDateInputValue(a.end_time as string | undefined);
    if (st) els.form.opportunityStartDate.value = st;
    if (en) els.form.opportunityClosingDate.value = en;
    if (a.country) els.form.territory.value = String(a.country);
    if (a.description) els.form.notes.value = String(a.description);
    if (a.id != null && String(a.id).trim() !== '') {
      els.form.relatedDocNumber.value = String(a.id);
    }
    // Poblar cache de etapas con los datos reales guardados en la API.
    populateStageCacheFromAudit(a);
  } catch {
    crmOpportunityStageIndexFromApi = -1;
  }
}

/** Cache local de datos de etapa cargados desde BD (por oportunidad). */
let loadedStageDataCache: Record<string, Record<string, string>> = {};

/**
 * Mapeo: número de etapa CRM (1-6) → stageId del formulario.
 * CRM 3 y 4 (construcción/envío propuesta) comparten la UI de Propuesta.
 */
const CRM_STAGE_NUM_TO_ID: Record<number, string> = {
  2: 'reunion',
  3: 'propuesta',
  4: 'propuesta',
  5: 'seguimiento',
  6: 'cierre',
};

/**
 * Lee el objeto `audit` de la API y rellena `loadedStageDataCache` con los datos
 * reales guardados por etapa, para que al navegar a una etapa pasada se vean los campos.
 * Fuente primaria: `stage_feedback_json` (contiene los stageData exactos del formulario).
 * Fallback: reconstruye desde campos específicos de la API (advisor_feedback, propuesta, seguimiento).
 */
function populateStageCacheFromAudit(audit: Record<string, unknown>): void {
  // --- Fuente primaria: stage_feedback_json ---
  const sfj = audit.stage_feedback_json;
  if (sfj && typeof sfj === 'object') {
    for (const [numStr, data] of Object.entries(sfj as Record<string, unknown>)) {
      const stageId = CRM_STAGE_NUM_TO_ID[Number(numStr)];
      if (!stageId || !data || typeof data !== 'object') continue;
      loadedStageDataCache[stageId] = {
        ...(loadedStageDataCache[stageId] ?? {}),
        ...(data as Record<string, string>),
      };
    }
  }

  // --- Fallback reunión: advisor_feedback + start_time ---
  if (!loadedStageDataCache.reunion?.temas_tratados) {
    const fb = String(audit.advisor_feedback ?? '').trim();
    const st = isoDatetimeToDateInputValue(audit.start_time as string | undefined);
    if (fb || st) {
      loadedStageDataCache.reunion = {
        ...(loadedStageDataCache.reunion ?? {}),
        ...(fb ? { temas_tratados: fb } : {}),
        ...(st ? { fecha_reunion: st } : {}),
      };
    }
  }

  // --- Fallback propuesta: objeto propuesta ---
  const prop = audit.propuesta;
  if (prop && typeof prop === 'object' && !loadedStageDataCache.propuesta?.productos_propuestos) {
    const p = prop as Record<string, unknown>;
    loadedStageDataCache.propuesta = {
      ...(loadedStageDataCache.propuesta ?? {}),
      ...(p.resumen_general ? { productos_propuestos: String(p.resumen_general) } : {}),
      ...(p.tipo_propuesta ? { tipo_solucion: String(p.tipo_propuesta) } : {}),
      ...(p.equipos ? { modelo_equipo_propuesto: String(p.equipos) } : {}),
      ...(p.cantidad_oferta
        ? { valor_propuesta: String(p.cantidad_oferta).replace(/[^0-9.]/g, '') }
        : {}),
    };
  }

  // --- Fallback seguimiento/cierre: objeto seguimiento ---
  const seg = audit.seguimiento;
  if (seg && typeof seg === 'object') {
    const s = seg as Record<string, unknown>;
    const rv = String(s.resultado_venta ?? '').trim();

    if (rv && !loadedStageDataCache.seguimiento?.proximo_paso) {
      loadedStageDataCache.seguimiento = {
        ...(loadedStageDataCache.seguimiento ?? {}),
        ...(s.resumen_general ? { proximo_paso: String(s.resumen_general) } : {}),
        ...(s.motivo_perdida ? { objeciones: String(s.motivo_perdida) } : {}),
        nivel_avance:
          s.cliente_interesado && s.cliente_ha_negociado ? 'muy_cerca' :
          s.cliente_interesado ? 'estancado' :
          'en_riesgo',
      };
    }

    if ((rv === 'cerrada' || rv === 'perdida') && !loadedStageDataCache.cierre?.resultado_cierre) {
      const resultadoCierre =
        rv === 'cerrada' ? 'ganado' :
        rv === 'perdida' ? 'perdido' :
        'en_pausa';
      loadedStageDataCache.cierre = {
        ...(loadedStageDataCache.cierre ?? {}),
        resultado_cierre: resultadoCierre,
        ...(s.resumen_general ? { razon_cierre: String(s.resumen_general) } : {}),
        ...(s.motivo_perdida ? { razon_cierre: String(s.motivo_perdida) } : {}),
      };
    }
  }
}

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
        const targetId = mapLegacyStageIdToCurrent(String(sid));
        byStage[targetId] = { ...(byStage[targetId] ?? {}), ...sd };
      }
    }
    return byStage;
  } catch {
    return {};
  }
}

async function lookupOpportunityAndFill(els: Elements, state: AppState): Promise<AppState> {
  const key = normalizeOpportunityKey(els.form.opportunityNumber.value);
  if (key !== els.form.opportunityNumber.value) {
    els.form.opportunityNumber.value = key;
  }
  if (!key) {
    opportunityLookupLastKey = '';
    crmOpportunityStageIndexFromApi = -1;
    return state;
  }
  if (key === opportunityLookupLastKey) return state;
  opportunityLookupLastKey = key;
  clearLookupAutofillFields(els);

  try {
    const r = await apiFetch(`/api/opportunity?number=${encodeURIComponent(key)}`);
    if (r.ok) {
      const d = (await r.json()) as OpportunityDirectory;
      if (d && typeof d === 'object') {
        els.form.clientName.value = d.clientName ?? '';
        els.form.clientEmail.value = d.clientEmail ?? '';
        els.form.clientPhone.value = d.clientPhone ?? '';
        els.form.sellerName.value = d.sellerName ?? '';
      }
    }
  } catch {
    /* ignore */
  }

  await fillFromLatestAuditByClientId(els, key);
  // Guardar datos del audit (fuente de verdad) antes de que loadAllStageData sobreescriba el cache.
  const auditStageCache = { ...loadedStageDataCache };
  // Cargar cache del blob /api/state como base de compatibilidad.
  const stateCache = await loadAllStageData(key);
  // Combinar: estado del blob como base, datos del audit encima (el audit siempre gana).
  loadedStageDataCache = { ...stateCache };
  for (const [sid, auditData] of Object.entries(auditStageCache)) {
    loadedStageDataCache[sid] = { ...(loadedStageDataCache[sid] ?? {}), ...auditData };
  }
  mergeLoadedCacheFromStateHistory(state, key);

  // Guardar los valores llenados por la API antes de que writeOpportunityForm
  // pueda sobreescribirlos con un snapshot local que puede tener datos vacíos
  // (guardado cuando los 304 impedían el autocompletado correcto).
  const apiFilledClientName = els.form.clientName.value;
  const apiFilledClientEmail = els.form.clientEmail.value;
  const apiFilledClientPhone = els.form.clientPhone.value;
  const apiFilledSellerName = els.form.sellerName.value;
  const apiFilledTerritory = els.form.territory.value;
  const apiFilledNotes = els.form.notes.value;
  const apiFilledStartDate = els.form.opportunityStartDate.value;
  const apiFilledClosingDate = els.form.opportunityClosingDate.value;

  if (crmOpportunityStageIndexFromApi >= 0) {
    const tIdx = crmOpportunityStageIndexFromApi;
    const snap = latestSnapshotForStageIndex(state.history, key, tIdx);
    state = { ...state, currentStageIndex: tIdx };
    if (snap) {
      state = { ...state, draft: snap };
      writeOpportunityForm(els.form, snap);
    } else {
      const st = STAGES[tIdx];
      const sd = st ? loadedStageDataCache[st.id] ?? {} : {};
      state = { ...state, draft: { ...state.draft, stageData: { ...sd } } };
    }
  } else {
    // La API no informó etapa: mover a Reunión si estamos en Asignación (etapa automática).
    if (STAGES[state.currentStageIndex]?.autoOnly) {
      state = { ...state, currentStageIndex: 1 };
    }
    const cur = STAGES[state.currentStageIndex];
    if (cur && loadedStageDataCache[cur.id]) {
      state = { ...state, draft: { ...state.draft, stageData: loadedStageDataCache[cur.id] ?? {} } };
    }
  }

  // Restaurar los datos que vienen de la API: tienen prioridad sobre el snapshot local.
  if (apiFilledClientName) els.form.clientName.value = apiFilledClientName;
  if (apiFilledClientEmail) els.form.clientEmail.value = apiFilledClientEmail;
  if (apiFilledClientPhone) els.form.clientPhone.value = apiFilledClientPhone;
  if (apiFilledSellerName) els.form.sellerName.value = apiFilledSellerName;
  if (apiFilledTerritory) els.form.territory.value = apiFilledTerritory;
  if (apiFilledNotes) els.form.notes.value = apiFilledNotes;
  if (apiFilledStartDate) els.form.opportunityStartDate.value = apiFilledStartDate;
  if (apiFilledClosingDate) els.form.opportunityClosingDate.value = apiFilledClosingDate;

  return state;
}

const OPP_SEQ_KEY = 'formulario-leads-opp-seq';

function nextLocalOpportunityNumber(): string {
  let n = parseInt(localStorage.getItem(OPP_SEQ_KEY) || '0', 10);
  if (!Number.isFinite(n) || n < 0) n = 0;
  n += 1;
  localStorage.setItem(OPP_SEQ_KEY, String(n));
  return `${LEAD_ID_PREFIX}${n}`;
}

async function assignOpportunityNumberIfMissing(els: Elements): Promise<void> {
  if (opportunityAutoNumberInFlight) return;
  if (els.form.opportunityNumber.value.trim()) return;
  // Si aún no hay nombre de oportunidad, no asignamos número.
  if (!els.form.clientName.value.trim()) return;
  opportunityAutoNumberInFlight = true;
  try {
    const id = nextLocalOpportunityNumber();
    if (!els.form.opportunityNumber.value.trim()) {
      els.form.opportunityNumber.value = id;
    }
  } finally {
    opportunityAutoNumberInFlight = false;
  }
}

function updateStagePanel(els: Elements, state: AppState, readOnly: boolean): void {
  const s = STAGES[state.currentStageIndex];
  if (!s) return;
  els.stageTitle.textContent = s.label;
  const prog = effectiveProgressIndex(state);
  const showDemo = loadedStageDataCache.reunion?.requiere_demo === 'si';
  const stageCount = getStageCount(showDemo);
  let badgeText: string;
  if (s.autoOnly) {
    badgeText = `Etapa automática · CRM paso ${prog + 1}`;
  } else if (readOnly) {
    badgeText = `Revisión paso ${state.currentStageIndex + 1} · CRM paso ${prog + 1}`;
  } else {
    badgeText = `Paso ${state.currentStageIndex + 1} de ${stageCount} · Avance CRM ${prog + 1}/${stageCount}`;
  }
  els.stageBadge.textContent = badgeText;
  els.stageBadge.className = `inline-flex w-fit items-center rounded-sm border-2 border-white px-3 py-1 text-xs font-bold uppercase tracking-wide text-white ${s.color}`;

  // Actualizar campo Estado dinámicamente según la etapa
  const statusSelect = els.form.documentStatus;
  statusSelect.innerHTML = '';
  const statusOptions: Record<string, string> = {
    asignacion: 'Abierto',
    reunion: 'En reunión',
    demo: 'En demo',
    propuesta: 'Propuesta enviada',
    seguimiento: 'En seguimiento',
    cierre: 'En cierre',
  };
  const opt = document.createElement('option');
  opt.value = s.id;
  opt.textContent = statusOptions[s.id] || s.label;
  statusSelect.appendChild(opt);
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

  if (stage.autoOnly) {
    // Etapa automática: ocultar el panel de preguntas y expandir el formulario a una sola columna.
    els.stageQuestionsPanel.classList.add('hidden');
    els.leadGrid.style.gridTemplateColumns = '1fr';
    els.stageQuestionsContainer.innerHTML = '';
    return;
  }

  // Etapa normal: mostrar el panel y restaurar el grid de dos columnas.
  els.stageQuestionsPanel.classList.remove('hidden');
  els.leadGrid.style.gridTemplateColumns = '';

  let qTitle: string;
  if (readOnly) {
    qTitle = `Preguntas — ${stage.label} (solo lectura)`;
  } else {
    qTitle = `Preguntas — ${stage.label}`;
  }
  els.stageQuestionsTitle.textContent = qTitle;
  const stageData = state.draft.stageData ?? loadedStageDataCache[stage.id] ?? {};
  renderStageQuestions(els.stageQuestionsContainer, stage.id, stageData, readOnly);
}

function applyStageViewLock(els: Elements, state: AppState): void {
  const ro = !isCurrentStageEditable(state);
  setLeadFormFieldsReadonly(els.form, ro);
  els.advanceNext.disabled = ro;
  els.btnSubmitStage.disabled = ro;
  els.btnReset.disabled = ro;
  // Solo aplicar opacidad si el panel está visible (etapas no automáticas).
  const stage = STAGES[state.currentStageIndex];
  if (!stage?.autoOnly) {
    els.stageQuestionsPanel.classList.toggle('opacity-95', ro);
  }
}

function fullRender(els: Elements, state: AppState): void {
  const progressIdx = effectiveProgressIndex(state);
  const showDemo = loadedStageDataCache.reunion?.requiere_demo === 'si';
  syncClosingPercentToStage(els, progressIdx, showDemo);
  const ro = !isCurrentStageEditable(state);
  renderStepper(
    els.stepper,
    state.currentStageIndex,
    progressIdx,
    stepperPreviousRenderedIndex,
    stepperPreviousProgressIndex,
    showDemo,
  );
  stepperPreviousRenderedIndex = state.currentStageIndex;
  stepperPreviousProgressIndex = progressIdx;
  updateStagePanel(els, state, ro);
  renderCurrentStageQuestions(els, state, ro);
  applyStageViewLock(els, state);
  syncDocumentStatusWithCurrentStage(els, state);
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
  if (!els.form.opportunityClosingDate.value) {
    els.form.opportunityClosingDate.value = todayIsoDate();
  }
}

/** Alinea Estado con la etapa Cierre (y revierte "Cierre" al salir de esa etapa). */
function syncDocumentStatusWithCurrentStage(els: Elements, state: AppState): void {
  const stage = STAGES[state.currentStageIndex];
  if (!stage) return;
  const sel = els.form.documentStatus;
  const cur = sel.value;
  if (stage.id === 'cierre') {
    if (cur !== 'cerrado_ganado' && cur !== 'cerrado_perdido' && cur !== 'pausa') {
      sel.value = 'cierre';
    }
    return;
  }
  if (cur === 'cierre') {
    sel.value = 'abierto';
  }
}

function mapResultadoCierreToDocumentStatus(resultado: string): string | null {
  if (resultado === 'ganado') return 'cerrado_ganado';
  if (resultado === 'perdido') return 'cerrado_perdido';
  if (resultado === 'en_pausa') return 'pausa';
  return null;
}

function resolveLeadOrigin(snapshot: OpportunityForm): string {
  const direct = String(snapshot.stageData?.lead_origen ?? '').trim();
  if (direct) return direct;
  const cached = String(loadedStageDataCache.asignacion?.lead_origen ?? '').trim();
  if (cached) return cached;
  return 'web';
}

/**
 * Sincroniza el envío de una etapa con el endpoint específico de la API.
 * La tabla `audits` es la fuente de verdad del dashboard y las métricas.
 * Cada etapa escribe en el campo correcto para que:
 *  - Reunión   → `advisor_feedback_at` se setea, el auditor deja de alertar
 *  - Propuesta → `propuesta` alimenta métricas de propuestas por rubro
 *  - Seguimiento/Cierre → `resultado_venta` + `motivo_perdida` alimentan ventas/motivos
 */
async function syncStageToApi(
  snapshot: OpportunityForm,
  stage: { id: StageId; label: string },
  stageData: Record<string, string>,
): Promise<void> {
  const clientId = normalizeOpportunityKey(snapshot.opportunityNumber);
  if (!clientId) return;

  const base = `/api/audit/client/${encodeURIComponent(clientId)}`;
  const json = (body: unknown) => ({
    method: 'PATCH' as const,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const jsonPut = (body: unknown) => ({ ...json(body), method: 'PUT' as const });

  try {
    switch (stage.id) {
      case 'reunion': {
        // PATCH .../retroalimentacion — setea advisor_feedback_at, detiene alertas del auditor.
        const feedbackText = [
          stageData.temas_tratados,
          stageData.productos_ofrecidos,
          stageData.asistentes_reunion,
        ].filter(Boolean).join(' | ') || 'Reunión completada';
        await apiFetch(`${base}/retroalimentacion`, json({
          stage: 2,
          retroalimentacion: feedbackText,
          notes: snapshot.notes || '',
          stage_feedback_json: { 2: stageData },
        }));
        break;
      }

      case 'demo': {
        const feedbackText = [
          stageData.comentario_demo,
          stageData.resultado_cobertura,
        ].filter(Boolean).join(' | ') || 'Demo completada';
        await apiFetch(`${base}/retroalimentacion`, json({
          stage: 3,
          retroalimentacion: feedbackText,
          notes: snapshot.notes || '',
          stage_feedback_json: { 3: stageData },
        }));
        break;
      }

      case 'propuesta': {
        const equiposDesc = [
          stageData.modelo_equipo_propuesto,
          stageData.cantidad_equipos ? `x${stageData.cantidad_equipos}` : '',
        ].filter(Boolean).join(' ');
        const rubro = loadedStageDataCache.asignacion?.industria_sector
          ?? stageData.industria_sector
          ?? '';
        const hasDemo = loadedStageDataCache.reunion?.requiere_demo === 'si';
        const proposalStage = hasDemo ? 4 : 3;
        await apiFetch(`${base}/propuesta`, jsonPut({
          resumen_general: stageData.productos_propuestos || snapshot.notes || 'Sin resumen',
          tipo_propuesta: stageData.tipo_solucion || '',
          equipos: equiposDesc,
          rubro,
          cantidad_oferta: stageData.valor_propuesta
            ? `$${stageData.valor_propuesta}`
            : '',
          stage_feedback_json: { [proposalStage]: stageData },
        }));
        break;
      }

      case 'seguimiento': {
        const nivelAvance = stageData.nivel_avance ?? '';
        const clienteInteresado = nivelAvance !== 'en_riesgo';
        const clienteHaNegociado = ['muy_cerca', 'en_negociacion'].includes(nivelAvance);
        const hasDemo = loadedStageDataCache.reunion?.requiere_demo === 'si';
        const segStage = hasDemo ? 5 : 4;
        await apiFetch(`${base}/seguimiento`, jsonPut({
          resultado_venta: 'en_seguimiento',
          resumen_general: stageData.proximo_paso || stageData.tema_seguimiento || '',
          cliente_interesado: clienteInteresado,
          cliente_ha_negociado: clienteHaNegociado,
          motivo_perdida: stageData.objeciones || '',
          stage_feedback_json: { [segStage]: stageData },
        }));
        break;
      }

      case 'cierre': {
        const resultadoCierre = stageData.resultado_cierre ?? '';
        const resultadoVenta =
          resultadoCierre === 'ganado' ? 'cerrada' :
          resultadoCierre === 'perdido' ? 'perdida' :
          'en_seguimiento';
        const motivoPerdida = resultadoVenta === 'perdida'
          ? (stageData.razon_cierre || stageData.objeciones || 'Sin motivo especificado')
          : '';
        const hasDemo = loadedStageDataCache.reunion?.requiere_demo === 'si';
        const closeStage = hasDemo ? 6 : 5;
        await apiFetch(`${base}/seguimiento`, jsonPut({
          resultado_venta: resultadoVenta,
          motivo_perdida: motivoPerdida,
          resumen_general: stageData.razon_cierre || '',
          cliente_interesado: resultadoVenta === 'cerrada',
          cliente_ha_negoiciado: true,
          stage_feedback_json: { [closeStage]: stageData },
        }));
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.warn('[syncStageToApi] Error sincronizando etapa', stage.id, err);
  }
}

export async function mountApp(): Promise<void> {
  const els = queryElements();
  let state: AppState = await loadState();

  void refreshSellerNameDatalist();

  const urlClientId = readUrlClientIdParam();
  const sessionId = (sessionStorage.getItem(SESSION_CLIENT_KEY) ?? '').trim();
  const draftOpp = (state.draft.opportunityNumber ?? '').trim();
  const suggestedId = (urlClientId || sessionId || draftOpp).trim();


  setGateVisibility(els, true);
  requestAnimationFrame(() => els.gateClientId.focus());

  els.gateContinue.addEventListener('click', async () => {
    const clientId = normalizeLeadIdInput(els.gateClientId.value);
    els.gateClientId.value = clientId;

    // Reset states
    els.gateError.style.display = 'none';
    els.gateClientId.classList.remove('shake-animation', 'input-error', 'input-success');
    els.gateHint.textContent = '';

    if (!clientId) {
      els.gateError.textContent = 'Por favor, escribe un ID de lead.';
      els.gateError.style.display = 'block';
      els.gateClientId.classList.add('shake-animation', 'input-error');
      els.gateClientId.focus();
      return;
    }

    if (!isValidLeadIdFormat(clientId)) {
      els.gateError.textContent = 'El ID del lead debe ser LD seguido de números (ej. LD123).';
      els.gateError.style.display = 'block';
      els.gateClientId.classList.add('shake-animation', 'input-error');
      els.gateClientId.focus();
      return;
    }

    // Show loading state
    els.gateContinue.disabled = true;
    els.gateContinue.textContent = 'Verificando...';
    els.gateClientId.disabled = true;

    const clientExists = await validateClientExists(clientId);

    if (clientExists) {
      // Success state
      els.gateClientId.classList.add('input-success');
      els.gateHint.textContent = 'Lead encontrado. Abriendo formulario...';

      // Wait a bit so the user can see the success message
      await new Promise(resolve => setTimeout(resolve, 800));

      // Await the workspace opening and get the new state
      state = await applyClientIdAndOpenWorkspace(els, state, clientId);

      // The function above now handles showing the workspace, so we just reset the button
      // for the next time the user might come back to this screen.
      els.gateContinue.disabled = false;
      els.gateContinue.textContent = 'Continuar al formulario';
      els.gateClientId.disabled = false;
    } else {
      // Failure state
      els.gateContinue.disabled = false;
      els.gateContinue.textContent = 'Continuar al formulario';
      els.gateClientId.disabled = false;

      els.gateError.textContent = 'No hay un lead con ese ID. Verifica el dato.';
      els.gateError.style.display = 'block';
      els.gateClientId.classList.add('shake-animation', 'input-error');
      els.gateClientId.focus();
    }
  });
  els.gateClientId.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      els.gateContinue.click();
    }
  });
  els.btnChangeClientId.addEventListener('click', () => {
    sessionStorage.removeItem(SESSION_CLIENT_KEY);
    const prev = normalizeLeadIdInput(els.form.opportunityNumber.value);
    setGateVisibility(els, true);
    els.gateClientId.value = prev;
    els.gateHint.textContent = prev
      ? 'Puedes confirmar el mismo identificador o escribir otro. Pulsa Continuar.'
      : 'Escribe el identificador del lead.';
    void els.gateClientId.focus();
  });

  /** Solo mayúsculas al escribir; normalizar prefijo LD al salir o al pulsar Continuar. */
  els.gateClientId.addEventListener('input', () => {
    els.gateClientId.value = els.gateClientId.value.toUpperCase();
  });
  els.gateClientId.addEventListener('blur', () => {
    const v = els.gateClientId.value.trim();
    if (!v) return;
    els.gateClientId.value = normalizeLeadIdInput(v);
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
    els.form.opportunityNumber,
    els.form.documentStatus,
    els.form.opportunityStartDate,
    els.form.opportunityClosingDate,
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
      void lookupOpportunityAndFill(els, state).then((s) => {
        state = s;
        state = persistDraft(els, state);
        syncHistorySearchWithOpportunity(els, state);
        fullRender(els, state);
      });
    }, 300);
  };

  els.form.opportunityNumber.addEventListener('change', doOpportunityLookup);

  els.form.opportunityNumber.addEventListener('input', () => {
    els.form.opportunityNumber.value = els.form.opportunityNumber.value.toUpperCase();
  });

  els.form.opportunityNumber.addEventListener('blur', () => {
    const v = els.form.opportunityNumber.value.trim();
    if (!v) return;
    const next = normalizeLeadIdInput(v);
    if (next !== els.form.opportunityNumber.value) els.form.opportunityNumber.value = next;
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

    // Guardar los campos de identidad del lead antes de cualquier writeOpportunityForm,
    // para que la navegación entre etapas nunca corrompa los datos del cliente actual.
    const savedClientName = els.form.clientName.value;
    const savedClientEmail = els.form.clientEmail.value;
    const savedClientPhone = els.form.clientPhone.value;
    const savedSellerName = els.form.sellerName.value;
    const savedTerritory = els.form.territory.value;
    const savedStartDate = els.form.opportunityStartDate.value;
    const savedClosingDate = els.form.opportunityClosingDate.value;
    const savedNotes = els.form.notes.value;

    if (!nextEditable) {
      const snap = latestSnapshotForStageIndex(nextState.history, opp, idx);
      if (snap) {
        nextState = { ...nextState, draft: cloneSnapshot(snap) };
        writeOpportunityForm(els.form, snap);
      } else if (newStage && loadedStageDataCache[newStage.id]) {
        nextState = {
          ...nextState,
          draft: {
            ...nextState.draft,
            stageData: { ...loadedStageDataCache[newStage.id] },
          },
        };
        writeOpportunityForm(els.form, nextState.draft);
      } else {
        nextState = { ...nextState, draft: { ...nextState.draft, stageData: {} } };
        writeOpportunityForm(els.form, nextState.draft);
      }
    } else {
      const tipSnap = latestSnapshotForStageIndex(nextState.history, opp, idx);
      if (tipSnap) {
        nextState = { ...nextState, draft: cloneSnapshot(tipSnap) };
        writeOpportunityForm(els.form, tipSnap);
      } else if (newStage && loadedStageDataCache[newStage.id]) {
        nextState = {
          ...nextState,
          draft: { ...nextState.draft, stageData: loadedStageDataCache[newStage.id] ?? {} },
        };
        writeOpportunityForm(els.form, nextState.draft);
      } else {
        nextState = { ...nextState, draft: { ...nextState.draft, stageData: {} } };
        writeOpportunityForm(els.form, nextState.draft);
      }
    }

    // Restaurar los campos de identidad del lead: la identidad nunca cambia al navegar etapas.
    if (savedClientName) els.form.clientName.value = savedClientName;
    if (savedClientEmail) els.form.clientEmail.value = savedClientEmail;
    if (savedClientPhone) els.form.clientPhone.value = savedClientPhone;
    if (savedSellerName) els.form.sellerName.value = savedSellerName;
    if (savedTerritory) els.form.territory.value = savedTerritory;
    if (savedStartDate) els.form.opportunityStartDate.value = savedStartDate;
    if (savedClosingDate) els.form.opportunityClosingDate.value = savedClosingDate;
    if (savedNotes) els.form.notes.value = savedNotes;

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
    if (stageSubmitInFlight) return;
    if (!isCurrentStageEditable(state)) return;
    const requiredFields = Array.from(els.leadForm.querySelectorAll('[required]'))
      .filter(f => {
        const details = f.closest('details:not([open])');
        return !details;
      });
    console.log('[submit] required fields count:', requiredFields.length);
    let firstInvalid: Element | null = null;
    for (const field of requiredFields) {
      const valid = (field as HTMLInputElement).checkValidity();
      console.log('[submit] field:', field.id || field.name || field.tagName, 'valid:', valid, 'value:', (field as HTMLInputElement).value);
      if (!valid) {
        firstInvalid = field;
        break;
      }
    }
    if (firstInvalid) {
      console.log('[submit] validation failed, scrolling to:', firstInvalid.id || (firstInvalid as HTMLElement).innerText?.slice(0,30));
      els.leadForm.classList.add('was-validated');
      (firstInvalid as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
      setSubmitStatus(els, 'Completa los campos obligatorios');
      return;
    }

    const stage = STAGES[state.currentStageIndex];
    if (!stage) return;
    const currentStageData = readStageQuestionValues(stage.id);
    // Actualiza cache local para que al cambiar etapa se vean los datos.
    loadedStageDataCache[stage.id] = currentStageData;
    let snapshot = cloneSnapshot(readOpportunityForm(els.form, currentStageData));
    snapshot = {
      ...snapshot,
      opportunityNumber: normalizeOpportunityKey(snapshot.opportunityNumber),
      clientId: normalizeOpportunityKey(snapshot.opportunityNumber),
    };
    els.form.opportunityNumber.value = snapshot.opportunityNumber;
    if (stage.id === 'cierre') {
      const mapped = mapResultadoCierreToDocumentStatus(currentStageData.resultado_cierre ?? '');
      if (mapped) {
        snapshot = { ...snapshot, documentStatus: mapped };
        els.form.documentStatus.value = mapped;
      }
    }

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

    const submittedStageIdx = STAGES.indexOf(stage);
    const showDemo = currentStageData.requiere_demo === 'si';
    const stageCount = getStageCount(showDemo);
    const maxIdx = stageCount - 1;

    if (els.advanceNext.checked && state.currentStageIndex < maxIdx) {
      let nextIdx = state.currentStageIndex + 1;
      if (stage.id === 'reunion' && currentStageData.requiere_demo === 'si') {
        const demoIdx = STAGES.findIndex((s) => s.id === 'demo');
        if (demoIdx > nextIdx) nextIdx = demoIdx;
      }
      state = { ...state, currentStageIndex: nextIdx };
    }

    const advancedToNext = els.advanceNext.checked && state.currentStageIndex > submittedStageIdx;

    stageSubmitInFlight = true;
    els.btnSubmitStage.disabled = true;
    els.btnSubmitStage.classList.add('opacity-60', 'cursor-not-allowed');

    void (async () => {
      try {
        // 1. Primero: sincronizar con la tabla audits (fuente de verdad del dashboard/métricas).
        if (snapshot.opportunityNumber.trim()) {
          await syncStageToApi(snapshot, stage, currentStageData);
        }

        // 2. Luego: persistir estado de UI en /api/state como auxiliar.
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

        if (snapshot.opportunityNumber.trim()) {

          void apiFetch('/api/opportunity', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              opportunityNumber: normalizeOpportunityKey(snapshot.opportunityNumber),
              clientId: normalizeOpportunityKey(snapshot.opportunityNumber),
              validator: resolveLeadOrigin(snapshot),
              origin: resolveLeadOrigin(snapshot),
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
      } finally {
        stageSubmitInFlight = false;
        els.btnSubmitStage.classList.remove('opacity-60', 'cursor-not-allowed');
      }
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
