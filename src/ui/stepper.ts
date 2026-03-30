import { STAGES } from '../stages';

const STEP_INDEX_ATTR = 'data-stage-index';

/**
 * @param selectedIndex Etapa que el usuario está viendo (clic en el paso).
 * @param progressIndex Hasta qué paso llegó el embudo (p. ej. `opportunity_stage - 1` desde la API): líneas y ✓.
 * @param previousSelected Índice seleccionado anterior (animación).
 * @param previousProgress Índice de progreso CRM anterior (animación de líneas al actualizar desde API).
 */
export function renderStepper(
  container: HTMLElement,
  selectedIndex: number,
  progressIndex: number,
  previousSelected: number | null,
  previousProgress: number | null,
): void {
  // Validar que el contenedor existe
  if (!container) {
    console.error('Stepper container not found');
    return;
  }

  const prog = Math.max(0, Math.min(STAGES.length - 1, progressIndex));
  const sel = Math.max(0, Math.min(STAGES.length - 1, selectedIndex));

  const segments = STAGES.map((s, i) => {
    const done = i <= prog;
    const active = i === sel;
    const reviewPast = active && i < prog;

    const boxBase =
      'stepper-box flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border-2 border-black text-xs font-extrabold sm:h-11 sm:w-11 sm:text-sm';
    const boxState = active
      ? `${boxBase} stepper-box--fill ${reviewPast ? 'ring-2 ring-[#c8151b] ring-offset-1' : 'stepper-box--emphasize'}`
      : done
        ? `${boxBase} stepper-box--fill`
        : `${boxBase} stepper-box--empty`;

    const isLineDone = i < prog;
    /** Línea entre etapa i e i+1: animar cuando el progreso CRM avanza. */
    const lineJustFilled =
      previousProgress !== null && isLineDone && i >= previousProgress && i < prog;
    const fillClass = !isLineDone
      ? 'stepper-line-fill stepper-line-fill--empty'
      : lineJustFilled
        ? 'stepper-line-fill stepper-line-fill--grow'
        : 'stepper-line-fill stepper-line-fill--full';

    const line =
      i < STAGES.length - 1
        ? `<div class="stepper-line-track mx-1.5 mt-[1.0625rem] h-1.5 min-w-[1.25rem] shrink-0 sm:mx-2 sm:mt-[1.1875rem] sm:min-w-[2rem]" aria-hidden="true"><div class="${fillClass}"></div></div>`
        : '';

    const labelClass = `stepper-label min-h-[2.5rem] w-full text-center text-[9px] font-bold uppercase leading-tight tracking-tight sm:min-h-[2.75rem] sm:text-[10px] ${
      active ? 'stepper-label--active text-[#c8151b]' : 'text-[#404040]'
    }${reviewPast ? ' italic' : ''}`;

    return `
      <div class="flex shrink-0 items-start">
        <button type="button" ${STEP_INDEX_ATTR}="${i}" class="group flex w-[80px] flex-col items-center gap-1 rounded-sm px-0.5 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c8151b] focus-visible:ring-offset-2 sm:w-[100px] md:w-[110px] sm:gap-1.5">
          <span class="${boxState}">${done ? '✓' : s.short}</span>
          <span class="${labelClass}">${s.label}</span>
        </button>
        ${line}
      </div>`;
  }).join('');

  /** Una fila; sin mx-auto (rompe scrollWidth en contenedores overflow-x-auto). */
  container.innerHTML = `
    <div class="flex w-max max-w-none flex-nowrap items-start justify-start gap-0 px-1">
      ${segments}
    </div>`;
}

export function stepIndexFromTarget(target: EventTarget | null): number | null {
  if (!(target instanceof HTMLElement)) return null;
  const btn = target.closest(`button[${STEP_INDEX_ATTR}]`);
  if (!btn) return null;
  const v = btn.getAttribute(STEP_INDEX_ATTR);
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}