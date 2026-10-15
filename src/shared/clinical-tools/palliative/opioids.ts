import { formatCompact, formatDecimal } from '../numbers';
import { validateNumber, type NumericFieldError, type NumericRange } from '../ranges';
import type { ClinicalNote } from './content';

/**
 * Conversor de opioides do PaliaPath (CC-329). A conta é a do ANY, na mesma
 * ordem (`dose × fator de origem ÷ fator de destino × 0,75`, uma casa
 * decimal), para o teste diferencial dar o mesmo número em toda entrada:
 * fator = mg de morfina VO em 24 h por unidade da dose.
 *
 * Diferenças da tela do ANY, sem mudar a conta:
 * - unidade visível em cada opioide (mg/24 h; fentanil em mcg/h, como diz o
 *   rótulo e o comentário do fator no ANY);
 * - faixa de entrada por opioide (o ANY aceitava qualquer número > 0). As
 *   faixas são do porte e esperam a revisão clínica.
 */

export const OPIOID_IDS = [
  'morfina-vo',
  'morfina-ev',
  'tramadol',
  'codeina',
  'fentanil-ev',
  'metadona',
] as const;

export type OpioidId = (typeof OPIOID_IDS)[number];

export type OpioidConversionRule =
  /** mg de morfina VO em 24 h por unidade da dose (`opioidFactors` do ANY). */
  | { kind: 'linear'; factor: number }
  /** Metadona: o ANY não converte e orienta procurar especialista. */
  | { kind: 'nao-linear' };

export interface OpioidDefinition {
  id: OpioidId;
  label: string;
  /** Unidade da dose digitada e do resultado. */
  unit: string;
  /** Faixa aceita na entrada (do porte; ver revisão clínica). */
  range: Omit<NumericRange, 'unit'>;
  rule: OpioidConversionRule;
}

const MG_24H = 'mg/24 h';

export const OPIOIDS: readonly OpioidDefinition[] = [
  {
    id: 'morfina-vo',
    label: 'Morfina VO',
    unit: MG_24H,
    range: { min: 1, max: 3000 },
    rule: { kind: 'linear', factor: 1 },
  },
  {
    id: 'morfina-ev',
    label: 'Morfina EV/SC',
    unit: MG_24H,
    range: { min: 0.5, max: 1000 },
    rule: { kind: 'linear', factor: 3 },
  },
  {
    id: 'tramadol',
    label: 'Tramadol VO',
    unit: MG_24H,
    range: { min: 1, max: 1000 },
    rule: { kind: 'linear', factor: 0.1 },
  },
  {
    id: 'codeina',
    label: 'Codeína VO',
    unit: MG_24H,
    range: { min: 1, max: 1000 },
    rule: { kind: 'linear', factor: 0.15 },
  },
  {
    // 25 mcg/h ≈ 60 mg/24 h de morfina VO, segundo o comentário do ANY.
    id: 'fentanil-ev',
    label: 'Fentanil EV/SC contínuo (mcg/h)',
    unit: 'mcg/h',
    range: { min: 1, max: 1000 },
    rule: { kind: 'linear', factor: 2.4 },
  },
  {
    id: 'metadona',
    label: 'Metadona VO',
    unit: MG_24H,
    range: { min: 1, max: 1000 },
    rule: { kind: 'nao-linear' },
  },
];

const BY_ID = new Map(OPIOIDS.map((opioid) => [opioid.id, opioid]));

export function opioid(id: OpioidId): OpioidDefinition {
  const definition = BY_ID.get(id);
  if (!definition) throw new Error(`Opioide desconhecido: ${id}`);
  return definition;
}

export function isOpioidId(value: string): value is OpioidId {
  return (OPIOID_IDS as readonly string[]).includes(value);
}

/** Fração da dose calculada que o ANY sugere ao trocar de opioide ("×0,75 de segurança"). */
export const OPIOID_SAFETY_FACTOR = 0.75;

/** A sugestão que acompanha toda conversão. */
export const OPIOID_GUIDANCE = 'Ao trocar, considere iniciar com 75% da dose calculada.';

export const OPIOID_NOTE: ClinicalNote = {
  kind: 'nota',
  title: 'Equianalgesia',
  text: `Use esta tabela para converter entre opioides. ${OPIOID_GUIDANCE}`,
};

export const METHADONE_WARNING =
  'A equivalência da metadona não é linear: varia com a dose prévia de opioide e com o tempo de uso. Conversão sugerida apenas com orientação de especialista em dor ou cuidados paliativos.';

export const METHADONE_FOOTNOTE =
  '*Metadona: conversão não linear. Solicitar avaliação especializada para doses altas.';

export const OPIOID_RESULT_CAPTION = 'Dose equivalente (75% da dose calculada)';

/**
 * Rótulos dos campos. O ANY dizia "Dose em 24h" para todos, mas o fentanil é
 * digitado em mcg/h; aqui o rótulo é neutro e a unidade de cada opioide fica
 * ao lado do valor.
 */
export const OPIOID_FIELD_LABELS = {
  from: 'Opioide atual',
  dose: 'Dose atual',
  to: 'Converter para',
} as const;

export const OPIOID_TABLE_TITLE = 'Tabela de Equivalência (24h)';

export const OPIOID_TABLE_COLUMNS = {
  label: 'Opioide',
  dose: 'Dose Equianalgésica',
  factor: 'Fator',
} as const;

export interface OpioidEquivalenceRow {
  opioid: OpioidId;
  label: string;
  /** Dose equianalgésica em 24 h, como texto do ANY. */
  dose: string;
  factor: string;
}

/** "Tabela de Equivalência (24h)" do ANY, como texto. */
export const OPIOID_EQUIVALENCE_TABLE: readonly OpioidEquivalenceRow[] = [
  { opioid: 'morfina-vo', label: 'Morfina VO', dose: '30mg', factor: '1' },
  { opioid: 'morfina-ev', label: 'Morfina EV/SC', dose: '10mg', factor: '3' },
  { opioid: 'tramadol', label: 'Tramadol VO', dose: '300mg', factor: '0,1' },
  { opioid: 'codeina', label: 'Codeína VO', dose: '200mg', factor: '0,15' },
  { opioid: 'fentanil-ev', label: 'Fentanil EV/SC (mcg/h)', dose: '25 mcg/h', factor: '2,4' },
  { opioid: 'metadona', label: 'Metadona VO', dose: 'Variável*', factor: '-' },
];

export interface OpioidConversionInput {
  from: OpioidId;
  to: OpioidId;
  /** Dose digitada, com vírgula ou ponto. */
  dose: string;
}

export type OpioidConversion =
  /** Metadona de um dos lados: sem número, só a orientação (como no ANY). */
  | { status: 'nao-linear' }
  /** Sem dose (`error: null`) ou dose inválida/fora da faixa. */
  | { status: 'pending'; error: NumericFieldError | null }
  | {
      status: 'complete';
      /** Dose de origem já validada. */
      dose: number;
      /** Equivalente em mg de morfina VO em 24 h. */
      morphineEquivalent: number;
      /** Dose de destino antes da redução de 25%. */
      calculated: number;
      /** Dose sugerida: 75% da calculada. */
      value: number;
    };

export function convertOpioid({ from, to, dose }: OpioidConversionInput): OpioidConversion {
  const source = opioid(from);
  const target = opioid(to);
  if (source.rule.kind === 'nao-linear' || target.rule.kind === 'nao-linear') {
    return { status: 'nao-linear' };
  }
  const checked = validateNumber(dose, { ...source.range, unit: source.unit });
  if (!checked.ok) {
    return { status: 'pending', error: checked.error.kind === 'empty' ? null : checked.error };
  }
  // Mesma ordem de operações do `opioidResult` do ANY: o arredondamento de
  // ponto flutuante precisa ser idêntico para o `toFixed(1)` coincidir.
  const morphineEquivalent = checked.value * source.rule.factor;
  const calculated = morphineEquivalent / target.rule.factor;
  const value = calculated * OPIOID_SAFETY_FACTOR;
  return { status: 'complete', dose: checked.value, morphineEquivalent, calculated, value };
}

/** Uma casa decimal com vírgula: o `toFixed(1)` do ANY. */
export function formatOpioidDose(value: number): string {
  return formatDecimal(value, 1);
}

/** Texto para o prontuário: conversão, equivalente de morfina e a sugestão. Sem dado do paciente. */
export function buildOpioidChartNote(
  input: Pick<OpioidConversionInput, 'from' | 'to'>,
  result: Extract<OpioidConversion, { status: 'complete' }>,
): string {
  const source = opioid(input.from);
  const target = opioid(input.to);
  return [
    `Conversão de opioides: ${source.label} ${formatCompact(result.dose, 2)} ${source.unit} → ${target.label} ${formatOpioidDose(result.value)} ${target.unit} (75% da dose calculada).`,
    `- Equivalente de morfina VO: ${formatOpioidDose(result.morphineEquivalent)} ${MG_24H}`,
    `- Dose calculada (100%): ${formatOpioidDose(result.calculated)} ${target.unit}`,
    `Sugestão: ${OPIOID_GUIDANCE}`,
    'Referência: tabela de equianalgesia do PaliaPath (ANY App v4).',
  ].join('\n');
}
