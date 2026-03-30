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
  const q = <T extends HTMLElement>(id: string, elementType: string = 'input') => {
    const el = document.getElementById(id);
    if (!el) {
      console.warn(`Elemento #${id} no encontrado. Puede estar en una sección oculta.`);
      // Crear un elemento dummy del tipo correcto para evitar errores
      const dummy = document.createElement(elementType);
      dummy.id = id + '-dummy';
      dummy.className = 'hidden';
      // Para elementos de formulario, establecer valores por defecto
      if (elementType === 'input') {
        (dummy as HTMLInputElement).value = '';
      } else if (elementType === 'select') {
        (dummy as HTMLSelectElement).value = '';
      } else if (elementType === 'textarea') {
        (dummy as HTMLTextAreaElement).value = '';
      }
      // Agregar el elemento dummy al DOM para que esté disponible
      document.body.appendChild(dummy);
      return dummy as unknown as T;
    }
    return el as T;
  };
  return {
    clientName: q<HTMLInputElement>('client-name', 'input'),
    clientEmail: q<HTMLInputElement>('client-email', 'input'),
    clientPhone: q<HTMLInputElement>('client-phone', 'input'),
    sellerName: q<HTMLInputElement>('seller-name', 'input'),
    totalInvoiceAmount: q<HTMLInputElement>('total-invoice-amount', 'input'),
    territory: q<HTMLInputElement>('territory', 'input'),
    displaySystemCurrency: q<HTMLInputElement>('display-system-currency', 'input'),
    opportunityName: q<HTMLInputElement>('opportunity-name', 'input'),
    opportunityNumber: q<HTMLInputElement>('opportunity-number', 'input'),
    documentStatus: q<HTMLSelectElement>('document-status', 'select'),
    opportunityStartDate: q<HTMLInputElement>('opportunity-start-date', 'input'),
    opportunityClosingDate: q<HTMLInputElement>('opportunity-closing-date', 'input'),
    openActivitiesCount: q<HTMLInputElement>('open-activities-count', 'input'),
    closingPercent: q<HTMLInputElement>('closing-percent', 'input'),
    closingPercentLabel: q<HTMLElement>('closing-percent-label', 'span'),
    closingPercentBar: q<HTMLElement>('closing-percent-bar', 'div'),
    potentialAmount: q<HTMLInputElement>('potential-amount', 'input'),
    relatedDocClass: q<HTMLInputElement>('related-doc-class', 'input'),
    relatedDocNumber: q<HTMLInputElement>('related-doc-number', 'input'),
    notes: q<HTMLTextAreaElement>('opportunity-notes', 'textarea'),
  };
}

function numOrEmpty(v: string): number | '' {
  const t = v.trim();
  if (t === '') return '';
  const n = Number(t);
  return Number.isFinite(n) ? n : '';
}

/**
 * Lee el formulario principal. `currentStageData` se inyecta desde app.ts
 * (leído por stageQuestions.ts) para no acoplar este módulo al DOM dinámico.
 */
export function readOpportunityForm(
  els: OpportunityFormElements,
  currentStageData?: Record<string, string>,
): OpportunityForm {
  return {
    clientName: els.clientName.value.trim(),
    clientEmail: els.clientEmail.value.trim(),
    clientPhone: els.clientPhone.value.trim(),
    sellerName: els.sellerName.value.trim(),
    totalInvoiceAmount: numOrEmpty(els.totalInvoiceAmount.value),
    territory: els.territory.value.trim(),
    displaySystemCurrency: els.displaySystemCurrency.type === 'checkbox'
      ? els.displaySystemCurrency.checked
      : els.displaySystemCurrency.value === 'true',
    opportunityName: els.opportunityName.value.trim(),
    opportunityNumber: els.opportunityNumber.value.trim(),
    clientId: (() => {
      const n = els.opportunityNumber.value.trim();
      return n || undefined;
    })(),
    documentStatus: els.documentStatus.value,
    opportunityStartDate: els.opportunityStartDate.value,
    opportunityClosingDate: els.opportunityClosingDate.value,
    openActivitiesCount: numOrEmpty(els.openActivitiesCount.value),
    closingPercent: numOrEmpty(els.closingPercent.value),
    potentialAmount: numOrEmpty(els.potentialAmount.value),
    relatedDocClass: els.relatedDocClass.value.trim(),
    relatedDocNumber: els.relatedDocNumber.value.trim(),
    notes: els.notes.value.trim(),
    stageData: currentStageData ?? {},
  };
}

export function writeOpportunityForm(els: OpportunityFormElements, d: Partial<OpportunityForm>): void {
  const numStr = (v: number | '') => (v === '' ? '' : String(v));
  const isDummyElement = (el: HTMLElement | undefined | null) => el && 'id' in el && el.id && el.id.endsWith('-dummy');
  
  if (d.clientName !== undefined && els.clientName && !isDummyElement(els.clientName) && 'value' in els.clientName) els.clientName.value = d.clientName;
  if (d.clientEmail !== undefined && els.clientEmail && !isDummyElement(els.clientEmail) && 'value' in els.clientEmail) els.clientEmail.value = d.clientEmail;
  if (d.clientPhone !== undefined && els.clientPhone && !isDummyElement(els.clientPhone) && 'value' in els.clientPhone) els.clientPhone.value = d.clientPhone;
  if (d.sellerName !== undefined && els.sellerName && !isDummyElement(els.sellerName) && 'value' in els.sellerName) els.sellerName.value = d.sellerName;
  if (d.totalInvoiceAmount !== undefined && els.totalInvoiceAmount && !isDummyElement(els.totalInvoiceAmount) && 'value' in els.totalInvoiceAmount) els.totalInvoiceAmount.value = numStr(d.totalInvoiceAmount);
  if (d.territory !== undefined && els.territory && !isDummyElement(els.territory) && 'value' in els.territory) els.territory.value = d.territory;
  if (d.displaySystemCurrency !== undefined && els.displaySystemCurrency && !isDummyElement(els.displaySystemCurrency)) {
    if (els.displaySystemCurrency.type === 'checkbox') {
      els.displaySystemCurrency.checked = d.displaySystemCurrency;
    } else {
      els.displaySystemCurrency.value = d.displaySystemCurrency ? 'true' : 'false';
    }
  }
  if (d.opportunityName !== undefined && els.opportunityName && !isDummyElement(els.opportunityName) && 'value' in els.opportunityName) els.opportunityName.value = d.opportunityName;
  if (d.opportunityNumber !== undefined && els.opportunityNumber && !isDummyElement(els.opportunityNumber) && 'value' in els.opportunityNumber) els.opportunityNumber.value = d.opportunityNumber;
  if (d.clientId !== undefined && els.opportunityNumber && !isDummyElement(els.opportunityNumber) && !els.opportunityNumber.value.trim() && d.clientId.trim()) {
    els.opportunityNumber.value = d.clientId.trim();
  }
  if (d.documentStatus !== undefined && els.documentStatus && !isDummyElement(els.documentStatus) && 'value' in els.documentStatus) els.documentStatus.value = d.documentStatus;
  if (d.opportunityStartDate !== undefined && els.opportunityStartDate && !isDummyElement(els.opportunityStartDate) && 'value' in els.opportunityStartDate) els.opportunityStartDate.value = d.opportunityStartDate;
  if (d.opportunityClosingDate !== undefined && els.opportunityClosingDate && !isDummyElement(els.opportunityClosingDate) && 'value' in els.opportunityClosingDate) els.opportunityClosingDate.value = d.opportunityClosingDate;
  if (d.openActivitiesCount !== undefined && els.openActivitiesCount && !isDummyElement(els.openActivitiesCount) && 'value' in els.openActivitiesCount) els.openActivitiesCount.value = numStr(d.openActivitiesCount);
  if (d.closingPercent !== undefined && els.closingPercent && !isDummyElement(els.closingPercent) && 'value' in els.closingPercent) els.closingPercent.value = numStr(d.closingPercent);
  if (d.potentialAmount !== undefined && els.potentialAmount && !isDummyElement(els.potentialAmount) && 'value' in els.potentialAmount) els.potentialAmount.value = numStr(d.potentialAmount);
  if (d.relatedDocClass !== undefined && els.relatedDocClass && !isDummyElement(els.relatedDocClass) && 'value' in els.relatedDocClass) els.relatedDocClass.value = d.relatedDocClass;
  if (d.relatedDocNumber !== undefined && els.relatedDocNumber && !isDummyElement(els.relatedDocNumber) && 'value' in els.relatedDocNumber) els.relatedDocNumber.value = d.relatedDocNumber;
  if (d.notes !== undefined && els.notes && !isDummyElement(els.notes) && 'value' in els.notes) els.notes.value = d.notes;
  updateClosingPercentBar(els);
}

export function updateClosingPercentBar(els: OpportunityFormElements): void {
  if (!els.closingPercent || !('value' in els.closingPercent)) return;
  const n = Number(els.closingPercent.value);
  const pct = Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
  if (els.closingPercentBar && 'style' in els.closingPercentBar) els.closingPercentBar.style.width = `${pct}%`;
  if (els.closingPercentLabel && 'textContent' in els.closingPercentLabel) els.closingPercentLabel.textContent = Number.isFinite(n) ? `${Math.round(n)}%` : '—';
}

const roCls = 'bg-ink-100/40';

/** Modo revisión: bloquea el formulario principal (la API manda el % de avance vía embudo). */
export function setLeadFormFieldsReadonly(els: OpportunityFormElements, readOnly: boolean): void {
  const textLike: HTMLElement[] = [
    els.clientName,
    els.clientEmail,
    els.clientPhone,
    els.sellerName,
    els.totalInvoiceAmount,
    els.territory,
    els.opportunityName,
    els.opportunityNumber,
    els.opportunityStartDate,
    els.opportunityClosingDate,
    els.openActivitiesCount,
    els.closingPercent,
    els.potentialAmount,
    els.relatedDocClass,
    els.relatedDocNumber,
    els.notes,
  ];
  for (const el of textLike) {
    if (el instanceof HTMLSelectElement) {
      el.disabled = readOnly;
    } else if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      el.readOnly = readOnly;
      el.classList.toggle(roCls, readOnly);
    }
  }
  els.documentStatus.disabled = readOnly;
  if (els.displaySystemCurrency.type === 'checkbox') {
    (els.displaySystemCurrency as HTMLInputElement).disabled = readOnly;
    els.displaySystemCurrency.classList.toggle(roCls, readOnly);
  } else {
    (els.displaySystemCurrency as HTMLInputElement).readOnly = readOnly;
    els.displaySystemCurrency.classList.toggle(roCls, readOnly);
  }
}

export function bindClosingPercentBar(els: OpportunityFormElements): void {
  els.closingPercent.addEventListener('input', () => updateClosingPercentBar(els));
}
