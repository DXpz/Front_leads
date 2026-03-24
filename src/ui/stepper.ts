import { STAGES } from '../stages';

const STEP_INDEX_ATTR = 'data-stage-index';

const NAVY = '#145478';
const LINE_DONE = '#145478';
const LINE_TODO = '#afacb2';

export function renderStepper(container: HTMLElement, currentIndex: number): void {
  const segments = STAGES.map((s, i) => {
    const done = i < currentIndex;
    const active = i === currentIndex;

    /** Activo: azul marino sólido + número blanco (siempre visible aunque falle Tailwind). */
    let boxClass =
      'flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border-2 border-black text-xs font-extrabold sm:h-11 sm:w-11 sm:text-sm';
    let boxStyle = '';
    if (active) {
      boxClass += ' text-white';
      boxStyle = `background-color:${NAVY};color:#fff`;
    } else if (done) {
      boxClass += ' text-white';
      boxStyle = `background-color:${NAVY};color:#fff`;
    } else {
      boxClass += ' bg-white text-ink-900';
      boxStyle = 'background-color:#ffffff;color:#1a1a1a';
    }

    /** Línea alineada al centro del cuadrado (h-11 = 2.75rem), no de toda la columna con etiqueta variable. */
    const line =
      i < STAGES.length - 1
        ? `<div class="mx-1.5 mt-[1.0625rem] h-1.5 min-w-[1.25rem] shrink-0 rounded-sm sm:mx-2 sm:mt-[1.1875rem] sm:min-w-[2rem]" style="background-color:${
            i < currentIndex ? LINE_DONE : LINE_TODO
          }" aria-hidden="true"></div>`
        : '';

    return `
      <div class="flex shrink-0 items-start">
        <button type="button" ${STEP_INDEX_ATTR}="${i}" class="group flex w-[88px] flex-col items-center gap-1 rounded-sm px-0.5 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c8151b] focus-visible:ring-offset-2 sm:w-[104px] sm:gap-1.5">
          <span class="${boxClass}"${boxStyle ? ` style="${boxStyle}"` : ''}>${done ? '✓' : s.short}</span>
          <span class="min-h-[2.5rem] w-full text-center text-[9px] font-bold uppercase leading-tight tracking-tight sm:min-h-[2.75rem] sm:text-[10px] ${
            active ? 'text-[#c8151b]' : 'text-[#404040]'
          }">${s.label}</span>
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
