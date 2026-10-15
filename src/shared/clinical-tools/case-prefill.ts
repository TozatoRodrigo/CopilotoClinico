import type { CaseToolFacts, CaseToolTarget } from '../contracts/clinical';
import type { CalculatorDefinition } from './calculator';
import { formatCompact } from './numbers';
import { WEIGHT_RANGES, type WeightPopulation } from './ranges';
import { getCalculator } from './registry';
import { WELLS_TEP } from './tep/wells';

/**
 * Ferramenta aberta pelo plano já preenchida com o caso (CC-332). Cada
 * calculadora declara aqui o que o caso preenche: campo numérico direto (FC,
 * PAS) ou item cuja resposta sai do número pelo mesmo limiar do rótulo
 * ("FC ≥ 100 bpm" com FC 112 → Sim). A tela marca o que veio daqui como
 * "vindo do caso" e o médico confirma ou troca.
 *
 * Regra de segurança: quando o número do caso não decide o item, ele fica
 * vazio. O "SpO₂ < 95% em ar ambiente" do PERC só vira Sim; o Não exigiria
 * saber que a medida foi em ar ambiente, e um PERC negativo afasta TEP.
 */

type Fact = Exclude<keyof CaseToolFacts, 'sex'>;

interface ItemBinding {
  item: string;
  /** Opção escolhida a partir do caso; `null` quando o caso não decide. */
  answer: (facts: CaseToolFacts) => string | null;
}

interface InputBinding {
  input: string;
  fact: Fact;
}

interface CalculatorCaseBinding {
  items?: readonly ItemBinding[];
  inputs?: readonly InputBinding[];
}

/** Sim/Não pelo limiar do rótulo; sem o número, o item fica vazio. */
function yesNo(fact: Fact, isYes: (value: number) => boolean) {
  return (facts: CaseToolFacts): string | null => {
    const value = facts[fact];
    if (value === null) return null;
    return isYes(value) ? 'sim' : 'nao';
  };
}

/** Só o Sim: o Não pediria um dado que o caso não traz (ver cabeçalho). */
function yesOnly(fact: Fact, isYes: (value: number) => boolean) {
  return (facts: CaseToolFacts): string | null => {
    const value = facts[fact];
    return value !== null && isYes(value) ? 'sim' : null;
  };
}

/**
 * O que o caso preenche em cada calculadora, pelo id da definição. Os
 * limiares repetem os dos rótulos dos itens (o teste confere os dois lados de
 * cada limiar). Calculadora fora da lista abre vazia.
 */
export const CALCULATOR_CASE_BINDINGS: Readonly<Record<string, CalculatorCaseBinding>> = {
  // PERC: "Idade ≥ 50 anos", "FC ≥ 100 bpm", "SpO₂ < 95% em ar ambiente".
  'perc-rule': {
    items: [
      { item: 'age', answer: yesNo('ageYears', (age) => age >= 50) },
      { item: 'hr', answer: yesNo('heartRate', (hr) => hr >= 100) },
      { item: 'spo2', answer: yesOnly('spo2', (spo2) => spo2 < 95) },
    ],
  },
  // Wells TEP (dentro do roteiro de TEP): "FC > 100 bpm".
  'wells-tep': {
    items: [{ item: 'hr', answer: yesNo('heartRate', (hr) => hr > 100) }],
  },
  // CURB-65: "FR ≥ 30 irpm", "PAS < 90 ou PAD ≤ 60 mmHg", "Idade ≥ 65 anos".
  curb65: {
    items: [
      { item: 'rr', answer: yesNo('respiratoryRate', (rr) => rr >= 30) },
      {
        item: 'bp',
        answer: ({ systolicBp, diastolicBp }) => {
          if (
            (systolicBp !== null && systolicBp < 90) ||
            (diastolicBp !== null && diastolicBp <= 60)
          ) {
            return 'sim';
          }
          // O Não exige as duas pressões: PAS normal com PAD desconhecida não decide.
          return systolicBp !== null && diastolicBp !== null ? 'nao' : null;
        },
      },
      { item: 'age', answer: yesNo('ageYears', (age) => age >= 65) },
    ],
  },
  // HEART: idade "< 45", "45–64", "≥ 65".
  'heart-score': {
    items: [
      {
        item: 'age',
        answer: ({ ageYears }) =>
          ageYears === null ? null : ageYears < 45 ? 'lt45' : ageYears < 65 ? '45-64' : 'gte65',
      },
    ],
  },
  // Ottawa HSA: "Idade ≥ 40 anos".
  'ottawa-hsa': {
    items: [{ item: 'age40', answer: yesNo('ageYears', (age) => age >= 40) }],
  },
  // Alvarado: "Temperatura ≥ 37,3 graus Celsius".
  alvarado: {
    items: [{ item: 'temp', answer: yesNo('temperature', (temp) => temp >= 37.3) }],
  },
  // Índice de choque: FC e PAS, campo a campo.
  'shock-index': {
    inputs: [
      { input: 'hr', fact: 'heartRate' },
      { input: 'sbp', fact: 'systolicBp' },
    ],
  },
};

export interface CalculatorPrefill {
  /** id do item → id da opção. */
  items: Record<string, string>;
  /** id do campo → valor já escrito como a tela mostra ("37,5"). */
  inputs: Record<string, string>;
}

/**
 * As respostas que o caso dá a uma calculadora. Opção que não existe no
 * item, ou número fora da faixa do campo, não entra: a calculadora nunca abre
 * com um valor que ela mesma recusaria.
 */
export function calculatorCasePrefill(
  definition: CalculatorDefinition,
  facts: CaseToolFacts,
): CalculatorPrefill {
  const binding = CALCULATOR_CASE_BINDINGS[definition.id];
  const prefill: CalculatorPrefill = { items: {}, inputs: {} };
  if (!binding) return prefill;

  for (const { item: itemId, answer } of binding.items ?? []) {
    const optionId = answer(facts);
    const item = definition.items?.find(({ id }) => id === itemId);
    if (optionId !== null && item?.options.some(({ id }) => id === optionId)) {
      prefill.items[itemId] = optionId;
    }
  }

  const inputs = definition.kind === 'formula' ? definition.inputs : [];
  for (const { input: inputId, fact } of binding.inputs ?? []) {
    const value = facts[fact];
    const input = inputs.find(({ id }) => id === inputId);
    if (value !== null && input && value >= input.min && value <= input.max) {
      prefill.inputs[inputId] = formatCompact(value);
    }
  }
  return prefill;
}

/** Peso do caso escrito como o campo de peso mostra ("72,5"), se couber na faixa da população. */
export function caseWeightText(facts: CaseToolFacts, population: WeightPopulation): string | null {
  const { weightKg } = facts;
  const range = WEIGHT_RANGES[population];
  return weightKg !== null && weightKg >= range.min && weightKg <= range.max
    ? formatCompact(weightKg)
    : null;
}

/** Idade do caso escrita como o campo de idade da Pediatria mostra. */
export function caseAgeText(facts: CaseToolFacts): string | null {
  return facts.ageYears === null ? null : formatCompact(facts.ageYears);
}

/**
 * Mesmo valor que o caso preencheu? Compara como número quando os dois são
 * números ("70" e "70,0"), senão como texto. É o que decide a marca "vindo do
 * caso": o médico trocou o valor, a marca sai.
 */
export function sameAsCase(
  current: string | undefined,
  fromCase: string | null | undefined,
): boolean {
  if (current === undefined || fromCase === null || fromCase === undefined) return false;
  const a = current.trim();
  const b = fromCase.trim();
  if (a === '' || b === '') return false;
  const numberA = Number(a.replace(',', '.'));
  const numberB = Number(b.replace(',', '.'));
  return Number.isFinite(numberA) && Number.isFinite(numberB) ? numberA === numberB : a === b;
}

/**
 * O que cada roteiro recebe do caso: o peso (o adulto é comum a todas as
 * ferramentas adultas), a idade e as calculadoras de dentro dele. Roteiro
 * fora da lista abre sem nada do caso (ACLS, Toxicologia, Ventilação).
 */
export const TOOL_CASE_INPUTS: Readonly<
  Record<string, { weight?: WeightPopulation; age?: true; calculators?: readonly string[] }>
> = {
  infusoes: { weight: 'adulto' },
  'choque-septico': { weight: 'adulto' },
  'via-aerea': { weight: 'adulto' },
  sedacao: { weight: 'adulto' },
  dengue: { weight: 'adulto' },
  bloqueios: { weight: 'adulto' },
  'cad-ehh': { weight: 'adulto' },
  pediatria: { weight: 'pediatrico', age: true },
  tep: { calculators: [WELLS_TEP.id, 'perc-rule'] },
};

/** Definição pelo id, inclusive as de dentro de um roteiro (o Wells do TEP). */
export function caseCalculatorDefinition(id: string): CalculatorDefinition | undefined {
  return id === WELLS_TEP.id ? WELLS_TEP : getCalculator(id);
}

function prefillCount(definition: CalculatorDefinition | undefined, facts: CaseToolFacts): number {
  if (!definition) return 0;
  const prefill = calculatorCasePrefill(definition, facts);
  return Object.keys(prefill.items).length + Object.keys(prefill.inputs).length;
}

/** Quantos campos a ferramenta abre já preenchidos com o caso (o botão do plano diz). */
export function caseFieldCount(target: CaseToolTarget, facts: CaseToolFacts): number {
  if (target.kind === 'calculator') {
    return prefillCount(caseCalculatorDefinition(target.calculatorId), facts);
  }
  const inputs = TOOL_CASE_INPUTS[target.toolId];
  if (!inputs) return 0;
  return (
    Number(inputs.weight !== undefined && caseWeightText(facts, inputs.weight) !== null) +
    Number(inputs.age === true && caseAgeText(facts) !== null) +
    (inputs.calculators ?? []).reduce(
      (count, id) => count + prefillCount(caseCalculatorDefinition(id), facts),
      0,
    )
  );
}
