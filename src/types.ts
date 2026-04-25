export type StageId =
  | 'asignacion'
  | 'reunion'
  | 'demo'
  | 'propuesta'
  | 'seguimiento'
  | 'cierre';

/** Instantánea del formulario (se envía completa en cada etapa). Solo ventas. */
export type OpportunityForm = {
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  sellerName: string;
  totalInvoiceAmount: number | '';
  territory: string;
  displaySystemCurrency: string;
  opportunityName: string;
  opportunityNumber: string;
  /** Misma clave que `client_id` en auditorías cuando alineas CRM y formulario; el historial en API puede filtrar por `clientId` además de `opportunityNumber`. */
  clientId?: string;
  documentStatus: string;
  opportunityStartDate: string;
  opportunityClosingDate: string;
  closingPercent: number | '';
  potentialAmount: number | '';
  relatedDocClass: string;
  relatedDocNumber: string;
  notes: string;
  /** Datos específicos de cada etapa (clave = fieldId, valor = texto). */
  stageData: Record<string, string>;
};

export type StageEntry = {
  id: string;
  stageId: StageId;
  createdAt: string;
  snapshot: OpportunityForm;
};

/** Formato antiguo (antes del formulario unificado). */
export type LegacyStageEntry = {
  id: string;
  stageId: StageId;
  startDate: string;
  endDate: string;
  employee: FormDataEntryValue | null;
  probability: FormDataEntryValue | null;
  amount: FormDataEntryValue | null;
  notes: string;
  createdAt: string;
  opportunityName: string;
};

export type LegacyGeneralLead = {
  oppName?: string;
  bpCode?: string;
  bpName?: string;
  contact?: string;
  owner?: string;
  potentialAmount?: number | '';
};

export type AppState = {
  draft: Partial<OpportunityForm>;
  history: StageEntry[];
  currentStageIndex: number;
};