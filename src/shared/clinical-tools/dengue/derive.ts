import { formatCompact } from '../numbers';
import { classifyDengue, type DengueClassification } from './classification';
import {
  ALARM_SIGNS,
  CLASSIFICATION_REASON,
  DENGUE_GROUP_INFO,
  DENGUE_REFERENCES,
  GRAVITY_SIGNS,
  RISK_CONDITIONS,
  TRAIL_GROUP_STEP,
  type DengueGroup,
  type SignItem,
  type VolumeFigure,
} from './content';
import { evaluateHematocrit, type HematocritEvaluation } from './hematocrit';
import {
  fillVolumeText,
  formatFigureDetail,
  formatMilliliters,
  hydrationForWeight,
  type DengueHydration,
  type DengueHydrationResult,
} from './hydration';
import { buildPatientMessage } from './patient-message';
import { currentGroup, type DengueState, type GroupEntry } from './state';

/** Tudo o que a tela mostra, calculado do estado e do peso digitado. */
export interface DengueView {
  weight: DengueHydrationResult;
  /** Volumes do peso; `null` sem peso válido (a tela mostra "--"). */
  hydration: DengueHydration | null;
  /** Classificação ao vivo dos sinais marcados. */
  classification: DengueClassification;
  hematocrit: HematocritEvaluation;
  /** Último grupo atribuído (trilha, classificação direta ou reclassificação). */
  current: GroupEntry | null;
  /** Mensagem de alta, se já gerada. */
  patientMessage: string | null;
}

export function deriveDengue(state: DengueState, weightRaw: string): DengueView {
  const weight = hydrationForWeight(weightRaw);
  return {
    weight,
    hydration: weight.ok ? weight.hydration : null,
    classification: classifyDengue(state),
    hematocrit: evaluateHematocrit({ baseline: state.htBaseline, current: state.htCurrent }),
    current: currentGroup(state),
    patientMessage: state.patientMessage
      ? buildPatientMessage({ issuedAt: new Date(state.patientMessage.issuedAt) })
      : null,
  };
}

/** "4.200 mL/dia (1/3 SRO (1.400 mL) + 2/3 líquidos (2.800 mL))". */
export function formatFigure(figure: VolumeFigure, hydration: DengueHydration | null): string {
  const value = `${formatMilliliters(hydration ? hydration[figure.volume] : null)} ${figure.unit}`;
  const caption = figure.caption ? `${figure.caption}: ` : '';
  const detail = figure.detail ? ` (${formatFigureDetail(figure.detail, hydration)})` : '';
  return `${caption}${value}${detail}`;
}

function marked<Id extends string>(items: readonly SignItem<Id>[], ids: readonly Id[]): string {
  const labels = items.filter(({ id }) => ids.includes(id)).map(({ label }) => label);
  return labels.length > 0 ? labels.join('; ') : 'nenhum';
}

export interface DengueChartNoteInput {
  group: DengueGroup;
  state: DengueState;
  view: DengueView;
}

/**
 * Texto para o prontuário: grupo, sugestão, sinais marcados, volumes do peso,
 * variação do Ht e a trajetória de grupos. Sem nome de paciente nem horário —
 * o prontuário carimba os dois.
 */
export function buildDengueChartNote({ group, state, view }: DengueChartNoteInput): string {
  const { hydration } = view;
  const lines = [
    `Dengue: Grupo ${group} — ${DENGUE_GROUP_INFO[group].label}.`,
    `- Sinais de gravidade: ${marked(GRAVITY_SIGNS, state.gravity)}`,
    `- Sinais de alarme: ${marked(ALARM_SIGNS, state.alarms)}`,
    `- Condições de risco: ${marked(RISK_CONDITIONS, state.risks)}`,
  ];
  if (view.weight.ok) {
    lines.push(`- Peso: ${formatCompact(view.weight.weightKg, 1)} kg`);
    for (const block of TRAIL_GROUP_STEP[group]) {
      if (block.kind !== 'volumes') continue;
      const figures = block.figures.map((figure) => formatFigure(figure, hydration));
      lines.push(`- ${fillVolumeText(block.label, hydration)}: ${figures.join('; ')}`);
    }
  }
  if (view.hematocrit.status === 'complete') {
    const { baseline, current, display, band } = view.hematocrit;
    lines.push(
      `- Variação do Ht: ${display} (basal ${formatCompact(baseline, 1)}% → atual ${formatCompact(current, 1)}%) — ${band.label}`,
    );
  }
  if (state.history.length > 1) {
    lines.push(`- Grupos no atendimento: ${state.history.map((entry) => entry.group).join(' → ')}`);
  }
  // O motivo fala dos sinais marcados; num grupo reclassificado por evolução ele não vale.
  if (view.classification.group === group) {
    lines.push(`Sugestão: ${CLASSIFICATION_REASON[group]}.`);
  }
  lines.push(`Referência: ${DENGUE_REFERENCES[0]}`);
  return lines.join('\n');
}
