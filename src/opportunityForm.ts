import type { OpportunityForm } from './types';

export type OpportunityFormElements = {
  clientName: HTMLInputElement;
  clientEmail: HTMLInputElement;
  clientPhone: HTMLInputElement;
  sellerName: HTMLInputElement;
  totalInvoiceAmount: HTMLInputElement;
  territory: HTMLInputElement;
  displaySystemCurrency: HTMLInputElement;
  opportunityName: HTMLInputElement;
  opportunityNumber: HTMLInputElement;
  documentStatus: HTMLSelectElement;
  opportunityStartDate: HTMLInputElement;
  opportunityClosingDate: HTMLInputElement;
  openActivitiesCount: HTMLInputElement;
  closingPercent: HTMLInputElement;
  closingPercentLabel: HTMLElement;
  closingPercentBar: HTMLElement;
  potentialAmount: HTMLInputElement;
  relatedDocClass: HTMLInputElement;
  relatedDocNumber: HTMLInputElement;
  notes: HTMLTextAreaElement;
};

export function queryOpportunityFormElements(): OpportunityFormElements {
  const q = <T extends HTMLElement>(id: string) => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Missing #${id}`);
    return el as T;
  };
  return {
    clientName: q<HTMLInputElement>('client-name'),
    clientEmail: q<HTMLInputElement>('client-email'),
    clientPhone: q<HTMLInputElement>('client-phone'),
    sellerName: q<HTMLInputElement>('seller-name'),
    totalInvoiceAmount: q<HTMLInputElement>('total-invoice-amount'),
    territory: q<HTMLInputElement>('territory'),
    displaySystemCurrency: q<HTMLInputElement>('display-system-currency'),
    opportunityName: q<HTMLInputElement>('opportunity-name'),
    opportunityNumber: q<HTMLInputElement>('opportunity-number'),
    documentStatus: q<HTMLSelectElement>('document-status'),
    opportunityStartDate: q<HTMLInputElement>('opportunity-start-date'),
    opportunityClosingDate: q<HTMLInputElement>('opportunity-closing-date'),
    openActivitiesCount: q<HTMLInputElement>('open-activities-count'),
    closingPercent: q<HTMLInputElement>('closing-percent'),
    closingPercentLabel: q<HTMLElement>('closing-percent-label'),
    closingPercentBar: q<HTMLElement>('closing-percent-bar'),
    potentialAmount: q<HTMLInputElement>('potential-amount'),
    relatedDocClass: q<HTMLInputElement>('related-doc-class'),
    relatedDocNumber: q<HTMLInputElement>('related-doc-number'),
    notes: q<HTMLTextAreaElement>('opportunity-notes'),
  };
}

function numOrEmpty(v: string): number | '' {
  const t = v.trim();
  if (t === '') return '';
  const n = Number(t);
  return Number.isFinite(n) ? n : '';
}

export function readOpportunityForm(els: OpportunityFormElements): OpportunityForm {
  return {
    clientName: els.clientName.value.trim(),
    clientEmail: els.clientEmail.value.trim(),
    clientPhone: els.clientPhone.value.trim(),
    sellerName: els.sellerName.value.trim(),
    totalInvoiceAmount: numOrEmpty(els.totalInvoiceAmount.value),
    territory: els.territory.value.trim(),
    displaySystemCurrency: els.displaySystemCurrency.checked,
    opportunityName: els.opportunityName.value.trim(),
    opportunityNumber: els.opportunityNumber.value.trim(),
    documentStatus: els.documentStatus.value,
    opportunityStartDate: els.opportunityStartDate.value,
    opportunityClosingDate: els.opportunityClosingDate.value,
    openActivitiesCount: numOrEmpty(els.openActivitiesCount.value),
    closingPercent: numOrEmpty(els.closingPercent.value),
    potentialAmount: numOrEmpty(els.potentialAmount.value),
    relatedDocClass: els.relatedDocClass.value.trim(),
    relatedDocNumber: els.relatedDocNumber.value.trim(),
    notes: els.notes.value.trim(),
  };
}

export function writeOpportunityForm(els: OpportunityFormElements, d: Partial<OpportunityForm>): void {
  const numStr = (v: number | '') => (v === '' ? '' : String(v));
  if (d.clientName !== undefined) els.clientName.value = d.clientName;
  if (d.clientEmail !== undefined) els.clientEmail.value = d.clientEmail;
  if (d.clientPhone !== undefined) els.clientPhone.value = d.clientPhone;
  if (d.sellerName !== undefined) els.sellerName.value = d.sellerName;
  if (d.totalInvoiceAmount !== undefined) els.totalInvoiceAmount.value = numStr(d.totalInvoiceAmount);
  if (d.territory !== undefined) els.territory.value = d.territory;
  if (d.displaySystemCurrency !== undefined) els.displaySystemCurrency.checked = d.displaySystemCurrency;
  if (d.opportunityName !== undefined) els.opportunityName.value = d.opportunityName;
  if (d.opportunityNumber !== undefined) els.opportunityNumber.value = d.opportunityNumber;
  if (d.documentStatus !== undefined) els.documentStatus.value = d.documentStatus;
  if (d.opportunityStartDate !== undefined) els.opportunityStartDate.value = d.opportunityStartDate;
  if (d.opportunityClosingDate !== undefined) els.opportunityClosingDate.value = d.opportunityClosingDate;
  if (d.openActivitiesCount !== undefined) els.openActivitiesCount.value = numStr(d.openActivitiesCount);
  if (d.closingPercent !== undefined) els.closingPercent.value = numStr(d.closingPercent);
  if (d.potentialAmount !== undefined) els.potentialAmount.value = numStr(d.potentialAmount);
  if (d.relatedDocClass !== undefined) els.relatedDocClass.value = d.relatedDocClass;
  if (d.relatedDocNumber !== undefined) els.relatedDocNumber.value = d.relatedDocNumber;
  if (d.notes !== undefined) els.notes.value = d.notes;
  updateClosingPercentBar(els);
}

export function updateClosingPercentBar(els: OpportunityFormElements): void {
  const n = Number(els.closingPercent.value);
  const pct = Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
  els.closingPercentBar.style.width = `${pct}%`;
  els.closingPercentLabel.textContent = Number.isFinite(n) ? `${Math.round(n)}%` : '—';
}

export function bindClosingPercentBar(els: OpportunityFormElements): void {
  els.closingPercent.addEventListener('input', () => updateClosingPercentBar(els));
}
