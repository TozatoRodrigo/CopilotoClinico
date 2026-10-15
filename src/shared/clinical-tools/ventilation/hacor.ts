import {
  evaluateCalculator,
  findBand,
  formatResultValue,
  type AnswerLine,
  type CalculatorAnswers,
  type CalculatorEvaluation,
  type Interpretation,
  type ResultBand,
  type ScoreCalculator,
} from '../calculator';
import type { ResultTone } from '../tone';
import { VENTILATION_PROVENANCE } from './content';

/**
 * HACOR (falha de VNI) do VM Guide do ANY, com reavaliação (CC-327).
 *
 * O ANY tinha duas contas do HACOR que podiam divergir: os botões do VM Guide
 * (`HACOR_VARIABLES` + `hacorTotal`, no vmData) e o `calcHACOR` por valor
 * medido (calculations.ts), que a página nem usava. Aqui há uma só: os itens
 * e pontos abaixo, somados pelo motor (`evaluateCalculator`). O teste
 * diferencial confere que as duas do ANY dão o mesmo que esta.
 */

const REFERENCE =
  'Duan J, et al. Assessment of heart rate, acidosis, consciousness, oxygenation, and respiratory rate to predict noninvasive ventilation failure in hypoxemic patients. Intensive Care Med. 2017;43(2):192-9.';

/** Score a partir do qual o ANY classifica alto risco de falha. */
export const HACOR_HIGH_RISK_FROM = 5;

/** Faixas por limite (não por regra): `hacorBand` lê a faixa direto pelo score. */
export const HACOR: ScoreCalculator & { interpretation: Interpretation } = {
  kind: 'score',
  id: 'hacor',
  name: 'HACOR score (falha de VNI)',
  aliases: ['hacor', 'vni', 'falha de vni', 'ventilação não invasiva', 'bipap'],
  category: 'Ventilação',
  description: 'Prediz falha de ventilação não invasiva em hipoxêmicos.',
  items: [
    {
      id: 'fc',
      label: 'FC ≥ 120 bpm',
      options: [
        { id: 'nao', label: 'Não', points: 0 },
        { id: 'sim', label: 'Sim', points: 1 },
      ],
    },
    {
      id: 'ph',
      label: 'pH',
      options: [
        { id: 'ge-7-35', label: '≥ 7,35', points: 0 },
        { id: '7-30-a-7-34', label: '7,30-7,34', points: 2 },
        { id: '7-25-a-7-29', label: '7,25-7,29', points: 3 },
        { id: 'lt-7-25', label: '< 7,25', points: 4 },
      ],
    },
    {
      id: 'gcs',
      label: 'Glasgow (GCS)',
      options: [
        { id: '15', label: '15', points: 0 },
        { id: '13-a-14', label: '13-14', points: 2 },
        { id: '11-a-12', label: '11-12', points: 5 },
        { id: 'le-10', label: '≤ 10', points: 10 },
      ],
    },
    {
      id: 'pf',
      label: 'PaO₂/FiO₂',
      options: [
        { id: 'ge-201', label: '≥ 201', points: 0 },
        { id: '176-a-200', label: '176-200', points: 2 },
        { id: '151-a-175', label: '151-175', points: 3 },
        { id: '126-a-150', label: '126-150', points: 4 },
        { id: '101-a-125', label: '101-125', points: 5 },
        { id: 'le-100', label: '≤ 100', points: 6 },
      ],
    },
    {
      id: 'fr',
      label: 'Frequência respiratória (irpm)',
      options: [
        { id: 'le-30', label: '≤ 30', points: 0 },
        { id: '31-a-35', label: '31-35', points: 1 },
        { id: '36-a-40', label: '36-40', points: 2 },
        { id: '41-a-45', label: '41-45', points: 3 },
        { id: 'ge-46', label: '≥ 46', points: 4 },
      ],
    },
  ],
  interpretation: {
    bands: [
      {
        id: 'baixo-risco',
        label: 'Baixo risco de falha',
        tone: 'neutral',
        action: 'Considere VNI com reavaliação padrão.',
        upTo: { value: HACOR_HIGH_RISK_FROM, inclusive: false },
      },
    ],
    otherwise: {
      id: 'alto-risco',
      label: 'Alto risco de falha',
      tone: 'critical',
      action: 'Considere intubação orotraqueal.',
    },
  },
  reference: {
    why: 'O HACOR score prediz falha de ventilação não invasiva (VNI). Combina frequência cardíaca, acidose, consciência, oxigenação e frequência respiratória. Score ≥ 5 em 1-2h de VNI indica alto risco de falha.',
    whenToUse:
      'Antes de iniciar a VNI (avaliar o risco) e no paciente já em VNI (verificar a resposta).',
    pearlsPitfalls: ['Pontuação de 0 a 25; corte ≥ 5 em 1-2 h de VNI.'],
    citation: REFERENCE,
  },
  provenance: VENTILATION_PROVENANCE,
};

export type HacorBandId = 'baixo-risco' | 'alto-risco';

/** Antes de iniciar a VNI (T0) ou com o paciente já em VNI. */
export type HacorPhase = 'inicio' | 'reavaliacao';

/**
 * A ação muda com a fase, como nas duas telas do ANY: no início o alto risco
 * pede preparar a IOT e reavaliar em 1 h; na reavaliação, considerar a IOT.
 */
export const HACOR_PHASE_ACTION: Record<HacorPhase, Record<HacorBandId, string>> = {
  inicio: {
    'baixo-risco': 'Considere VNI com reavaliação padrão.',
    'alto-risco': 'Considere preparar o material de IOT e reavaliar em 1 h.',
  },
  reavaliacao: {
    'baixo-risco': 'Considere manter a VNI com reavaliação padrão.',
    'alto-risco': 'Considere intubação orotraqueal.',
  },
};

/** "baixo risco" / "alto risco": como o ANY escreve no T0 e no histórico. */
export const HACOR_SHORT_LABEL: Record<HacorBandId, string> = {
  'baixo-risco': 'baixo risco',
  'alto-risco': 'alto risco',
};

export function evaluateHacor(answers: CalculatorAnswers): CalculatorEvaluation {
  return evaluateCalculator(HACOR, answers);
}

export function hacorBand(score: number): ResultBand & { id: HacorBandId } {
  const band = findBand(HACOR.interpretation, score);
  if (band.id !== 'baixo-risco' && band.id !== 'alto-risco') {
    throw new Error(`Faixa do HACOR desconhecida: ${band.id}`);
  }
  return { ...band, id: band.id };
}

// ----- Reavaliação -----

export interface HacorEntry {
  /** "T0", "T1h", "T2h"… */
  label: string;
  /** Hora local da avaliação ("14:05"). */
  time: string;
  score: number;
}

/** Hora e minuto, como o ANY registrava ("08:05"). */
export function clockTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** "Iniciar VNI e registrar T0": o histórico recomeça com o T0. */
export function startHacorHistory(score: number, time: string): HacorEntry[] {
  return [{ label: 'T0', time, score }];
}

/**
 * "Salvar e reavaliar depois": o rótulo é `T<n>h` pela posição no histórico,
 * como no ANY (supõe reavaliação de hora em hora; sem T0, a primeira vira
 * "T0h" — achado 1.6 da revisão clínica).
 */
export function appendHacorReassessment(
  history: readonly HacorEntry[],
  score: number,
  time: string,
): HacorEntry[] {
  return [...history, { label: `T${history.length}h`, time, score }];
}

export type HacorTrendId = 'melhora' | 'piora' | 'estavel';

export interface HacorTrend {
  id: HacorTrendId;
  label: string;
  /** Verde, vermelho e amarelo do ANY, pela regra de cores do ADR-017. */
  tone: ResultTone;
}

const TRENDS: Record<HacorTrendId, HacorTrend> = {
  melhora: { id: 'melhora', label: 'melhora', tone: 'neutral' },
  piora: { id: 'piora', label: 'piora', tone: 'critical' },
  estavel: { id: 'estavel', label: 'estável', tone: 'attention' },
};

/** Score menor é melhora; maior, piora; igual, estável. */
export function hacorTrend(from: number, to: number): HacorTrend {
  if (to < from) return TRENDS.melhora;
  if (to > from) return TRENDS.piora;
  return TRENDS.estavel;
}

/**
 * Texto para o prontuário: score, faixa, respostas, a sugestão da fase e o
 * histórico pelos rótulos (T0, T1h…). Sem a hora: o prontuário carimba.
 */
export function buildHacorChartNote(
  phase: HacorPhase,
  result: { value: number; answers: readonly AnswerLine[] },
  history: readonly HacorEntry[],
): string {
  const band = hacorBand(result.value);
  const trail = history.map(
    ({ label, score }) => `${label} ${score} (${HACOR_SHORT_LABEL[hacorBand(score).id]})`,
  );
  return [
    `${HACOR.name}: ${formatResultValue(HACOR, result.value)} — ${band.label}.`,
    ...result.answers.map(({ label, answer }) => `- ${label}: ${answer}`),
    `Sugestão: ${HACOR_PHASE_ACTION[phase][band.id]}`,
    ...(trail.length > 0 ? [`Histórico: ${trail.join('; ')}`] : []),
    `Referência: ${HACOR.reference.citation}`,
  ].join('\n');
}
