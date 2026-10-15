import {
  formatResultValue,
  type AnswerLine,
  type CalculatorDefinition,
  type ResultBand,
  type ResultDetail,
} from './calculator';

export interface CompleteResult {
  value: number;
  band: ResultBand;
  answers: readonly AnswerLine[];
  details: readonly ResultDetail[];
}

/**
 * Texto pronto para colar no prontuário: resultado, faixa, o que foi
 * respondido e a referência. Sem nome de paciente nem horário — o prontuário
 * carimba os dois. O aviso de versão (GRACE, APACHE II) vai junto, para a
 * estimativa não circular como se fosse o escore oficial.
 */
export function buildChartNote(definition: CalculatorDefinition, result: CompleteResult): string {
  const value = formatResultValue(definition, result.value);
  const lines = [
    value === null
      ? `${definition.name}: ${result.band.label}.`
      : `${definition.name}: ${value} — ${result.band.label}.`,
    ...result.details.map(({ label, value: detail }) => `${label}: ${detail}.`),
    ...result.answers.map(({ label, answer }) => `- ${label}: ${answer}`),
    `Sugestão: ${result.band.action}`,
    ...(definition.versionNotice
      ? [`${definition.versionNotice.title}: ${definition.versionNotice.text}`]
      : []),
    `Referência: ${definition.reference.citation}`,
  ];
  return lines.join('\n');
}
