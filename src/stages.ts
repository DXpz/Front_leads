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
    desc: '',
  },
  {
    id: 'reunion',
    label: 'Reunión',
    short: '2',
    color: 'bg-brand-blue',
    desc: '',
  },
  {
    id: 'seguimiento',
    label: 'Seguimiento',
    short: '3',
    color: 'bg-brand-sky',
    desc: '',
  },
  {
    id: 'propuesta',
    label: 'Propuesta',
    short: '4',
    color: 'bg-brand-redHi',
    desc: '',
  },
  {
    id: 'cierre',
    label: 'Cierre',
    short: '5',
    color: 'bg-brand-red',
    desc: '',
  },
] as const;

export const STAGE_COUNT = STAGES.length;

export function stageById(id: string): StageDefinition | undefined {
  return STAGES.find((s) => s.id === id);
}
