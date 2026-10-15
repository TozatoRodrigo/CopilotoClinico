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
  /**
   * `parameter`: o valor da opção entra na fórmula como parâmetro (fator de
   * água corporal, potência do corticoide, código do sexo), não como ponto.
   * A tela e o prontuário não mostram "+N" ao lado dele. Padrão: `points`.
   */
  role?: 'points' | 'parameter';
}

export interface NumericInput extends NumericRange {
  id: string;
  label: string;
  /** Passo do valor digitado; só orienta o teclado e o gerador de teste. */
  step: number;
  /** Valor já preenchido ao abrir a calculadora, como no ANY (FiO₂ 21%, albumina 4). */
  defaultValue?: number;
  /**
   * Campo opcional: vazio, a conta usa `defaultValue` (no ANY, `v.albumin || 4.0`).
   * Só faz sentido com `defaultValue`.
   */
  optional?: boolean;
}

export interface BandContent {
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

/** Faixas por limite do valor: a forma da maioria dos escores. */
export interface Interpretation {
  /** Em ordem crescente de limite. */
  bands: readonly BoundedBand[];
  /** Acima do último limite. */
  otherwise: BandContent;
}

/**
 * Faixa escolhida por regra, quando o valor sozinho não decide: o CAM-ICU
 * pede F1 e F2 e (F3 ou F4); Winters compara a pCO2 medida com a esperada;
 * Rumack-Matthew compara o nível com a linha. Os textos continuam como dado em
 * `bands`; a regra só devolve o id. Monte com `byRule`, que amarra o id ao
 * tipo das faixas.
 */
export interface RuleInterpretation {
  bands: readonly BandContent[];
  select: (value: number, values: Readonly<Record<string, number>>) => string;
}

export type ResultBand = BandContent & { upTo?: BoundedBand['upTo'] };

/** Linha secundária do resultado, já escrita ("QTc de Fridericia: 452 ms"). */
export interface ResultDetail {
  label: string;
  value: string;
}

/** O que a conta pode precisar além das respostas. Hoje só a data (idade gestacional, DPP). */
export interface EvaluationContext {
  today: Date;
}

/** Aviso de que a calculadora não é a versão oficial do escore. */
export interface VersionNotice {
  /** "Versão aproximada", "Versão simplificada". */
  title: string;
  text: string;
}

export interface CalculatorReference {
  why: string;
  whenToUse: string;
  pearlsPitfalls: readonly string[];
  citation: string;
}

type Values = Readonly<Record<string, number>>;

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
  interpretation: Interpretation | RuleInterpretation;
  /**
   * Aviso fixo de versão (GRACE "aproximação", APACHE II "simplificado"):
   * aparece acima dos campos e vai junto no texto do prontuário.
   */
  versionNotice?: VersionNotice;
  /**
   * Roteiro do ANY em que a calculadora também existe (`availableIn`), pelo
   * id da ferramenta no catálogo. A tela só mostra o link quando o roteiro
   * estiver disponível no Copiloto.
   */
  pathway?: { toolId: string };
  /**
   * Escrita do valor principal quando a regra do tipo não serve ("12 sem 3 d",
   * "+3"). `null` esconde o número: a faixa é o resultado (CAM-ICU, Forrest).
   */
  formatValue?: (value: number) => string | null;
  /** Resultados secundários da mesma conta (QTc de Fridericia, divisão do Parkland). */
  details?: (value: number, values: Values, context: EvaluationContext) => readonly ResultDetail[];
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

/** Combinação de campos que não pode ser calculada, com a mensagem para o médico. */
export interface InputIssue {
  /** Campo que recebe o destaque. */
  inputId: string;
  message: string;
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
  compute: (values: Values, context: EvaluationContext) => number;
  /**
   * Confere a combinação dos campos depois de cada um passar na própria faixa
   * (31/02 não existe; DUM no futuro). Com problema, nada é calculado.
   */
  check?: (values: Values, context: EvaluationContext) => InputIssue | null;
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

/** Erro de um campo: o da própria faixa ou o da combinação (`check`). */
export type CalculatorFieldError = NumericFieldError | { kind: 'inconsistent'; message: string };

export type CalculatorEvaluation =
  | {
      status: 'pending';
      /** Itens sem resposta e campos vazios, pelo rótulo. */
      missing: readonly string[];
      /** Campos preenchidos com valor inválido, fora da faixa ou incoerente, por id. */
      errors: Readonly<Record<string, CalculatorFieldError>>;
    }
  | {
      status: 'complete';
      value: number;
      band: ResultBand;
      answers: readonly AnswerLine[];
      details: readonly ResultDetail[];
    };

/**
 * Lê um valor dentro do `compute`. O motor só chama `compute` com todos os
 * campos validados, então a falta de um é erro de definição: falha alto em vez
 * de virar NaN, que cairia na última faixa (a mais grave) sem ninguém notar.
 */
export function requireValue(values: Values, id: string): number {
  const value = values[id];
  if (value === undefined) {
    throw new Error(`Campo "${id}" ausente no cálculo; confira a definição da calculadora.`);
  }
  return value;
}

/**
 * Interpretação por regra com o id amarrado às faixas: a regra só pode
 * devolver um id que existe, e o TypeScript confere.
 */
export function byRule<const Id extends string>(
  bands: readonly (BandContent & { id: Id })[],
  select: (value: number, values: Values) => Id,
): RuleInterpretation {
  return { bands, select };
}

export function isRuleInterpretation(
  interpretation: Interpretation | RuleInterpretation,
): interpretation is RuleInterpretation {
  return 'select' in interpretation;
}

/** Todas as faixas possíveis, na ordem da definição. */
export function allBands(interpretation: Interpretation | RuleInterpretation): BandContent[] {
  return isRuleInterpretation(interpretation)
    ? [...interpretation.bands]
    : [...interpretation.bands, interpretation.otherwise];
}

export function findBand(interpretation: Interpretation, value: number): ResultBand {
  const band = interpretation.bands.find(({ upTo }) =>
    upTo.inclusive ? value <= upTo.value : value < upTo.value,
  );
  return band ?? interpretation.otherwise;
}

/** Faixa do resultado, por limite ou por regra. */
export function interpretValue(
  interpretation: Interpretation | RuleInterpretation,
  value: number,
  values: Values,
): ResultBand {
  if (!isRuleInterpretation(interpretation)) return findBand(interpretation, value);
  const id = interpretation.select(value, values);
  const band = interpretation.bands.find((candidate) => candidate.id === id);
  if (!band) throw new Error(`Faixa "${id}" não existe; confira a definição da calculadora.`);
  return band;
}

function itemsOf(definition: CalculatorDefinition): readonly ScoreItem[] {
  return definition.items ?? [];
}

/**
 * Se o valor da opção é ponto que vale mostrar. Classificação não mostra (o
 * grau já está no rótulo e o código não é ponto) e parâmetro de fórmula
 * também não.
 */
export function itemShowsPoints(definition: CalculatorDefinition, item: ScoreItem): boolean {
  return definition.kind !== 'classification' && item.role !== 'parameter';
}

function formatPoints(points: number): string {
  return points > 0 ? ` (+${formatCompact(points)})` : ` (${formatCompact(points)})`;
}

function withUnit(value: string, unit: string | undefined): string {
  return unit ? `${value} ${unit}` : value;
}

function todayContext(): EvaluationContext {
  return { today: new Date() };
}

/**
 * Valida as respostas e, só se tudo estiver respondido e dentro da faixa,
 * calcula e interpreta. Valor fora da faixa nunca vira resultado.
 */
export function evaluateCalculator(
  definition: CalculatorDefinition,
  answers: CalculatorAnswers,
  context: EvaluationContext = todayContext(),
): CalculatorEvaluation {
  const missing: string[] = [];
  const errors: Record<string, CalculatorFieldError> = {};
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
    const points =
      itemShowsPoints(definition, item) && option.points !== 0 ? formatPoints(option.points) : '';
    lines.push({ label: item.label, answer: `${option.label}${points}` });
  }

  if (definition.kind === 'formula') {
    for (const input of definition.inputs) {
      const raw = answers.inputs?.[input.id] ?? '';
      if (raw.trim() === '' && input.optional && input.defaultValue !== undefined) {
        values[input.id] = input.defaultValue;
        lines.push({
          label: input.label,
          answer: `${withUnit(formatCompact(input.defaultValue), input.unit)} (padrão)`,
        });
        continue;
      }
      const checked = validateNumber(raw, input);
      if (checked.ok) {
        values[input.id] = checked.value;
        lines.push({
          label: input.label,
          answer: withUnit(formatCompact(checked.value), input.unit),
        });
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

  if (definition.kind === 'formula') {
    const issue = definition.check?.(values, context);
    if (issue) {
      return {
        status: 'pending',
        missing,
        errors: { [issue.inputId]: { kind: 'inconsistent', message: issue.message } },
      };
    }
  }

  const value =
    definition.kind === 'formula'
      ? definition.compute(values, context)
      : itemsOf(definition).reduce((sum, item) => sum + (values[item.id] ?? 0), 0);

  return {
    status: 'complete',
    value,
    band: interpretValue(definition.interpretation, value, values),
    answers: lines,
    details: definition.details?.(value, values, context) ?? [],
  };
}

/**
 * "3 pontos" (escore), "2" (classe; o nome vem na faixa), "1,22" ou "72 mmHg"
 * (fórmula), ou a escrita própria da definição. `null`: a faixa é o resultado
 * e não há número para mostrar.
 */
export function formatResultValue(definition: CalculatorDefinition, value: number): string | null {
  if (definition.formatValue) return definition.formatValue(value);
  switch (definition.kind) {
    case 'score':
      return `${formatCompact(value)} ${value === 1 ? 'ponto' : 'pontos'}`;
    case 'classification':
      return formatCompact(value);
    case 'formula':
      return withUnit(formatDecimal(value, definition.decimals), definition.unit);
  }
}
