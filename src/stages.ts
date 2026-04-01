import type { StageId } from './types';

export type StageDefinition = {
  id: StageId;
  label: string;
  short: string;
  color: string;
  desc: string;
};

export const STAGES: readonly StageDefinition[] = [
  {
    id: 'asignacion',
    label: 'Asignación',
    short: '1',
    color: 'bg-brand-navy',
    desc: 'Origen y datos iniciales del lead',
  },
  {
    id: 'reunion',
    label: 'Reunión',
    short: '2',
    color: 'bg-brand-blue',
    desc: 'Primer contacto con el cliente',
  },
  {
    id: 'propuesta',
    label: 'Propuesta',
    short: '3',
    color: 'bg-brand-sky',
    desc: 'Elaboración y envío de la oferta',
  },
  {
    id: 'seguimiento',
    label: 'Seguimiento de propuesta',
    short: '4',
    color: 'bg-brand-red',
    desc: 'Seguimiento y negociación',
  },
  {
    id: 'cierre',
    label: 'Cierre',
    short: '5',
    color: 'bg-brand-navy',
    desc: 'Resultado final de la oportunidad',
  },
] as const;

export const STAGE_COUNT = STAGES.length;

export function stageById(id: string): StageDefinition | undefined {
  return STAGES.find((s) => s.id === id);
}
