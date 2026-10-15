import { formatCompact, formatDecimal } from './numbers';
import type { ContentProvenance } from './provenance';
import { validateNumber, type NumericFieldError, type NumericRange } from './ranges';
import type { ResultTone } from './tone';

/**
 * Definição de calculadora como dado (ADR-017): itens, faixas, textos e
 * referência ficam aqui, e a tela só desenha. Nenhuma dose ou limiar mora em
 * componente.
 */

export interface ScoreOption {
  id: string;
  label: string;
  points: number;
}

export interface ScoreItem {
  id: string;
  label: string;
  options: readonly ScoreOption[];
}

export interface NumericInput extends NumericRange {
  id: string;
  label: string;
  /** Passo do valor digitado; só orienta o teclado e o gerador de teste. */
  step: number;
}

interface BandContent {
  id: string;
  /** Nome da faixa ("Alto risco"). Vai junto do tom: estado nunca só por cor. */
  label: string;
  tone: ResultTone;
  /** Ação sugerida, em linguagem de sugestão ("considere …"). */
  action: string;
}

/** Faixa com limite superior; as faixas são lidas em ordem e vale a primeira que cabe. */
export interface BoundedBand extends BandContent {
  upTo: { value: number; inclusive: boolean };
}

export interface Interpretation {
  /** Em ordem crescente de limite. */
  bands: readonly BoundedBand[];
  /** Acima do último limite. */
  otherwise: BandContent;
}

export type ResultBand = BandContent & { upTo?: BoundedBand['upTo'] };

export interface CalculatorReference {
  why: string;
  whenToUse: string;
  pearlsPitfalls: readonly string[];
  citation: string;
}

interface CalculatorBase {
  id: string;
  name: string;
  /** Sinônimos para a busca ("fa", "anticoagulação"). */
  aliases: readonly string[];
  /** Categoria de origem no ANY ("Cardiologia / SCA"). */
  category: string;
  description: string;
  reference: CalculatorReference;
  provenance: ContentProvenance;
  interpretation: Interpretation;
}

/** Soma de pontos dos itens. */
export interface ScoreCalculator extends CalculatorBase {
  kind: 'score';
  items: readonly ScoreItem[];
}

/** Um item escolhe a classe (Hunt-Hess, Mallampati); o valor é o grau. */
export interface ClassificationCalculator extends CalculatorBase {
  kind: 'classification';
  items: readonly ScoreItem[];
}

/** Conta sobre campos numéricos (e, se houver, itens de escolha). */
export interface FormulaCalculator extends CalculatorBase {
  kind: 'formula';
  inputs: readonly NumericInput[];
  items?: readonly ScoreItem[];
  /** Casas decimais do resultado na tela e no prontuário. */
  decimals: number;
  /** Unidade do resultado, quando houver ("mmHg"). */
  unit?: string;
  /**
   * Recebe só valores já validados (dentro da faixa). Arredonde aqui do mesmo
   * jeito que a referência, porque a faixa é lida sobre o valor arredondado.
   */
  compute: (values: Readonly<Record<string, number>>) => number;
}

export type CalculatorDefinition = ScoreCalculator | ClassificationCalculator | FormulaCalculator;

export interface CalculatorAnswers {
  /** id do item → id da opção escolhida. */
  items?: Readonly<Record<string, string | undefined>>;
  /** id do campo → texto digitado, com vírgula ou ponto. */
  inputs?: Readonly<Record<string, string | undefined>>;
}

/** Uma linha do resumo das respostas ("Hipertensão (H): Sim"). */
export interface AnswerLine {
  label: string;
  answer: string;
}

export type CalculatorEvaluation =
  | {
      status: 'pending';
      /** Itens sem resposta e campos vazios, pelo rótulo. */
      missing: readonly string[];
      /** Campos preenchidos com valor inválido ou fora da faixa, por id. */
      errors: Readonly<Record<string, NumericFieldError>>;
    }
  | {
      status: 'complete';
      value: number;
      band: ResultBand;
      answers: readonly AnswerLine[];
    };

/**
 * Lê um valor dentro do `compute`. O motor só chama `compute` com todos os
 * campos validados, então a falta de um é erro de definição: falha alto em vez
 * de virar NaN, que cairia na última faixa (a mais grave) sem ninguém notar.
 */
export function requireValue(values: Readonly<Record<string, number>>, id: string): number {
  const value = values[id];
  if (value === undefined) {
    throw new Error(`Campo "${id}" ausente no cálculo; confira a definição da calculadora.`);
  }
  return value;
}

export function findBand(interpretation: Interpretation, value: number): ResultBand {
  const band = interpretation.bands.find(({ upTo }) =>
    upTo.inclusive ? value <= upTo.value : value < upTo.value,
  );
  return band ?? interpretation.otherwise;
}

function itemsOf(definition: CalculatorDefinition): readonly ScoreItem[] {
  return definition.items ?? [];
}

function formatPoints(points: number): string {
  return points > 0 ? ` (+${formatCompact(points)})` : '';
}

/**
 * Valida as respostas e, só se tudo estiver respondido e dentro da faixa,
 * calcula e interpreta. Valor fora da faixa nunca vira resultado.
 */
export function evaluateCalculator(
  definition: CalculatorDefinition,
  answers: CalculatorAnswers,
): CalculatorEvaluation {
  const missing: string[] = [];
  const errors: Record<string, NumericFieldError> = {};
  const values: Record<string, number> = {};
  const lines: AnswerLine[] = [];

  for (const item of itemsOf(definition)) {
    const optionId = answers.items?.[item.id];
    const option = item.options.find(({ id }) => id === optionId);
    if (!option) {
      missing.push(item.label);
      continue;
    }
    values[item.id] = option.points;
    lines.push({ label: item.label, answer: `${option.label}${formatPoints(option.points)}` });
  }

  if (definition.kind === 'formula') {
    for (const input of definition.inputs) {
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
  }

  if (missing.length > 0 || Object.keys(errors).length > 0) {
    return { status: 'pending', missing, errors };
  }

  const value =
    definition.kind === 'formula'
      ? definition.compute(values)
      : itemsOf(definition).reduce((sum, item) => sum + (values[item.id] ?? 0), 0);

  return {
    status: 'complete',
    value,
    band: findBand(definition.interpretation, value),
    answers: lines,
  };
}

/** "3 pontos", "Grau 2", "1,22", "72 mmHg". */
export function formatResultValue(definition: CalculatorDefinition, value: number): string {
  switch (definition.kind) {
    case 'score':
      return `${formatCompact(value)} ${value === 1 ? 'ponto' : 'pontos'}`;
    case 'classification':
      return formatCompact(value);
    case 'formula': {
      const formatted = formatDecimal(value, definition.decimals);
      return definition.unit ? `${formatted} ${definition.unit}` : formatted;
    }
  }
}
