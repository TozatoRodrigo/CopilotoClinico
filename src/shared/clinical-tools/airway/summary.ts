import { formatCompact } from '../numbers';
import {
  CHECKLISTS,
  CRASH_LETTERS,
  INDICATIONS,
  POPULATIONS,
  RESCUE_METHODS,
  SEXES,
} from './content';
import { deriveAirway, optionalValue } from './derive';
import { formatDose, formatRate, INDUCTION_DOSE_REDUCTION } from './drugs';
import type { AirwayOutcome, AirwayState } from './state';
import { AIRWAY_RANGES, formatShockIndex } from './vitals';

/**
 * Resumo do roteiro (passo 11) e o texto para o prontuário. Segue as seções
 * do relatório do ANY (indicação, avaliação, paciente, medicações,
 * procedimento, confirmação), com duas diferenças deliberadas:
 *
 * - sem data e hora: o prontuário carimba (mesma regra das calculadoras);
 * - desfecho e confirmação vêm do que foi registrado. O ANY escrevia sempre
 *   "Capnografia + Ausculta + POCUS", mesmo sem intubação registrada.
 */

export interface AirwaySummarySection {
  id:
    | 'indicacao'
    | 'avaliacao'
    | 'paciente'
    | 'medicacoes'
    | 'procedimento'
    | 'desfecho'
    | 'confirmacao';
  title: string;
  lines: readonly string[];
}

const NOT_INFORMED = '--';

const CONFIRMATION_ITEMS = [...CHECKLISTS.confirmacao.items, ...CHECKLISTS.pocus.items];

function outcomeLine(outcome: AirwayOutcome): string {
  switch (outcome.status) {
    case 'pendente':
      return 'Não registrado';
    case 'intubado':
      return 'Intubação com sucesso (plano A)';
    case 'falhou':
      return outcome.planC
        ? 'Falha na intubação e no plano B (dispositivo extraglótico); plano C (cricotireoidostomia) sem desfecho registrado'
        : 'Falha na intubação; plano B (dispositivo extraglótico) sem desfecho registrado';
    case 'resgatado': {
      const method = RESCUE_METHODS.find(({ id }) => id === outcome.method);
      return `Falha na intubação; via aérea estabelecida com ${method?.summary ?? outcome.method}`;
    }
  }
}

export function buildAirwaySummary(
  state: AirwayState,
  weightRaw: string,
): readonly AirwaySummarySection[] {
  const view = deriveAirway(state, weightRaw);

  const indications = INDICATIONS.filter(({ id }) => state.indications.includes(id)).map(
    ({ summary }) => summary,
  );

  const crashLetters = CRASH_LETTERS.filter((letter) => state.crash.includes(letter)).join('');
  const assessment = [`CRASH: ${view.crashCount}/5${crashLetters ? ` (${crashLetters})` : ''}`];
  if (state.vadAssessment === 'avaliar') {
    assessment.push(`LEMON: ${view.lemonCount}/5`, `ROMAN: ${view.romanCount}/5`);
  } else if (state.vadAssessment === 'sem-avaliar') {
    assessment.push('Avaliação anatômica: não realizada');
  }
  if (view.shockIndex) assessment.push(`Índice de choque: ${formatShockIndex(view.shockIndex)}`);

  const patient = [
    `Peso: ${view.weightKg === null ? NOT_INFORMED : `${formatCompact(view.weightKg)} kg`}`,
  ];
  if (view.heightCm !== null) patient.push(`Altura: ${formatCompact(view.heightCm)} cm`);
  patient.push(
    `Sexo: ${SEXES.find(({ id }) => id === state.sex)?.label ?? NOT_INFORMED}`,
    `População: ${POPULATIONS.find(({ id }) => id === state.population)?.label ?? state.population}`,
  );

  const medications = view.drugs
    .filter(({ selected }) => selected)
    .map(({ drug, ratePerKg, dose, reduced }) => {
      const rate = formatRate(drug, ratePerKg);
      if (!dose) return `${drug.name} ${rate} (peso não informado)`;
      const line = `${drug.name} ${formatDose(drug, dose.dose)} (${rate})`;
      if (!reduced) return line;
      return `${line}; redução sugerida de ${INDUCTION_DOSE_REDUCTION.minPercent}–${INDUCTION_DOSE_REDUCTION.maxPercent}%: ${formatCompact(reduced.from.dose, drug.doseDecimals)} a ${formatDose(drug, reduced.to.dose)}`;
    });

  const depth = optionalValue(state.depth, AIRWAY_RANGES.depth);
  const cuff = optionalValue(state.cuff, AIRWAY_RANGES.cuff);
  const procedure = [`Tubo: ${view.tube ?? NOT_INFORMED}`];
  if (state.cormack) procedure.push(`Cormack-Lehane: ${state.cormack}`);
  if (depth !== null) procedure.push(`Profundidade: ${formatCompact(depth)} cm`);
  if (cuff !== null) procedure.push(`Cuff: ${formatCompact(cuff)} cmH2O`);

  const confirmation = CONFIRMATION_ITEMS.filter(({ id }) => state.checked.includes(id)).map(
    ({ summary }) => summary,
  );

  return [
    { id: 'indicacao', title: 'Indicação', lines: [indications.join(', ') || NOT_INFORMED] },
    { id: 'avaliacao', title: 'Avaliação de VAD', lines: [assessment.join(' | ')] },
    { id: 'paciente', title: 'Paciente', lines: [patient.join(' | ')] },
    {
      id: 'medicacoes',
      title: 'Medicações',
      lines: medications.length > 0 ? medications : ['Nenhuma selecionada'],
    },
    { id: 'procedimento', title: 'Procedimento', lines: [procedure.join(' | ')] },
    { id: 'desfecho', title: 'Desfecho', lines: [outcomeLine(state.outcome)] },
    {
      id: 'confirmacao',
      title: 'Confirmação',
      lines: [confirmation.length > 0 ? confirmation.join(', ') : 'Não registrada'],
    },
  ];
}

/**
 * Texto pronto para colar no prontuário. Sem nome de paciente nem horário.
 * Medicação com mais de uma linha vai em lista; as demais seções, em uma linha.
 */
export function buildAirwayChartNote(state: AirwayState, weightRaw: string): string {
  const lines = ['Intubação orotraqueal — roteiro de via aérea'];
  for (const section of buildAirwaySummary(state, weightRaw)) {
    if (section.id === 'medicacoes' && section.lines[0] !== 'Nenhuma selecionada') {
      lines.push(`${section.title}:`, ...section.lines.map((line) => `- ${line}`));
    } else {
      lines.push(`${section.title}: ${section.lines.join(' ')}`);
    }
  }
  return lines.join('\n');
}
