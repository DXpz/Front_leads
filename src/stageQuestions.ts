import type { StageId } from './types';
import { todayIsoDate } from './utils/format';

export type FieldType = 'text' | 'textarea' | 'select' | 'date' | 'number' | 'checkbox';

export type StageField = {
  id: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  /** Si se define, el campo solo se muestra cuando `field` tiene uno de `values`. */
  showWhen?: { field: string; values: string[] };
};

const ASIGNACION_FIELDS: StageField[] = [
  {
    id: 'lead_origen',
    label: '¿Cómo llegó el lead?',
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
    id: 'pais_mercado',
    label: 'País',
    type: 'select',
    required: true,
    options: [
      { value: '', label: 'Seleccionar…' },
      { value: 'SV', label: 'El Salvador' },
      { value: 'GT', label: 'Guatemala' },
      { value: 'otro_latam', label: 'Otro' },
    ],
  },
  {
    id: 'industria_sector',
    label: 'Sector del cliente',
    type: 'select',
    required: true,
    options: [
      { value: '', label: 'Seleccionar…' },
      { value: 'logistica_transporte', label: 'Logística o transporte' },
      { value: 'industria', label: 'Industria' },
      { value: 'construccion', label: 'Construcción' },
      { value: 'turismo_hoteleria', label: 'Turismo u hoteles' },
      { value: 'seguridad_privada', label: 'Seguridad privada' },
      { value: 'gobierno', label: 'Gobierno' },
      { value: 'otro', label: 'Otro' },
    ],
  },
  {
    id: 'nombre_comercial',
    label: 'Nombre comercial (si aplica)',
    type: 'text',
    placeholder: 'Empresa o razón social',
  },
  {
    id: 'tomador_decisiones',
    label: 'Quién decide',
    type: 'text',
    required: true,
    placeholder: 'Nombre',
  },
  {
    id: 'cargo_decisor',
    label: 'Cargo',
    type: 'text',
    placeholder: 'Ej. Gerente, supervisor…',
  },
  {
    id: 'tamano_empresa',
    label: 'Tamaño aproximado',
    type: 'select',
    options: [
      { value: '', label: 'Seleccionar…' },
      { value: 'micro', label: '1-10 personas' },
      { value: 'pequena', label: '11-50' },
      { value: 'mediana', label: '51-250' },
      { value: 'grande', label: 'Más de 250' },
    ],
  },
  {
    id: 'solucion_comunicacion_actual',
    label: '¿Qué usan hoy para comunicarse en operación?',
    type: 'select',
    required: true,
    options: [
      { value: '', label: 'Seleccionar…' },
      { value: 'nada', label: 'Nada definido' },
      { value: 'celular', label: 'Celular' },
      { value: 'analogicas', label: 'Radios analógicas' },
      { value: 'digitales_otra_red', label: 'Radios digitales (otra marca)' },
      { value: 'trunking_walkie', label: 'Trunking o walkie' },
      { value: 'otro', label: 'Otro' },
    ],
  },
  {
    id: 'necesidad_identificada',
    label: '¿Qué necesitan o qué problema quieren resolver?',
    type: 'textarea',
    required: true,
    placeholder: 'Breve: voz, ubicación, rondas, tareas, video, etc.',
  },
  {
    id: 'prioridad_lead',
    label: 'Prioridad',
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
    label: '¿Usan otra marca o proveedor?',
    type: 'text',
    placeholder: 'Si no, dejar vacío',
  },
];

const REUNION_FIELDS: StageField[] = [
  {
    id: 'fecha_reunion',
    label: 'Fecha',
    type: 'date',
    required: true,
  },
  {
    id: 'tipo_reunion',
    label: 'Tipo',
    type: 'select',
    required: true,
    options: [
      { value: '', label: 'Seleccionar…' },
      { value: 'presencial', label: 'Presencial' },
      { value: 'llamada', label: 'Llamada' },
      { value: 'teams', label: 'Teams' },
    ],
  },
  {
    id: 'lugar_reunion',
    label: 'Lugar o enlace',
    type: 'text',
    placeholder: 'Dirección, sala, link…',
  },
  {
    id: 'asistentes_reunion',
    label: '¿Quiénes asistieron? (nombre y cargo)',
    type: 'textarea',
    required: true,
    placeholder: 'Una línea por persona si quieres',
  },
  {
    id: 'duracion_reunion',
    label: '¿Cuánto duró?',
    type: 'select',
    required: true,
    options: [
      { value: '', label: 'Seleccionar…' },
      { value: '15min', label: '15 min' },
      { value: '30min', label: '30 min' },
      { value: '45min', label: '45 min' },
      { value: '1h', label: '1 h' },
      { value: 'mas_1h', label: 'Más de 1 h' },
    ],
  },
  {
    id: 'interes_producto',
    label: '¿Interesados en la solución RED?',
    type: 'select',
    required: true,
    options: [
      { value: '', label: 'Seleccionar…' },
      { value: 'si', label: 'Sí' },
      { value: 'no', label: 'No' },
      { value: 'evaluando', label: 'Lo evalúan' },
    ],
  },
  {
    id: 'aclaracion_comercial_red',
    label: '¿Quedó claro que es servicio por contrato con mensualidad (no walkie común)?',
    type: 'select',
    required: true,
    options: [
      { value: '', label: 'Seleccionar…' },
      { value: 'si', label: 'Sí' },
      { value: 'parcial', label: 'Más o menos' },
      { value: 'no', label: 'No se habló' },
    ],
  },
  {
    id: 'temas_tratados',
    label: '¿De qué hablaron?',
    type: 'textarea',
    required: true,
    placeholder: 'Temas principales',
  },
  {
    id: 'productos_ofrecidos',
    label: '¿Qué les ofrecieron?',
    type: 'textarea',
    required: true,
    placeholder: 'Equipos, plan, módulos…',
  },
  {
    id: 'tienen_radios',
    label: '¿Ya tienen radios?',
    type: 'select',
    required: true,
    options: [
      { value: '', label: 'Seleccionar…' },
      { value: 'si', label: 'Sí' },
      { value: 'no', label: 'No' },
    ],
  },
  {
    id: 'tipo_radios',
    label: '¿Cuáles son?',
    type: 'text',
    placeholder: 'Marca, modelo, cantidad aproximada…',
    showWhen: { field: 'tienen_radios', values: ['si'] },
  },
  {
    id: 'requiere_demo',
    label: '¿Solicitan demo?',
    type: 'select',
    required: true,
    options: [
      { value: '', label: 'Seleccionar…' },
      { value: 'si', label: 'Sí' },
      { value: 'no', label: 'No' },
    ],
  },
  {
    id: 'cobertura_demo',
    label: 'Cobertura nacional o mayor a 3km',
    type: 'select',
    required: true,
    options: [
      { value: '', label: 'Seleccionar…' },
      { value: 'nacional', label: 'Nacional' },
      { value: 'mayor_3km', label: 'Mayor a 3 km' },
    ],
    showWhen: { field: 'requiere_demo', values: ['si'] },
  },
];

const PROPUESTA_FIELDS: StageField[] = [
  {
    id: 'productos_propuestos',
    label: 'En pocas palabras, ¿qué oferta es?',
    type: 'textarea',
    required: true,
    placeholder: 'Qué incluye y para qué sirve al cliente',
  },
  {
    id: 'modelo_equipo_propuesto',
    label: 'Modelo de radio',
    type: 'select',
    required: true,
    options: [
      { value: '', label: 'Seleccionar…' },
      { value: 'fmt1001', label: 'FMT-1001 (con pantalla)' },
      { value: 'tsp4', label: 'TSP-4 (sin pantalla)' },
      { value: 'mixto', label: 'Mixto' },
      { value: 'por_definir', label: 'Por definir' },
    ],
  },
  {
    id: 'cantidad_equipos',
    label: 'Cantidad de equipos',
    type: 'number',
    required: true,
    placeholder: '0',
  },
  {
    id: 'tipo_solucion',
    label: 'Tipo de negocio',
    type: 'select',
    required: true,
    options: [
      { value: '', label: 'Seleccionar…' },
      { value: 'compra_directa', label: 'Compra' },
      { value: 'arrendamiento', label: 'Arrendamiento' },
      { value: 'comodato', label: 'Comodato' },
    ],
  },
  {
    id: 'plan_contrato_meses',
    label: 'Contrato (meses)',
    type: 'select',
    required: true,
    options: [
      { value: '', label: 'Seleccionar…' },
      { value: '12', label: '12' },
      { value: '18', label: '18' },
      { value: '24', label: '24' },
      { value: '34', label: '34' },
      { value: 'otro', label: 'Otro' },
    ],
  },
  {
    id: 'mercado_precio_referencia',
    label: 'Cotización según país',
    type: 'select',
    required: true,
    options: [
      { value: '', label: 'Seleccionar…' },
      { value: 'SV', label: 'El Salvador' },
      { value: 'GT', label: 'Guatemala' },
      { value: 'otro', label: 'Otro' },
    ],
  },
  {
    id: 'extras_oferta',
    label: '¿Incluye teléfono/datos o radios con IA?',
    type: 'select',
    options: [
      { value: '', label: 'Seleccionar…' },
      { value: 'no', label: 'No' },
      { value: 'telefonia_datos', label: 'Teléfono o datos' },
      { value: 'radios_ia', label: 'Radios inteligentes' },
      { value: 'ambos', label: 'Ambos' },
    ],
  },
  {
    id: 'plazo_entrega',
    label: 'Plazo de entrega (ej. máx. 5 días)',
    type: 'text',
    required: true,
    placeholder: 'Ej. 5 días',
  },
  {
    id: 'valor_propuesta',
    label: 'Monto de la propuesta',
    type: 'number',
    required: true,
    placeholder: '0.00',
  },
  {
    id: 'requiere_demo',
    label: '¿Necesitan demo?',
    type: 'select',
    options: [
      { value: '', label: 'Seleccionar…' },
      { value: 'si', label: 'Sí' },
      { value: 'no', label: 'No' },
      { value: 'ya_realizada', label: 'Ya la tuvieron' },
    ],
  },
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
];

const SEGUIMIENTO_FIELDS: StageField[] = [
  {
    id: 'fecha_seguimiento',
    label: 'Fecha del contacto',
    type: 'date',
    required: true,
  },
  {
    id: 'medio_seguimiento',
    label: 'Cómo contactaron',
    type: 'select',
    required: true,
    options: [
      { value: '', label: 'Seleccionar…' },
      { value: 'llamada', label: 'Llamada' },
      { value: 'correo', label: 'Correo' },
      { value: 'visita', label: 'Visita' },
      { value: 'whatsapp', label: 'WhatsApp' },
    ],
  },
  {
    id: 'tema_seguimiento',
    label: '¿De qué hablaron? (precio, equipos, cobertura, otra cosa)',
    type: 'text',
    placeholder: 'Tema principal',
  },
  {
    id: 'respuesta_cliente',
    label: '¿Cómo reaccionó el cliente?',
    type: 'select',
    required: true,
    options: [
      { value: '', label: 'Seleccionar…' },
      { value: 'positiva', label: 'Bien / positivo' },
      { value: 'neutral', label: 'Neutral' },
      { value: 'negativa', label: 'Mal / negativo' },
      { value: 'sin_respuesta', label: 'No respondió' },
    ],
  },
  {
    id: 'objeciones',
    label: 'Dudas u objeciones',
    type: 'textarea',
    placeholder: 'Si no hay, dejar vacío',
  },
  {
    id: 'requiere_ajustes',
    label: '¿Hay que cambiar la propuesta?',
    type: 'select',
    options: [
      { value: '', label: 'Seleccionar…' },
      { value: 'si', label: 'Sí' },
      { value: 'no', label: 'No' },
    ],
  },
  {
    id: 'nivel_avance',
    label: '¿Qué tan cerca va el cierre?',
    type: 'select',
    required: true,
    options: [
      { value: '', label: 'Seleccionar…' },
      { value: 'muy_cerca', label: 'Muy cerca' },
      { value: 'en_negociacion', label: 'En negociación' },
      { value: 'estancado', label: 'Parado' },
      { value: 'en_riesgo', label: 'En riesgo' },
    ],
  },
  {
    id: 'proximo_paso',
    label: 'Próximo paso',
    type: 'textarea',
    required: true,
    placeholder: 'Qué sigue y cuándo',
  },
  {
    id: 'fecha_proximo_contacto',
    label: 'Próxima fecha de contacto',
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
    label: 'Fecha',
    type: 'date',
    required: true,
  },
  {
    id: 'moneda_cierre',
    label: 'Moneda',
    type: 'select',
    required: true,
    options: [
      { value: '', label: 'Seleccionar…' },
      { value: 'USD', label: 'Dólares (SV)' },
      { value: 'GTQ', label: 'Quetzales (GT)' },
      { value: 'otra', label: 'Otra' },
    ],
  },
  {
    id: 'monto_final',
    label: 'Monto final',
    type: 'number',
    required: true,
    placeholder: '0.00',
  },
  {
    id: 'numero_orden',
    label: 'Nº de oferta o contrato',
    type: 'text',
    placeholder: 'Referencia',
  },
  {
    id: 'meses_contrato_cerrado',
    label: 'Meses de contrato (si ganó)',
    type: 'select',
    options: [
      { value: '', label: 'Seleccionar…' },
      { value: '12', label: '12' },
      { value: '18', label: '18' },
      { value: '24', label: '24' },
      { value: '34', label: '34' },
      { value: 'na', label: 'No aplica' },
    ],
  },
  {
    id: 'razon_cierre',
    label: 'Comentario (por qué ganó, perdió o pausa)',
    type: 'textarea',
    required: true,
    placeholder: 'Breve resumen',
  },
];

const DEMO_FIELDS: StageField[] = [
  {
    id: 'fecha_demo',
    label: 'Fecha de la demo',
    type: 'date',
    required: true,
  },
  {
    id: 'cobertura_demo',
    label: 'Cobertura',
    type: 'select',
    required: true,
    options: [
      { value: '', label: 'Seleccionar…' },
      { value: 'nacional', label: 'Nacional' },
      { value: 'mayor_3km', label: 'Mayor a 3 km' },
      { value: 'local', label: 'Local (urbana)' },
    ],
  },
  {
    id: 'servicio_demo',
    label: 'Servicio mostrado',
    type: 'select',
    required: true,
    options: [
      { value: '', label: 'Seleccionar…' },
      { value: 'voz', label: 'Solo voz' },
      { value: 'voz_gps', label: 'Voz + GPS' },
      { value: 'voz_gps_tareas', label: 'Voz + GPS + Tareas' },
      { value: 'voz_gps_tareas_video', label: 'Voz + GPS + Tareas + Video' },
      { value: 'full', label: 'Full (todo)' },
    ],
  },
  {
    id: 'uso_equipos_demo',
    label: '¿El cliente usó los equipos?',
    type: 'select',
    required: true,
    options: [
      { value: '', label: 'Seleccionar…' },
      { value: 'si', label: 'Sí' },
      { value: 'no', label: 'No' },
      { value: 'parcial', label: 'Parcialmente' },
    ],
  },
  {
    id: 'pruebas_cobertura',
    label: '¿Probaron cobertura?',
    type: 'select',
    required: true,
    options: [
      { value: '', label: 'Seleccionar…' },
      { value: 'si', label: 'Sí' },
      { value: 'no', label: 'No' },
    ],
  },
  {
    id: 'resultado_cobertura',
    label: 'Resultado de cobertura',
    type: 'text',
    placeholder: 'Ej.Excelente, Regular, No funcionó…',
  },
  {
    id: 'comentario_demo',
    label: 'Feedback del cliente',
    type: 'textarea',
    required: true,
    placeholder: 'Qué dijo el cliente, impresión general',
  },
  {
    id: 'siguiente_paso_demo',
    label: 'Siguiente paso',
    type: 'textarea',
    required: true,
    placeholder: 'Qué sigue después de la demo',
  },
];

const STAGE_FIELDS: Record<StageId, StageField[]> = {
  asignacion: ASIGNACION_FIELDS,
  reunion: REUNION_FIELDS,
  demo: DEMO_FIELDS,
  propuesta: PROPUESTA_FIELDS,
  seguimiento: SEGUIMIENTO_FIELDS,
  cierre: CIERRE_FIELDS,
};

export function getFieldsForStage(stageId: StageId): StageField[] {
  return STAGE_FIELDS[stageId] ?? [];
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function isCondVisible(stageData: Record<string, string>, showWhen?: StageField['showWhen']): boolean {
  if (!showWhen) return true;
  const v = stageData[showWhen.field] ?? '';
  return showWhen.values.includes(v);
}

const conditionalListenersBound = new WeakSet<HTMLElement>();

function refreshConditionalVisibility(
  container: HTMLElement,
  opts: { clearHidden?: boolean } = {},
): void {
  const clearHidden = opts.clearHidden ?? true;
  for (const wrap of container.querySelectorAll<HTMLElement>('.stage-cond-wrap')) {
    const master = wrap.dataset.condMaster;
    const raw = wrap.dataset.condValues ?? '';
    const allowed = raw.split(',').filter(Boolean);
    if (!master) continue;
    const ctrl = document.getElementById(`stage-q-${master}`) as HTMLSelectElement | null;
    const v = ctrl?.value ?? '';
    const show = allowed.includes(v);
    wrap.classList.toggle('hidden', !show);
    if (!show && clearHidden) {
      const innerInput = wrap.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
        'input, textarea, select',
      );
      if (
        innerInput &&
        innerInput.type !== 'checkbox' &&
        !innerInput.disabled &&
        !(innerInput instanceof HTMLSelectElement) &&
        !(innerInput as HTMLInputElement | HTMLTextAreaElement).readOnly
      ) {
        innerInput.value = '';
      }
    }
  }
}

function bindConditionalVisibility(container: HTMLElement): void {
  if (conditionalListenersBound.has(container)) return;
  conditionalListenersBound.add(container);
  container.addEventListener('change', () => {
    refreshConditionalVisibility(container, { clearHidden: true });
  });
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

  container.innerHTML = fields
    .map((f) => {
      let val = stageData[f.id] ?? '';
      if (f.type === 'date' && val === '' && !readOnly) {
        val = todayIsoDate();
      }
      const inner = renderField(f, val, readOnly);
      if (!f.showWhen) return inner;
      const vis = isCondVisible(stageData, f.showWhen);
      const wrapClass = vis ? 'stage-cond-wrap' : 'stage-cond-wrap hidden';
      const valuesAttr = escHtml(f.showWhen.values.join(','));
      const masterAttr = escHtml(f.showWhen.field);
      return `<div class="${wrapClass}" data-cond-master="${masterAttr}" data-cond-values="${valuesAttr}">${inner}</div>`;
    })
    .join('');
  if (!readOnly) {
    bindConditionalVisibility(container);
  }
  refreshConditionalVisibility(container, { clearHidden: !readOnly });
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
  for (const f of fields) {
    if (!f.showWhen) continue;
    const parent = data[f.showWhen.field] ?? '';
    if (!f.showWhen.values.includes(parent)) {
      data[f.id] = '';
    }
  }
  return data;
}
