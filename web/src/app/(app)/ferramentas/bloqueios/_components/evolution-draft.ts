import {
  EMPTY_EVOLUTION_FORM,
  EVOLUTION_ANESTHETICS,
  EVOLUTION_BLOCK_TYPES,
  EVOLUTION_COMPLICATIONS,
  EVOLUTION_DOSE_RANGE,
  EVOLUTION_EPINEPHRINE,
  EVOLUTION_INSERTIONS,
  EVOLUTION_NEEDLES,
  EVOLUTION_SIDES,
  EVOLUTION_TRANSDUCERS,
  EVOLUTION_VOLUME_RANGE,
  type BlockEvolutionForm,
} from '@clinical-tools/blocks/evolution';
import { validateNumber } from '@clinical-tools/ranges';

/**
 * Rascunho da nota de evolução como a tela guarda: volume e dose como o
 * médico digitou (vírgula ou ponto), o resto como no formulário do motor.
 */
export type EvolutionDraft = Omit<BlockEvolutionForm, 'volumeMl' | 'doseMg'> & {
  volume: string;
  dose: string;
};

/** Em branco com os padrões do motor (os do ANY). */
export const EMPTY_EVOLUTION_DRAFT: EvolutionDraft = {
  indication: EMPTY_EVOLUTION_FORM.indication,
  blockType: EMPTY_EVOLUTION_FORM.blockType,
  side: EMPTY_EVOLUTION_FORM.side,
  transducer: EMPTY_EVOLUTION_FORM.transducer,
  needle: EMPTY_EVOLUTION_FORM.needle,
  insertion: EMPTY_EVOLUTION_FORM.insertion,
  anesthetic: EMPTY_EVOLUTION_FORM.anesthetic,
  volume: '',
  dose: '',
  epinephrine: EMPTY_EVOLUTION_FORM.epinephrine,
  complication: EMPTY_EVOLUTION_FORM.complication,
  complicationDescription: EMPTY_EVOLUTION_FORM.complicationDescription,
  sensoryBlock: EMPTY_EVOLUTION_FORM.sensoryBlock,
  motorBlock: EMPTY_EVOLUTION_FORM.motorBlock,
  lastSignsAbsent: EMPTY_EVOLUTION_FORM.lastSignsAbsent,
  responsible: EMPTY_EVOLUTION_FORM.responsible,
  crm: EMPTY_EVOLUTION_FORM.crm,
};

/** Texto livre guardado na aba: curto, para um valor estranho não crescer sem limite. */
const MAX_TEXT = 200;

const TEXT_FIELDS = [
  'indication',
  'complicationDescription',
  'responsible',
  'crm',
  'volume',
  'dose',
] as const;

/** Campo de escolha → valores aceitos (vazio sempre vale, exceto intercorrência). */
const CHOICE_FIELDS: Record<string, readonly string[]> = {
  blockType: ['', ...EVOLUTION_BLOCK_TYPES],
  side: ['', ...EVOLUTION_SIDES.map(({ value }) => value)],
  transducer: ['', ...EVOLUTION_TRANSDUCERS],
  needle: ['', ...EVOLUTION_NEEDLES],
  insertion: ['', ...EVOLUTION_INSERTIONS],
  anesthetic: ['', ...EVOLUTION_ANESTHETICS],
  epinephrine: ['', ...EVOLUTION_EPINEPHRINE],
  complication: EVOLUTION_COMPLICATIONS,
};

const FLAG_FIELDS = ['sensoryBlock', 'motorBlock', 'lastSignsAbsent'] as const;

/** Lê o rascunho salvo na aba; qualquer campo fora do formato descarta o rascunho todo. */
export function parseEvolutionDraft(value: unknown): EvolutionDraft | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  for (const field of TEXT_FIELDS) {
    const text = record[field];
    if (typeof text !== 'string' || text.length > MAX_TEXT) return null;
  }
  for (const [field, allowed] of Object.entries(CHOICE_FIELDS)) {
    const choice = record[field];
    if (typeof choice !== 'string' || !allowed.includes(choice)) return null;
  }
  for (const field of FLAG_FIELDS) {
    if (typeof record[field] !== 'boolean') return null;
  }
  const keys = Object.keys(EMPTY_EVOLUTION_DRAFT);
  return Object.fromEntries(keys.map((key) => [key, record[key]])) as EvolutionDraft;
}

/** Volume ou dose inválido (ou fora da faixa de digitação) entra na nota como "--". */
function typedNumber(raw: string, range: typeof EVOLUTION_VOLUME_RANGE): number | null {
  const checked = validateNumber(raw, range);
  return checked.ok ? checked.value : null;
}

export function draftToForm(draft: EvolutionDraft): BlockEvolutionForm {
  const { volume, dose, ...fields } = draft;
  return {
    ...fields,
    volumeMl: typedNumber(volume, EVOLUTION_VOLUME_RANGE),
    doseMg: typedNumber(dose, EVOLUTION_DOSE_RANGE),
  };
}
