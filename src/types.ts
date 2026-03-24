export type StageId =
  | 'asignacion'
  | 'reunion'
  | 'seguimiento'
  | 'propuesta'
  | 'cierre';

/** Instantánea del formulario (se envía completa en cada etapa). Solo ventas. */
export type OpportunityForm = {
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  sellerName: string;
  totalInvoiceAmount: number | '';
  territory: string;
  displaySystemCurrency: boolean;
  opportunityName: string;
  opportunityNumber: string;
  documentStatus: string;
  opportunityStartDate: string;
  opportunityClosingDate: string;
  openActivitiesCount: number | '';
  closingPercent: number | '';
  potentialAmount: number | '';
  relatedDocClass: string;
  relatedDocNumber: string;
  notes: string;
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
  employee: string;
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
