import type { AnswerLine } from '../calculator';
import { formatCompact } from '../numbers';
import { validateNumber, type NumericFieldError } from '../ranges';
import type {
  CrossCheck,
  VentilationCalculation,
  VentilationInput,
  VentilationOutcome,
  VentilationReading,
} from './types';

export interface VentilationAnswers {
  /** id da escolha → id da opção. */
  choices?: Readonly<Record<string, string | undefined>>;
  /** id do campo → texto digitado, com vírgula ou ponto. */
  inputs?: Readonly<Record<string, string | undefined>>;
}

export type VentilationEvaluation =
  | {
      status: 'pending';
      /** Escolhas sem resposta e campos vazios, pelo rótulo. */
      missing: readonly string[];
      /** Campos com valor inválido ou fora da faixa aceita, por id. */
      errors: Readonly<Record<string, NumericFieldError>>;
      /** Regras entre campos que não fecham (só com todos os campos válidos). */
      failedChecks: readonly CrossCheck[];
    }
  | {
      status: 'complete';
      outcome: VentilationOutcome;
      answers: readonly AnswerLine[];
    };

/**
 * Aviso de faixa habitual do ANY para o que está digitado: só para valor
 * válido e dentro da faixa aceita (fora dela o campo já mostra erro). Não
 * impede a conta, como no ANY.
 */
export function usualRangeWarning(input: VentilationInput, raw: string): string | null {
  if (!input.usual) return null;
  const checked = validateNumber(raw, input);
  if (!checked.ok) return null;
  const { min, max, message } = input.usual;
  return checked.value < min || checked.value > max ? message : null;
}

/**
 * Valida e, só com tudo respondido, dentro da faixa e coerente entre campos,
 * calcula. Valor fora da faixa ou regra violada nunca vira resultado.
 */
export function evaluateVentilation(
  calculation: VentilationCalculation,
  answers: VentilationAnswers,
): VentilationEvaluation {
  const missing: string[] = [];
  const errors: Record<string, NumericFieldError> = {};
  const values: Record<string, number> = {};
  const choices: Record<string, string> = {};
  const lines: AnswerLine[] = [];

  for (const choice of calculation.choices ?? []) {
    const optionId = answers.choices?.[choice.id];
    const option = choice.options.find(({ id }) => id === optionId);
    if (!option) {
      missing.push(choice.label);
      continue;
    }
    choices[choice.id] = option.id;
    lines.push({ label: choice.label, answer: option.label });
  }

  for (const input of calculation.inputs) {
    const checked = validateNumber(answers.inputs?.[input.id] ?? '', input);
    if (checked.ok) {
      values[input.id] = checked.value;
      lines.push({ label: input.label, answer: `${formatCompact(checked.value)} ${input.unit}` });
    } else if (checked.error.kind === 'empty') {
      missing.push(input.label);
    } else {
      errors[input.id] = checked.error;
    }
  }

  if (missing.length > 0 || Object.keys(errors).length > 0) {
    return { status: 'pending', missing, errors, failedChecks: [] };
  }

  const failedChecks = (calculation.checks ?? []).filter((check) => !check.holds(values));
  if (failedChecks.length > 0) {
    return { status: 'pending', missing, errors, failedChecks };
  }

  return { status: 'complete', outcome: calculation.compute(values, choices), answers: lines };
}

/** "Rva: 16,7 cmH₂O/L/s", "IA: 25,0%", "SpO₂ > 97%" — o texto do resultado no ANY. */
export function formatReading(reading: VentilationReading): string {
  const value =
    reading.unit === ''
      ? reading.text
      : reading.unit === '%'
        ? `${reading.text}%`
        : `${reading.text} ${reading.unit}`;
  return reading.label ? `${reading.label}: ${value}` : value;
}

/**
 * Texto para o prontuário: resultado, faixa, o que foi digitado, as linhas
 * do resultado, a sugestão e a referência. Sem nome de paciente nem horário.
 */
export function buildVentilationChartNote(
  calculation: VentilationCalculation,
  result: { outcome: VentilationOutcome; answers: readonly AnswerLine[] },
): string {
  const { outcome } = result;
  const band = outcome.band ? ` — ${outcome.band.label}` : '';
  return [
    `${calculation.name}: ${formatReading(outcome.reading)}${band}.`,
    ...result.answers.map(({ label, answer }) => `- ${label}: ${answer}`),
    ...outcome.details.map((detail) => `- ${detail}`),
    ...(outcome.band?.action ? [`Sugestão: ${outcome.band.action}`] : []),
    ...(calculation.citation ? [`Referência: ${calculation.citation}`] : []),
  ].join('\n');
}
