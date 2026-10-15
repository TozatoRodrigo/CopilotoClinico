import { normalizeSearchText } from '../catalog';
import { formatCompact, formatDecimal } from '../numbers';
import type { NumericRange } from '../ranges';
import type { ResultTone } from '../tone';
import { TOX_WEIGHT_RANGE } from './decontamination';
import { TOXIC_DOSES, type ToxicDoseEntry } from './toxic-doses';

/**
 * Calculadora de dose ingerida (CC-324), a do Tox Path do ANY: mg/kg
 * ingerido = quantidade ÷ peso, comparado com a dose tóxica de referência do
 * medicamento. Abaixo de 50% da dose tóxica, "abaixo"; de 50% a menos de
 * 100%, "próximo"; a partir de 100%, "acima".
 */

/** Peso: a mesma faixa do roteiro (0,5 a 300 kg). O ANY aceitava qualquer valor > 0. */
export const TOXIC_DOSE_WEIGHT_RANGE: NumericRange = TOX_WEIGHT_RANGE;

/**
 * Quantidade total ingerida, em mg. O ANY aceitava qualquer valor > 0; a
 * faixa vai de 0,0001 mg (a menor dose tóxica da tabela é 0,00035 mg/kg) a
 * 1.000.000 mg (1 kg), só para barrar zero a mais.
 */
export const INGESTED_AMOUNT_RANGE: NumericRange = { min: 0.0001, max: 1_000_000, unit: 'mg' };

/** Limites do ANY, em fração da dose tóxica. */
export const TOXIC_DOSE_THRESHOLDS = { near: 0.5, toxic: 1 } as const;

export type ToxicDoseBandId = 'abaixo' | 'proximo' | 'acima';

export interface ToxicDoseBand {
  id: ToxicDoseBandId;
  label: string;
  /** Verde, amarelo e vermelho no ANY. */
  tone: ResultTone;
}

export const TOXIC_DOSE_BANDS: Readonly<Record<ToxicDoseBandId, ToxicDoseBand>> = {
  abaixo: { id: 'abaixo', label: 'Abaixo da dose tóxica', tone: 'neutral' },
  proximo: { id: 'proximo', label: 'Próximo da dose tóxica', tone: 'attention' },
  acima: { id: 'acima', label: 'Acima da dose tóxica', tone: 'critical' },
};

export interface ToxicDoseAssessment {
  entry: ToxicDoseEntry;
  weightKg: number;
  amountMg: number;
  /** Dose ingerida, em mg/kg. */
  ingestedPerKg: number;
  /** Dose ingerida ÷ dose tóxica. */
  ratio: number;
  band: ToxicDoseBand;
}

export function assessToxicDose(
  entry: ToxicDoseEntry,
  weightKg: number,
  amountMg: number,
): ToxicDoseAssessment {
  const ingestedPerKg = amountMg / weightKg;
  const ratio = ingestedPerKg / entry.toxicDose;
  const id: ToxicDoseBandId =
    ratio < TOXIC_DOSE_THRESHOLDS.near
      ? 'abaixo'
      : ratio < TOXIC_DOSE_THRESHOLDS.toxic
        ? 'proximo'
        : 'acima';
  return { entry, weightKg, amountMg, ingestedPerKg, ratio, band: TOXIC_DOSE_BANDS[id] };
}

/** Dose tóxica com todas as casas da tabela ("0,00035 mg/kg", "100 mg/kg"). */
export function formatToxicDose(entry: ToxicDoseEntry): string {
  return `${formatCompact(entry.toxicDose, 5)} ${entry.unit}`;
}

/** "12,34 mg/kg", com duas casas como no ANY. */
export function formatIngestedDose(assessment: ToxicDoseAssessment): string {
  return `${formatDecimal(assessment.ingestedPerKg, 2)} ${assessment.entry.unit}`;
}

/** Faixa como o ANY escrevia: acima leva quantas vezes ("Acima da dose tóxica (2,3x)"). */
export function toxicDoseBandText(assessment: ToxicDoseAssessment): string {
  const { band, ratio } = assessment;
  return band.id === 'acima' ? `${band.label} (${formatDecimal(ratio, 1)}x)` : band.label;
}

/** "231% da dose tóxica". */
export function toxicDosePercentText(assessment: ToxicDoseAssessment): string {
  return `${formatDecimal(assessment.ratio * 100, 0)}% da dose tóxica`;
}

/** O ANY só buscava a partir de 2 letras. */
export const TOXIC_DOSE_MIN_QUERY = 2;

/**
 * Busca por nome ou sinônimo, sem acento nem caixa ("valproico" acha
 * "Ácido Valpróico"; "rivotril" acha o clonazepam). Nome que começa com a
 * busca vem primeiro, depois sinônimo que começa com ela, depois o resto; na
 * mesma posição, a ordem da tabela.
 */
export function searchToxicDoses(query: string): readonly ToxicDoseEntry[] {
  const normalized = normalizeSearchText(query);
  if (normalized.length < TOXIC_DOSE_MIN_QUERY) return [];
  const ranked: { entry: ToxicDoseEntry; rank: number; index: number }[] = [];
  for (const [index, entry] of TOXIC_DOSES.entries()) {
    const name = normalizeSearchText(entry.name);
    const aliases = entry.aliases.map(normalizeSearchText);
    let rank = 0;
    if (name.startsWith(normalized)) rank = 3;
    else if (aliases.some((alias) => alias.startsWith(normalized))) rank = 2;
    else if (name.includes(normalized) || aliases.some((alias) => alias.includes(normalized))) {
      rank = 1;
    }
    if (rank > 0) ranked.push({ entry, rank, index });
  }
  return ranked.sort((a, b) => b.rank - a.rank || a.index - b.index).map(({ entry }) => entry);
}

export function findToxicDose(id: string): ToxicDoseEntry | undefined {
  return TOXIC_DOSES.find((entry) => entry.id === id);
}

/** "revisão clínica pendente" ou "revisada por Fulano em 2026-11-02", da própria entrada. */
export function entryReviewText(entry: ToxicDoseEntry): string {
  return entry.review.status === 'revisado'
    ? `revisada por ${entry.review.reviewer} em ${entry.review.reviewedAt}`
    : 'revisão clínica pendente';
}

/** Texto para o prontuário, sem dado de paciente além do peso usado na conta. */
export function buildToxicDoseChartNote(assessment: ToxicDoseAssessment): string {
  const { entry } = assessment;
  return [
    `Dose ingerida de ${entry.name}: ${formatIngestedDose(assessment)} (${formatCompact(assessment.amountMg, 4)} mg para ${formatCompact(assessment.weightKg, 1)} kg).`,
    `${toxicDoseBandText(assessment)}: ${toxicDosePercentText(assessment)} (dose tóxica de referência ${formatToxicDose(entry)}).`,
    `Meia-vida: ${entry.halfLife}${entry.delayedRelease ? ' (liberação retardada)' : ''}.`,
    `Fonte: tabela de doses tóxicas do ANY App (ToxBase), ${entryReviewText(entry)}.`,
  ].join('\n');
}
