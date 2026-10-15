import {
  formatResultValue,
  type AnswerLine,
  type CalculatorDefinition,
  type ResultBand,
} from './calculator';

export interface CompleteResult {
  value: number;
  band: ResultBand;
  answers: readonly AnswerLine[];
}

/**
 * Texto pronto para colar no prontuário: resultado, faixa, o que foi
 * respondido e a referência. Sem nome de paciente nem horário — o prontuário
 * carimba os dois.
 */
export function buildChartNote(definition: CalculatorDefinition, result: CompleteResult): string {
  const lines = [
    `${definition.name}: ${formatResultValue(definition, result.value)} — ${result.band.label}.`,
    ...result.answers.map(({ label, answer }) => `- ${label}: ${answer}`),
    `Sugestão: ${result.band.action}`,
    `Referência: ${definition.reference.citation}`,
  ];
  return lines.join('\n');
}
