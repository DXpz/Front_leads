import { STAGES } from '../stages';

const STEP_INDEX_ATTR = 'data-stage-index';

/**
 * @param previousIndex índice de etapa antes del último cambio; null en la primera pintura (sin animación de llenado).
 */
export function renderStepper(
  container: HTMLElement,
  currentIndex: number,
  previousIndex: number | null,
): void {
  const segments = STAGES.map((s, i) => {
    const done = i < currentIndex;
    const active = i === currentIndex;

    const boxBase =
      'stepper-box flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border-2 border-black text-xs font-extrabold sm:h-11 sm:w-11 sm:text-sm';
    const boxState = active
      ? `${boxBase} stepper-box--fill stepper-box--emphasize`
      : done
        ? `${boxBase} stepper-box--fill`
        : `${boxBase} stepper-box--empty`;

    const isLineDone = i < currentIndex;
    /** Línea entre etapa i e i+1: recién completada al avanzar (para animar llenado). */
    const lineJustFilled =
      previousIndex !== null && isLineDone && i >= previousIndex && i < currentIndex;
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
    }`;

    return `
      <div class="flex shrink-0 items-start">
        <button type="button" ${STEP_INDEX_ATTR}="${i}" class="group flex w-[88px] flex-col items-center gap-1 rounded-sm px-0.5 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c8151b] focus-visible:ring-offset-2 sm:w-[104px] sm:gap-1.5">
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
