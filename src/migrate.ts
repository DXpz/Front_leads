import type {
  AppState,
  LegacyGeneralLead,
  LegacyStageEntry,
  OpportunityForm,
  StageEntry,
} from './types';

function num(raw: unknown): number | '' {
  if (raw === '' || raw == null) return '';
  const n = Number(raw);
  return Number.isFinite(n) ? n : '';
}

export const emptySnapshot = (): OpportunityForm => ({
  clientName: '',
  clientEmail: '',
  clientPhone: '',
  sellerName: '',
  totalInvoiceAmount: '',
  territory: '',
  displaySystemCurrency: false,
  opportunityName: '',
  opportunityNumber: '',
  documentStatus: 'abierto',
  opportunityStartDate: '',
  opportunityClosingDate: '',
  openActivitiesCount: '',
  closingPercent: '',
  potentialAmount: '',
  relatedDocClass: '',
  relatedDocNumber: '',
  notes: '',
});

/** Convierte JSON guardado (incl. claves antiguas) a modelo actual. */
export function snapshotFromUnknown(raw: unknown): OpportunityForm {
  const s = emptySnapshot();
  if (!raw || typeof raw !== 'object') return s;
  const r = raw as Record<string, unknown>;
  const str = (k: string, ...fallbacks: string[]) => {
    for (const key of [k, ...fallbacks]) {
      const v = r[key];
      if (typeof v === 'string' && v.trim() !== '') return v.trim();
    }
    return '';
  };

  s.clientName = str('clientName', 'bpName');
  s.clientEmail = str('clientEmail');
  s.clientPhone = str('clientPhone', 'contactPerson');
  s.sellerName = str('sellerName', 'salesEmployee', 'owner');

  s.totalInvoiceAmount = num(r.totalInvoiceAmount);
  s.territory = str('territory');
  s.displaySystemCurrency = Boolean(r.displaySystemCurrency);
  s.opportunityName = str('opportunityName', 'oppName');
  s.opportunityNumber = str('opportunityNumber');
  s.documentStatus = typeof r.documentStatus === 'string' && r.documentStatus ? r.documentStatus : s.documentStatus;
  s.opportunityStartDate = str('opportunityStartDate', 'startDate');
  s.opportunityClosingDate = str('opportunityClosingDate', 'endDate');
  s.openActivitiesCount = num(r.openActivitiesCount);
  s.closingPercent = num(r.closingPercent ?? r.probability);
  s.potentialAmount = num(r.potentialAmount ?? r.amount);
  s.relatedDocClass = str('relatedDocClass');
  s.relatedDocNumber = str('relatedDocNumber');
  s.notes = str('notes');

  return s;
}

function legacyToSnapshot(row: LegacyStageEntry): OpportunityForm {
  const s = emptySnapshot();
  s.opportunityName = row.opportunityName ?? '';
  s.opportunityStartDate = row.startDate ?? '';
  s.opportunityClosingDate = row.endDate ?? '';
  s.sellerName = row.employee ?? '';
  s.notes = row.notes ?? '';
  const p = row.probability;
  s.closingPercent = p != null && p !== '' ? Number(p) : '';
  const a = row.amount;
  s.potentialAmount = a != null && a !== '' ? Number(a) : '';
  return s;
}

function isLegacyHistoryRow(x: unknown): x is LegacyStageEntry {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  return !('snapshot' in o) && 'startDate' in o && 'employee' in o;
}

export function normalizeHistoryRow(x: unknown): StageEntry | null {
  if (typeof x !== 'object' || x === null) return null;
  const o = x as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.stageId !== 'string' || typeof o.createdAt !== 'string') {
    return null;
  }
  if (o.snapshot && typeof o.snapshot === 'object') {
    return {
      id: o.id,
      stageId: o.stageId as StageEntry['stageId'],
      createdAt: o.createdAt,
      snapshot: snapshotFromUnknown(o.snapshot),
    };
  }
  if (isLegacyHistoryRow(x)) {
    return {
      id: o.id,
      stageId: o.stageId as StageEntry['stageId'],
      createdAt: o.createdAt,
      snapshot: legacyToSnapshot(x),
    };
  }
  return null;
}

function migrateDraftFromLegacyGeneral(g: LegacyGeneralLead): Partial<OpportunityForm> {
  const d: Partial<OpportunityForm> = {};
  if (g.oppName != null) d.opportunityName = g.oppName;
  if (g.bpName != null) d.clientName = g.bpName;
  if (g.contact != null) d.clientPhone = g.contact;
  if (g.owner != null) d.sellerName = g.owner;
  if (g.potentialAmount != null) d.potentialAmount = g.potentialAmount;
  return d;
}

type StoredV1 = {
  general?: LegacyGeneralLead;
  history?: unknown[];
  currentStageIndex?: number;
};

export function migrateAppStateFromUnknown(parsed: unknown): AppState {
  if (typeof parsed !== 'object' || parsed === null) {
    return { draft: {}, history: [], currentStageIndex: 0 };
  }
  const o = parsed as Record<string, unknown>;

  if ('draft' in o) {
    const rawDraft = o.draft;
    const draft: Partial<OpportunityForm> =
      rawDraft && typeof rawDraft === 'object' ? snapshotFromUnknown(rawDraft) : {};
    const rawHistory = Array.isArray(o.history) ? o.history : [];
    const history = rawHistory.map(normalizeHistoryRow).filter((x): x is StageEntry => x !== null);
    return {
      draft,
      history,
      currentStageIndex: typeof o.currentStageIndex === 'number' ? o.currentStageIndex : 0,
    };
  }

  const v1 = parsed as StoredV1;
  const historyRaw = Array.isArray(v1.history) ? v1.history : [];
  const history = historyRaw.map(normalizeHistoryRow).filter((x): x is StageEntry => x !== null);
  const draft =
    typeof v1.general === 'object' && v1.general !== null
      ? migrateDraftFromLegacyGeneral(v1.general)
      : {};
  return {
    draft,
    history,
    currentStageIndex: typeof v1.currentStageIndex === 'number' ? v1.currentStageIndex : 0,
  };
}
