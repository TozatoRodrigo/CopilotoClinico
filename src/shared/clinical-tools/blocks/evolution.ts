import type { NumericRange } from '../ranges';
import { BLOCK_LIST, getRegionalBlock } from './content';
import { LOCAL_ANESTHETICS } from './doses';

/**
 * Modelo de evolução do bloqueio (o "Gerar evolução" do BlockPath do ANY):
 * o médico preenche o que fez e copia o texto para o prontuário. Mesmas opções
 * e mesmo texto do ANY; o teste diferencial gera a nota nos dois e compara.
 */

export const EVOLUTION_SIDES = [
  { value: 'D', label: 'Direito' },
  { value: 'E', label: 'Esquerdo' },
  { value: 'Bilateral', label: 'Bilateral' },
] as const;
export type EvolutionSide = (typeof EVOLUTION_SIDES)[number]['value'];

export const EVOLUTION_TRANSDUCERS = ['Linear 6-13 MHz', 'Curvo 2-5 MHz', 'Não utilizado'] as const;
export type EvolutionTransducer = (typeof EVOLUTION_TRANSDUCERS)[number];

export const EVOLUTION_NEEDLES = [
  'Ecogênica 50mm',
  'Ecogênica 80mm',
  'Ecogênica 100mm',
  '22G x 40mm',
  '25G x 25mm',
] as const;
export type EvolutionNeedle = (typeof EVOLUTION_NEEDLES)[number];

export const EVOLUTION_INSERTIONS = ['Em plano', 'Fora de plano'] as const;
export type EvolutionInsertion = (typeof EVOLUTION_INSERTIONS)[number];

export const EVOLUTION_EPINEPHRINE = ['Sim', 'Não'] as const;
export type EvolutionEpinephrine = (typeof EVOLUTION_EPINEPHRINE)[number];

export const EVOLUTION_COMPLICATIONS = ['Nenhuma', 'Sim'] as const;
export type EvolutionComplication = (typeof EVOLUTION_COMPLICATIONS)[number];

/** "Lidocaína 1%", "Bupivacaína 0,25%"…: as concentrações da calculadora de dose. */
export const EVOLUTION_ANESTHETICS: readonly string[] = LOCAL_ANESTHETICS.flatMap((anesthetic) =>
  anesthetic.concentrations.map(({ label }) => `${anesthetic.name} ${label}`),
);

/** Os 14 bloqueios pelo nome da lista ("PENG", "ESP (Eretor da espinha)"). */
export const EVOLUTION_BLOCK_TYPES: readonly string[] = BLOCK_LIST.flatMap(({ blockIds }) =>
  blockIds.map((id) => getRegionalBlock(id).listName),
);

/**
 * Faixas de digitação do volume e da dose da nota. Só barram erro de
 * digitação (o ANY não tinha faixa); não são limite clínico — a dose máxima
 * é a da calculadora.
 */
export const EVOLUTION_VOLUME_RANGE: NumericRange = { min: 0.5, max: 100, unit: 'mL' };
export const EVOLUTION_DOSE_RANGE: NumericRange = { min: 1, max: 1500, unit: 'mg' };

export interface BlockEvolutionForm {
  indication: string;
  /** Um de `EVOLUTION_BLOCK_TYPES`, ou vazio. */
  blockType: string;
  side: EvolutionSide | '';
  transducer: EvolutionTransducer | '';
  needle: EvolutionNeedle | '';
  insertion: EvolutionInsertion | '';
  /** Um de `EVOLUTION_ANESTHETICS`, ou vazio. */
  anesthetic: string;
  /** Volume injetado; `null` = não informado. */
  volumeMl: number | null;
  /** Dose total; `null` = não informada. */
  doseMg: number | null;
  epinephrine: EvolutionEpinephrine | '';
  complication: EvolutionComplication;
  complicationDescription: string;
  sensoryBlock: boolean;
  motorBlock: boolean;
  /** `true` = sem sinais de LAST. */
  lastSignsAbsent: boolean;
  responsible: string;
  crm: string;
}

/**
 * Formulário em branco com os padrões do ANY: sem intercorrência, bloqueio
 * sensitivo presente, sem bloqueio motor e sem sinais de LAST. No ANY esses
 * quatro não tinham campo na tela e entravam sempre assim na nota; aqui o
 * médico vê e muda (ver a revisão clínica).
 */
export const EMPTY_EVOLUTION_FORM: BlockEvolutionForm = {
  indication: '',
  blockType: '',
  side: '',
  transducer: '',
  needle: '',
  insertion: '',
  anesthetic: '',
  volumeMl: null,
  doseMg: null,
  epinephrine: '',
  complication: 'Nenhuma',
  complicationDescription: '',
  sensoryBlock: true,
  motorBlock: false,
  lastSignsAbsent: true,
  responsible: '',
  crm: '',
};

function orDash(text: string): string {
  return text || '--';
}

/** Número como foi digitado, com vírgula decimal ("20,5"); sem valor, "--". */
function typed(value: number | null): string {
  return value === null ? '--' : String(value).replace('.', ',');
}

/**
 * Texto da evolução, linha a linha como o do ANY. O ANY separa os blocos com
 * linhas vazias, mas o `filter(Boolean)` dele as remove; a nota sai sem linha
 * em branco, igual à de lá (anotado na revisão clínica). Lado vazio deixa um
 * espaço no fim da linha do bloqueio, também como lá.
 */
export function buildBlockEvolutionNote(form: BlockEvolutionForm): string {
  const lines = [
    'BLOQUEIO REGIONAL GUIADO POR ULTRASSOM',
    `Indicação: ${orDash(form.indication)}`,
    `Bloqueio: ${orDash(form.blockType)} ${form.side ? `(${form.side})` : ''}`,
    `Transdutor: ${orDash(form.transducer)}`,
    `Agulha: ${orDash(form.needle)}`,
    `Técnica: ${orDash(form.insertion)}`,
    `Anestésico: ${orDash(form.anesthetic)}`,
    `Volume: ${typed(form.volumeMl)} mL | Dose: ${typed(form.doseMg)} mg`,
    `Epinefrina: ${orDash(form.epinephrine)}`,
    'Avaliação pós-bloqueio:',
    form.sensoryBlock ? '- Bloqueio sensitivo presente' : '- Bloqueio sensitivo ausente',
    ...(form.motorBlock ? ['- Bloqueio motor presente'] : []),
    form.lastSignsAbsent ? '- Ausência de sinais de LAST' : '- ATENÇÃO: sinais de LAST',
    `Intercorrências: ${form.complication === 'Sim' ? form.complicationDescription || 'Sim' : 'Nenhuma'}`,
    `Responsável: ${orDash(form.responsible)}`,
    `CRM: ${orDash(form.crm)}`,
  ];
  return lines.join('\n');
}
