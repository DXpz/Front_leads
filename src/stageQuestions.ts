import type { StageId } from './types';

export type FieldType = 'text' | 'textarea' | 'select' | 'date' | 'number' | 'checkbox';

export type StageField = {
  id: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
};

const ASIGNACION_FIELDS: StageField[] = [
  {
    id: 'lead_origen',
    label: 'Origen del lead',
    type: 'select',
    required: true,
    options: [
      { value: '', label: 'Seleccionar…' },
      { value: 'referencia', label: 'Referencia' },
      { value: 'sitio_web', label: 'Sitio web' },
      { value: 'llamada_fria', label: 'Llamada en frío' },
      { value: 'evento', label: 'Evento' },
      { value: 'redes_sociales', label: 'Redes sociales' },
      { value: 'otro', label: 'Otro' },
    ],
  },
  {
    id: 'tomador_decisiones',
    label: 'Tomador de decisiones',
    type: 'text',
    required: true,
    placeholder: 'Nombre del decisor',
  },
  {
    id: 'cargo_decisor',
    label: 'Cargo del decisor',
    type: 'text',
    placeholder: 'Ej. Director, Gerente, Jefe de compras…',
  },
  {
    id: 'sector_industria',
    label: 'Sector / industria',
    type: 'text',
    required: true,
    placeholder: 'Ej. Seguridad, Transporte, Gobierno…',
  },
  {
    id: 'tamano_empresa',
    label: 'Tamaño de la empresa',
    type: 'select',
    options: [
      { value: '', label: 'Seleccionar…' },
      { value: 'micro', label: 'Micro (1-10 empleados)' },
      { value: 'pequena', label: 'Pequeña (11-50)' },
      { value: 'mediana', label: 'Mediana (51-250)' },
      { value: 'grande', label: 'Grande (250+)' },
    ],
  },
  {
    id: 'prioridad_lead',
    label: 'Prioridad del lead',
    type: 'select',
    required: true,
    options: [
      { value: '', label: 'Seleccionar…' },
      { value: 'alta', label: 'Alta' },
      { value: 'media', label: 'Media' },
      { value: 'baja', label: 'Baja' },
    ],
  },
  {
    id: 'competencia_detectada',
    label: 'Competencia detectada',
    type: 'text',
    placeholder: 'Marcas o proveedores actuales del cliente',
  },
  {
    id: 'necesidad_identificada',
    label: 'Necesidad identificada',
    type: 'textarea',
    required: true,
    placeholder: 'Describe la necesidad del cliente',
  },
];

const REUNION_FIELDS: StageField[] = [
  {
    id: 'fecha_reunion',
    label: 'Fecha de la reunión',
    type: 'date',
    required: true,
  },
  {
    id: 'tipo_reunion',
    label: 'Tipo de reunión',
    type: 'select',
    required: true,
    options: [
      { value: '', label: 'Seleccionar…' },
      { value: 'presencial', label: 'Presencial' },
      { value: 'virtual', label: 'Virtual (Teams, Zoom…)' },
      { value: 'llamada', label: 'Llamada telefónica' },
    ],
  },
  {
    id: 'lugar_reunion',
    label: 'Lugar / plataforma',
    type: 'text',
    placeholder: 'Oficina del cliente, Teams, Zoom…',
  },
  {
    id: 'participantes',
    label: 'Participantes',
    type: 'text',
    required: true,
    placeholder: 'Nombres de los asistentes',
  },
  {
    id: 'duracion_reunion',
    label: 'Duración estimada',
    type: 'select',
    options: [
      { value: '', label: 'Seleccionar…' },
      { value: '15min', label: '15 minutos' },
      { value: '30min', label: '30 minutos' },
      { value: '1h', label: '1 hora' },
      { value: 'mas_1h', label: 'Más de 1 hora' },
    ],
  },
  {
    id: 'interes_cliente',
    label: 'Nivel de interés del cliente',
    type: 'select',
    required: true,
    options: [
      { value: '', label: 'Seleccionar…' },
      { value: 'alto', label: 'Alto' },
      { value: 'medio', label: 'Medio' },
      { value: 'bajo', label: 'Bajo' },
    ],
  },
  {
    id: 'resultado_reunion',
    label: 'Resultado de la reunión',
    type: 'textarea',
    required: true,
    placeholder: 'Puntos tratados y conclusiones',
  },
  {
    id: 'necesidades_adicionales',
    label: '¿Se identificaron necesidades adicionales?',
    type: 'textarea',
    placeholder: 'Si aplica, describir',
  },
];

const CONSTRUCCION_FIELDS: StageField[] = [
  {
    id: 'productos_propuestos',
    label: 'Productos / servicios propuestos',
    type: 'textarea',
    required: true,
    placeholder: 'Equipos, licencias, servicios…',
  },
  {
    id: 'cantidad_equipos',
    label: 'Cantidad de equipos / licencias',
    type: 'number',
    required: true,
    placeholder: '0',
  },
  {
    id: 'tipo_solucion',
    label: 'Tipo de solución',
    type: 'select',
    required: true,
    options: [
      { value: '', label: 'Seleccionar…' },
      { value: 'venta', label: 'Venta directa' },
      { value: 'renta', label: 'Renta / arrendamiento' },
      { value: 'servicio', label: 'Servicio administrado' },
      { value: 'mixto', label: 'Mixto' },
    ],
  },
  {
    id: 'condiciones_comerciales',
    label: 'Condiciones comerciales',
    type: 'textarea',
    required: true,
    placeholder: 'Descuentos, plazos de pago, garantías…',
  },
  {
    id: 'plazo_entrega',
    label: 'Plazo de entrega estimado',
    type: 'text',
    placeholder: 'Ej. 15 días hábiles',
  },
  {
    id: 'valor_propuesta',
    label: 'Valor de la propuesta',
    type: 'number',
    required: true,
    placeholder: '0.00',
  },
  {
    id: 'margen_estimado',
    label: 'Margen estimado (%)',
    type: 'number',
    placeholder: 'Ej. 25',
  },
  {
    id: 'requiere_demo',
    label: '¿Requiere demostración o prueba?',
    type: 'select',
    options: [
      { value: '', label: 'Seleccionar…' },
      { value: 'si', label: 'Sí' },
      { value: 'no', label: 'No' },
      { value: 'ya_realizada', label: 'Ya se realizó' },
    ],
  },
];

const ENVIO_FIELDS: StageField[] = [
  {
    id: 'fecha_envio',
    label: 'Fecha de envío',
    type: 'date',
    required: true,
  },
  {
    id: 'medio_envio',
    label: 'Medio de envío',
    type: 'select',
    required: true,
    options: [
      { value: '', label: 'Seleccionar…' },
      { value: 'correo', label: 'Correo electrónico' },
      { value: 'presencial', label: 'Presencial' },
      { value: 'portal', label: 'Portal / plataforma' },
      { value: 'otro', label: 'Otro' },
    ],
  },
  {
    id: 'numero_cotizacion',
    label: 'Número de cotización',
    type: 'text',
    required: true,
    placeholder: 'Referencia de la cotización',
  },
  {
    id: 'vigencia_propuesta',
    label: 'Vigencia de la propuesta',
    type: 'text',
    placeholder: 'Ej. 30 días',
  },
  {
    id: 'enviado_a_decisor',
    label: '¿Se envió al decisor final?',
    type: 'select',
    required: true,
    options: [
      { value: '', label: 'Seleccionar…' },
      { value: 'si', label: 'Sí' },
      { value: 'no', label: 'No' },
      { value: 'parcial', label: 'Parcialmente (a intermediario)' },
    ],
  },
  {
    id: 'confirmacion_recepcion',
    label: '¿El cliente confirmó recepción?',
    type: 'select',
    options: [
      { value: '', label: 'Seleccionar…' },
      { value: 'si', label: 'Sí' },
      { value: 'no', label: 'No' },
      { value: 'pendiente', label: 'Pendiente de confirmar' },
    ],
  },
  {
    id: 'fecha_compromiso_respuesta',
    label: 'Fecha compromiso de respuesta',
    type: 'date',
  },
  {
    id: 'comentarios_envio',
    label: 'Comentarios del envío',
    type: 'textarea',
    placeholder: 'Detalles adicionales sobre el envío de la propuesta',
  },
];

const SEGUIMIENTO_FIELDS: StageField[] = [
  {
    id: 'fecha_seguimiento',
    label: 'Fecha del último seguimiento',
    type: 'date',
    required: true,
  },
  {
    id: 'medio_seguimiento',
    label: 'Medio de contacto',
    type: 'select',
    required: true,
    options: [
      { value: '', label: 'Seleccionar…' },
      { value: 'llamada', label: 'Llamada' },
      { value: 'correo', label: 'Correo electrónico' },
      { value: 'visita', label: 'Visita presencial' },
      { value: 'whatsapp', label: 'WhatsApp / mensaje' },
    ],
  },
  {
    id: 'respuesta_cliente',
    label: 'Respuesta del cliente',
    type: 'select',
    required: true,
    options: [
      { value: '', label: 'Seleccionar…' },
      { value: 'positiva', label: 'Positiva' },
      { value: 'neutral', label: 'Neutral' },
      { value: 'negativa', label: 'Negativa' },
      { value: 'sin_respuesta', label: 'Sin respuesta' },
    ],
  },
  {
    id: 'objeciones',
    label: 'Objeciones del cliente',
    type: 'textarea',
    placeholder: 'Precio, tiempo, competencia…',
  },
  {
    id: 'requiere_ajustes',
    label: '¿Requiere ajustes a la propuesta?',
    type: 'select',
    options: [
      { value: '', label: 'Seleccionar…' },
      { value: 'si', label: 'Sí' },
      { value: 'no', label: 'No' },
    ],
  },
  {
    id: 'nivel_avance',
    label: 'Nivel de avance hacia el cierre',
    type: 'select',
    required: true,
    options: [
      { value: '', label: 'Seleccionar…' },
      { value: 'muy_cerca', label: 'Muy cerca de cerrar' },
      { value: 'en_negociacion', label: 'En negociación activa' },
      { value: 'estancado', label: 'Estancado' },
      { value: 'en_riesgo', label: 'En riesgo de perder' },
    ],
  },
  {
    id: 'proximo_paso',
    label: 'Próximo paso acordado',
    type: 'textarea',
    required: true,
    placeholder: 'Acción concreta y fecha tentativa',
  },
  {
    id: 'fecha_proximo_contacto',
    label: 'Fecha del próximo contacto',
    type: 'date',
  },
];

const CIERRE_FIELDS: StageField[] = [
  {
    id: 'resultado_cierre',
    label: 'Resultado',
    type: 'select',
    required: true,
    options: [
      { value: '', label: 'Seleccionar…' },
      { value: 'ganado', label: 'Ganado' },
      { value: 'perdido', label: 'Perdido' },
      { value: 'en_pausa', label: 'En pausa' },
    ],
  },
  {
    id: 'fecha_cierre_real',
    label: 'Fecha de cierre real',
    type: 'date',
    required: true,
  },
  {
    id: 'monto_final',
    label: 'Monto final acordado',
    type: 'number',
    required: true,
    placeholder: '0.00',
  },
  {
    id: 'numero_orden',
    label: 'Número de orden / contrato',
    type: 'text',
    placeholder: 'Referencia del contrato',
  },
  {
    id: 'forma_pago',
    label: 'Forma de pago',
    type: 'select',
    options: [
      { value: '', label: 'Seleccionar…' },
      { value: 'contado', label: 'Contado' },
      { value: 'credito_30', label: 'Crédito 30 días' },
      { value: 'credito_60', label: 'Crédito 60 días' },
      { value: 'credito_90', label: 'Crédito 90 días' },
      { value: 'parcialidades', label: 'Parcialidades' },
    ],
  },
  {
    id: 'razon_cierre',
    label: 'Razón de cierre',
    type: 'textarea',
    required: true,
    placeholder: 'Si perdido: precio, competencia, timing… Si ganado: factores de éxito',
  },
  {
    id: 'competidor_final',
    label: 'Competidor final (si perdido)',
    type: 'text',
    placeholder: 'Nombre del competidor que ganó',
  },
  {
    id: 'lecciones_aprendidas',
    label: 'Lecciones aprendidas',
    type: 'textarea',
    placeholder: '¿Qué se puede mejorar para futuras oportunidades?',
  },
];

const STAGE_FIELDS: Record<StageId, StageField[]> = {
  asignacion: ASIGNACION_FIELDS,
  reunion: REUNION_FIELDS,
  construccion: CONSTRUCCION_FIELDS,
  envio: ENVIO_FIELDS,
  seguimiento: SEGUIMIENTO_FIELDS,
  cierre: CIERRE_FIELDS,
};

export function getFieldsForStage(stageId: StageId): StageField[] {
  return STAGE_FIELDS[stageId] ?? [];
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderField(f: StageField, value: string, readOnly: boolean): string {
  const req = readOnly ? '' : f.required ? 'required' : '';
  const roAttr = readOnly ? 'readonly' : '';
  const roSelect = readOnly ? 'disabled' : '';
  const star = f.required ? ' <span class="text-brand-red" title="Obligatorio">*</span>' : '';
  const id = `stage-q-${f.id}`;
  const roClass = readOnly ? ' bg-ink-100/50 cursor-not-allowed' : '';

  let input: string;
  switch (f.type) {
    case 'select':
      input = `<select id="${id}" class="input-industrial${roClass}" ${roSelect} ${req}>
        ${(f.options ?? []).map((o) => `<option value="${escHtml(o.value)}" ${o.value === value ? 'selected' : ''}>${escHtml(o.label)}</option>`).join('')}
      </select>`;
      break;
    case 'textarea':
      input = `<textarea id="${id}" rows="3" class="input-industrial resize-y min-h-[5rem]${roClass}" placeholder="${escHtml(f.placeholder ?? '')}" ${roAttr} ${req}>${escHtml(value)}</textarea>`;
      break;
    case 'number':
      input = `<input id="${id}" type="number" step="any" min="0" class="input-industrial${roClass}" placeholder="${escHtml(f.placeholder ?? '')}" value="${escHtml(value)}" ${roAttr} ${req} />`;
      break;
    case 'date':
      input = `<input id="${id}" type="date" class="input-industrial bg-brand-surface${roClass}" value="${escHtml(value)}" ${roAttr} ${req} />`;
      break;
    case 'checkbox':
      input = `<label class="flex ${readOnly ? 'cursor-not-allowed opacity-90' : 'cursor-pointer'} items-center gap-2 text-sm font-semibold text-ink-800">
        <input id="${id}" type="checkbox" class="h-4 w-4 rounded-sm border-2 border-ink-400 accent-[#c8151b]" ${value === 'true' ? 'checked' : ''} ${readOnly ? 'disabled' : ''} />
        ${f.label}${star}
      </label>`;
      return `<div class="block">${input}</div>`;
    default:
      input = `<input id="${id}" type="text" class="input-industrial${roClass}" placeholder="${escHtml(f.placeholder ?? '')}" value="${escHtml(value)}" ${roAttr} ${req} />`;
  }

  return `<label class="block">
    <span class="mb-1.5 block text-xs font-bold uppercase tracking-wide text-ink-700">${f.label}${star}</span>
    ${input}
  </label>`;
}

/**
 * Renderiza las preguntas de la etapa en el contenedor indicado.
 * Retorna los IDs de los campos renderizados para poder registrar listeners.
 */
export function renderStageQuestions(
  container: HTMLElement,
  stageId: StageId,
  stageData: Record<string, string>,
  readOnly = false,
): string[] {
  const fields = getFieldsForStage(stageId);
  if (fields.length === 0) {
    container.innerHTML = '';
    return [];
  }

  container.innerHTML = fields.map((f) => renderField(f, stageData[f.id] ?? '', readOnly)).join('');
  return fields.map((f) => `stage-q-${f.id}`);
}

/** Lee los valores actuales de los campos de etapa desde el DOM. */
export function readStageQuestionValues(stageId: StageId): Record<string, string> {
  const fields = getFieldsForStage(stageId);
  const data: Record<string, string> = {};
  for (const f of fields) {
    const el = document.getElementById(`stage-q-${f.id}`);
    if (!el) continue;
    if (f.type === 'checkbox') {
      data[f.id] = (el as HTMLInputElement).checked ? 'true' : 'false';
    } else {
      data[f.id] = (el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;
    }
  }
  return data;
}
