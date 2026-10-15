import { describe, expect, it } from 'vitest';
import {
  evaluateCalculator,
  type CalculatorDefinition,
  type CalculatorEvaluation,
} from '../../src/shared/clinical-tools/calculator';
import { PERC_RULE } from '../../src/shared/clinical-tools/calculators/perc-rule';
import {
  categoryLabel,
  DISPOSITION_LABELS,
  RED_FLAGS,
  SUBSEGMENTAL_ALERT,
  TEP_CATEGORIES,
  TEP_CATEGORY_IDS,
  type TepCategoryId,
} from '../../src/shared/clinical-tools/tep/categories';
import {
  CLASSIFICATION,
  DIAGNOSIS,
  MANAGEMENT,
  STABILITY,
  UNSTABLE,
} from '../../src/shared/clinical-tools/tep/content';
import {
  ageAdjustedDDimerCutoff,
  D_DIMER_AGE_ADJUSTED,
  YEARS,
  YEARS_PREGNANCY,
  yearsDDimerCutoff,
} from '../../src/shared/clinical-tools/tep/d-dimer';
import { ECHO_RV } from '../../src/shared/clinical-tools/tep/echo';
import { infusionDrugHref } from '../../src/shared/clinical-tools/tep/links';
import {
  classificationAnswerFor,
  diagnosisActionFor,
  INITIAL_TEP_STATE,
  tepReducer,
  type TepAction,
  type TepAnswer,
  type TepPathwayState,
  type ThrombolysisStage,
} from '../../src/shared/clinical-tools/tep/pathway';
import { TEP_REFERENCE } from '../../src/shared/clinical-tools/tep/reference';
import { BOVA, HESTIA, PESI, SPESI } from '../../src/shared/clinical-tools/tep/severity';
import { WELLS_TEP } from '../../src/shared/clinical-tools/tep/wells';
import type { ResultTone } from '../../src/shared/clinical-tools/tone';
import { DIFFERENTIAL_CASES, seededRandom } from './seeded-random';
import {
  AnyTepSession,
  calcResults,
  collapsible,
  findAll,
  isElement,
  navigations,
  textOf,
  type AnyColor,
  type HeadlessElement,
  type HeadlessNode,
} from './tep-reference-driver';

/**
 * CC-318 — o roteiro e as calculadoras do TEP contra o `TepGuide.tsx`
 * congelado do ANY, rodado sem React (tep-reference-driver.ts). Cada caminho
 * da classificação (Q1–Q4 e o instável) é percorrido tocando nos botões do
 * ANY e aplicando a mesma resposta ao reducer; no fim, a categoria e cada
 * linha da conduta precisam bater. As nove calculadoras são conferidas em
 * todas as combinações de itens e em 1.000 valores aleatórios nos campos.
 *
 * Diferenças deliberadas, declaradas abaixo e em
 * docs/ferramentas/revisao-clinica/tep.md: linguagem (imperativo → sugestão),
 * "threshold" → "ponto de corte", o "Reiniciar" que também zera eco e
 * trombólise, e o D-dímero que reage também à troca da idade.
 */

const SEED = 20261015;

// ---- Texto ------------------------------------------------------------------------------------

/**
 * Texto comparável: sem acento, caixa, espaço e diferenças de tipografia
 * (–/—/-, ×/x, ª, ₂, µ/u, -> e →, >= e ≥).
 */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/->/g, '→')
    .replace(/>=/g, '≥')
    .replace(/<=/g, '≤')
    .replace(/[–—]/g, '-')
    .replace(/×/g, 'x')
    .replace(/ª/g, 'a')
    .replace(/º/g, 'o')
    .replace(/₂/g, '2')
    .replace(/µ/g, 'u')
    .replace(/°/g, '')
    .replace(/[\s•]/g, '');
}

/** Primeiro trecho antes do travessão ("Hestia negativo — considere…" → "Hestia negativo"). */
function head(text: string): string {
  return normalize(text.split(/\s*[—]\s*/)[0] ?? text);
}

function sameBandName(anyText: string, label: string): boolean {
  return normalize(anyText) === normalize(label) || head(anyText) === head(label);
}

/**
 * Trocas de texto em relação ao ANY (texto do ANY → texto do Copiloto). Só
 * linguagem e termo; nenhuma dose, limiar ou critério.
 */
const LANGUAGE_CHANGES: Readonly<Record<string, string>> = {
  'Reanimação hemodinâmica antes de diagnóstico. Inicie suporte imediatamente.':
    'Reanimação hemodinâmica antes de diagnóstico. Considere iniciar o suporte sem demora.',
  'TEP improvável — considere diagnósticos alternativos. Documente: PERC negativo + gestalt <15%.':
    'TEP improvável — considere diagnósticos alternativos. Considere documentar: PERC negativo + gestalt < 15%.',
  'PERC positivo — prossiga com D-dímero abaixo.': 'PERC positivo — considere D-dímero (abaixo).',
  'Utilize YEARS adaptado para gestação (COR 2b). USG de MMII se sintomas — se positivo, considere tratar sem CTPA.':
    'Considere YEARS adaptado para gestação (COR 2b). USG de MMII se sintomas — se positivo, considere tratar sem CTPA.',
  'Troponina e BNP/NT-proBNP são necessários para diferenciar C1, C2 e C3. Solicite precocemente.':
    'Troponina e BNP/NT-proBNP são necessários para diferenciar C1, C2 e C3. Considere solicitar precocemente.',
  'Queda de PAS <90 mmHg ou MAP <80 mmHg': 'Queda de PAS < 90 mmHg ou PAM < 80 mmHg',
  '→ Presenca de qualquer sinal: reclassifique e considere escalar terapia.':
    'Presença de qualquer sinal: considere reclassificar e escalar a terapia.',
  'Negativo (abaixo do threshold)': 'Negativo (abaixo do ponto de corte)',
  'Positivo (acima do threshold)': 'Positivo (acima do ponto de corte)',
  'Threshold = idade x 10 ug/L (FEU). Abaixo de 50 anos: usar 500 ug/L.':
    'Ponto de corte = idade × 10 µg/L (FEU). Abaixo de 50 anos: usar 500 µg/L.',
  '≥1 critério YEARS: threshold 500 ug/L. Nenhum critério: threshold 1000 ug/L.':
    '≥ 1 critério YEARS: ponto de corte 500 µg/L. Nenhum critério: ponto de corte 1000 µg/L.',
  '≥1 critério: threshold 500 ug/L. Nenhum: threshold 1000 ug/L.':
    '≥ 1 critério: ponto de corte 500 µg/L. Nenhum: ponto de corte 1000 µg/L.',
  'Presenca de qualquer sinal: reclassifique e considere escalar terapia.':
    'Presença de qualquer sinal: considere reclassificar e escalar a terapia.',
  'Reiniciar pathway': 'Reiniciar roteiro',
};

function expectedText(anyText: string): string {
  return LANGUAGE_CHANGES[anyText.trim()] ?? anyText;
}

function sameText(anyText: string, ours: string): boolean {
  return normalize(expectedText(anyText)) === normalize(ours);
}

// ---- Calculadoras -----------------------------------------------------------------------------

const ANY_TONE: Record<AnyColor, ResultTone | null> = {
  green: 'neutral',
  yellow: 'attention',
  orange: 'attention',
  red: 'critical',
  blue: 'neutral',
  neutral: null,
};

type Complete = Extract<CalculatorEvaluation, { status: 'complete' }>;

function complete(evaluation: CalculatorEvaluation): Complete {
  if (evaluation.status !== 'complete') {
    throw new Error(`esperava resultado, veio ${JSON.stringify(evaluation)}`);
  }
  return evaluation;
}

/** Respostas "Não/Sim" a partir dos checkboxes do ANY, na ordem dos itens. */
function yesNo(definition: CalculatorDefinition, checked: readonly boolean[]) {
  const items = definition.items ?? [];
  expect(checked).toHaveLength(items.length);
  return Object.fromEntries(items.map((item, index) => [item.id, checked[index] ? 'sim' : 'nao']));
}

function* everyChecklist(size: number): Generator<boolean[]> {
  for (let mask = 0; mask < 2 ** size; mask += 1) {
    yield Array.from({ length: size }, (_, index) => Boolean(mask & (1 << index)));
  }
}

function firstNumber(text: string | null): number {
  const match = text?.match(/-?\d+(\.\d+)?/);
  if (!match) throw new Error(`sem número em "${text}"`);
  return Number(match[0]);
}

function allNumbers(text: string | null): number[] {
  return [...(text ?? '').matchAll(/\d+(\.\d+)?/g)].map((match) => Number(match[0]));
}

interface Mismatch {
  case: string;
  any: unknown;
  ours: unknown;
}

function compareResult(
  caseLabel: string,
  anyResult: { score: string | null; text: string; color: AnyColor } | undefined,
  ours: Complete,
  expectedValue: number,
): Mismatch | null {
  if (!anyResult) return { case: caseLabel, any: 'sem resultado', ours: ours.band };
  const anyValue = firstNumber(anyResult.score);
  const sameValue = anyValue === expectedValue && ours.value === expectedValue;
  if (
    !sameValue ||
    !sameBandName(anyResult.text, ours.band.label) ||
    ANY_TONE[anyResult.color] !== ours.band.tone
  ) {
    return {
      case: caseLabel,
      any: anyResult,
      ours: { value: ours.value, label: ours.band.label, tone: ours.band.tone },
    };
  }
  return null;
}

interface ChecklistPort {
  definition: CalculatorDefinition;
  title: string;
  state:
    | 'calcWellsChecked'
    | 'calcPercChecked'
    | 'calcSpesiChecked'
    | 'calcBovaChecked'
    | 'calcHestiaChecked';
  /** Rótulos dos itens no TepGuide (o PERC reaproveitado tem rótulos do catálogo). */
  sameLabels: boolean;
}

const CHECKLIST_PORTS: readonly ChecklistPort[] = [
  {
    definition: WELLS_TEP,
    title: 'Wells Score para TEP',
    state: 'calcWellsChecked',
    sameLabels: true,
  },
  {
    definition: PERC_RULE,
    title: 'PERC (PE Rule-Out Criteria)',
    state: 'calcPercChecked',
    sameLabels: false,
  },
  {
    definition: SPESI,
    title: 'sPESI (simplified PESI)',
    state: 'calcSpesiChecked',
    sameLabels: true,
  },
  { definition: BOVA, title: 'Bova Score', state: 'calcBovaChecked', sameLabels: true },
  { definition: HESTIA, title: 'Hestia Criteria', state: 'calcHestiaChecked', sameLabels: true },
];

/** Rótulos dos itens do checklist do ANY, na ordem. */
function anyChecklistLabels(node: HeadlessNode): string[] {
  return findAll(node, (element) => element.type === 'button').map((button) => {
    const spans = button.children.filter(isElement);
    return textOf(spans[1]);
  });
}

describe('TEP × ANY — calculadoras da aba Calculadoras', () => {
  describe.each(CHECKLIST_PORTS.map((port) => [port.definition.id, port] as const))(
    '%s',
    (_id, port) => {
      const items = port.definition.items ?? [];

      it('tem os mesmos itens e pontos do ANY', () => {
        const session = new AnyTepSession({ view: 'calc' });
        const block = collapsible(session.tree, port.title);
        const labels = anyChecklistLabels(block);
        expect(labels).toHaveLength(items.length);
        if (port.sameLabels) {
          expect(items.map(({ label }) => normalize(label))).toEqual(labels.map(normalize));
        }
        const points = findAll(
          block,
          (element) => element.type === 'span' && textOf(element).startsWith('+'),
        ).map((span) => Number(textOf(span).slice(1).replace(',', '.')));
        const ours = items.map((item) => item.options.find(({ id }) => id === 'sim')?.points);
        // Checklist sem pontos no ANY conta 1 por item.
        expect(points.length > 0 ? points : items.map(() => 1)).toEqual(ours);
      });

      it(`dá o mesmo valor, faixa e tom em todas as ${2 ** items.length} combinações`, () => {
        const mismatches: Mismatch[] = [];
        for (const checked of everyChecklist(items.length)) {
          const session = new AnyTepSession({ view: 'calc', [port.state]: checked });
          const [anyResult] = calcResults(collapsible(session.tree, port.title));
          const ours = complete(
            evaluateCalculator(port.definition, { items: yesNo(port.definition, checked) }),
          );
          const mismatch = compareResult(checked.map(Number).join(''), anyResult, ours, ours.value);
          if (mismatch) mismatches.push(mismatch);
        }
        expect(mismatches.slice(0, 5)).toEqual([]);
      });
    },
  );

  it('Wells modificado (> 4) igual ao do ANY em todas as combinações', () => {
    for (const checked of everyChecklist(7)) {
      const session = new AnyTepSession({ view: 'calc', calcWellsChecked: checked });
      const block = collapsible(session.tree, 'Wells Score para TEP');
      const anyLine = findAll(block, (element) =>
        textOf(element).startsWith('Wells modificado:'),
      ).at(-1);
      const ours = complete(evaluateCalculator(WELLS_TEP, { items: yesNo(WELLS_TEP, checked) }))
        .details[0];
      expect(normalize(textOf(anyLine))).toBe(normalize(`${ours?.label}: ${ours?.value}`));
    }
  });

  it('PESI: idade + itens, classes I–V, em todas as combinações nas bordas e 1.000 aleatórias', () => {
    const random = seededRandom(SEED);
    const mismatches: Mismatch[] = [];
    const check = (age: number, checked: boolean[]) => {
      const session = new AnyTepSession({
        view: 'calc',
        calcPesiAge: age,
        calcPesiChecked: checked,
      });
      const [anyResult] = calcResults(
        collapsible(session.tree, 'PESI (Pulmonary Embolism Severity Index)'),
      );
      const ours = complete(
        evaluateCalculator(PESI, {
          inputs: { age: String(age) },
          items: yesNo(PESI, checked),
        }),
      );
      const mismatch = compareResult(
        `${age}/${checked.map(Number).join('')}`,
        anyResult,
        ours,
        ours.value,
      );
      if (mismatch) mismatches.push(mismatch);
    };
    for (const age of [18, 35, 45, 55, 65, 66, 85, 86, 105, 106, 120]) {
      for (const checked of everyChecklist(10)) check(age, checked);
    }
    for (let index = 0; index < DIFFERENTIAL_CASES; index += 1) {
      check(
        random.integer(18, 120),
        Array.from({ length: 10 }, () => random.next() < 0.3),
      );
    }
    expect(mismatches.slice(0, 5)).toEqual([]);
  });

  it(`D-dímero ajustado: mesmo ponto de corte e resultado em ${DIFFERENTIAL_CASES} casos e nas bordas`, () => {
    const random = seededRandom(SEED + 1);
    const mismatches: Mismatch[] = [];
    const check = (age: number, value: number) => {
      const session = new AnyTepSession({
        view: 'calc',
        calcDdimerAge: age,
        calcDdimerValue: String(value),
      });
      const [anyResult] = calcResults(collapsible(session.tree, 'D-dímero ajustado por idade'));
      const ours = complete(
        evaluateCalculator(D_DIMER_AGE_ADJUSTED, {
          inputs: { age: String(age), 'd-dimer': String(value) },
        }),
      );
      const [, anyCutoff] = allNumbers(anyResult?.score ?? null);
      const mismatch =
        compareResult(`${age} anos, ${value}`, anyResult, ours, value) ??
        (anyCutoff === ageAdjustedDDimerCutoff(age)
          ? null
          : { case: `${age} anos`, any: anyCutoff, ours: ageAdjustedDDimerCutoff(age) });
      if (mismatch) mismatches.push(mismatch);
    };
    for (const age of [18, 49, 50, 51, 80, 120]) {
      const cutoff = ageAdjustedDDimerCutoff(age);
      for (const value of [10, cutoff - 1, cutoff, cutoff + 1, 100000]) check(age, value);
    }
    for (let index = 0; index < DIFFERENTIAL_CASES; index += 1) {
      const age = random.integer(18, 120);
      const near = random.next() < 0.5;
      const value = near
        ? ageAdjustedDDimerCutoff(age) + random.integer(-20, 20)
        : random.integer(10, 5000);
      check(age, value);
    }
    expect(mismatches.slice(0, 5)).toEqual([]);
  });

  describe.each([
    ['YEARS', YEARS, 'Algoritmo YEARS', 'calcYearsChecked', 'calcYearsDD'],
    [
      'YEARS gestante',
      YEARS_PREGNANCY,
      'YEARS adaptado para gestantes',
      'calcYearsPregChecked',
      'calcYearsPregDD',
    ],
  ] as const)('%s', (_name, definition, title, checkedKey, valueKey) => {
    it('tem os mesmos três critérios do ANY', () => {
      const session = new AnyTepSession({ view: 'calc' });
      expect(anyChecklistLabels(collapsible(session.tree, title)).map(normalize)).toEqual(
        (definition.items ?? []).map(({ label }) => normalize(label)),
      );
    });

    it(`dá o mesmo resultado nas 8 combinações × ${DIFFERENTIAL_CASES} valores`, () => {
      const random = seededRandom(SEED + 2);
      const mismatches: Mismatch[] = [];
      const combos = [...everyChecklist(3)];
      const check = (checked: boolean[], value: number) => {
        const session = new AnyTepSession({
          view: 'calc',
          [checkedKey]: checked,
          [valueKey]: String(value),
        });
        const [anyResult] = calcResults(collapsible(session.tree, title));
        const ours = complete(
          evaluateCalculator(definition, {
            items: yesNo(definition, checked),
            inputs: { 'd-dimer': String(value) },
          }),
        );
        const cutoff = yearsDDimerCutoff(checked.filter(Boolean).length);
        const [, anyCutoff] = allNumbers(anyResult?.score ?? null);
        const mismatch =
          compareResult(`${checked.map(Number).join('')}/${value}`, anyResult, ours, value) ??
          (anyCutoff === cutoff ? null : { case: `${checked}`, any: anyCutoff, ours: cutoff });
        if (mismatch) mismatches.push(mismatch);
      };
      for (const checked of combos) {
        for (const value of [10, 499, 500, 501, 999, 1000, 1001, 100000]) check(checked, value);
      }
      for (let index = 0; index < DIFFERENTIAL_CASES; index += 1) {
        check(random.pick(combos), random.integer(10, 3000));
      }
      expect(mismatches.slice(0, 5)).toEqual([]);
    });
  });
});

// ---- Roteiro: classificação -------------------------------------------------------------------

/** Nome do painel do ANY para cada pergunta do reducer. */
const ANY_PANEL: Record<TepPathwayState['question'], string> = {
  sintomas: 'classQ1',
  spesi: 'classQ2',
  hestia: 'classQ2h',
  localizacao: 'classQ2b',
  biomarcadores: 'classQ3',
  'pre-falencia': 'classQ3b',
  respiratorio: 'classQ4',
};

const ANY_COLOR_TONE: Record<string, ResultTone> = {
  '#2196F3': 'neutral',
  '#4CAF50': 'neutral',
  '#FFC107': 'attention',
  '#FF9800': 'attention',
  '#FF5722': 'attention',
  '#F44336': 'critical',
  '#C62828': 'critical',
};

function run(actions: readonly TepAction[], from: TepPathwayState = INITIAL_TEP_STATE) {
  return actions.reduce(tepReducer, from);
}

/** O que o passo 4 do ANY mostra, lido da árvore. */
function anyManagement(tree: HeadlessNode) {
  const card = findAll(
    tree,
    (element) =>
      typeof element.props.className === 'string' &&
      element.props.className.includes('border-l-4') &&
      element.props.className.includes('mb-3'),
  )[0];
  if (!card) throw new Error('cartão da categoria ausente');
  const [labelNode, descriptionNode, actionsNode] = card.children.filter(isElement);
  const rows = findAll(
    tree,
    (element) =>
      typeof element.props.className === 'string' &&
      element.props.className.startsWith('flex justify-between py-2'),
  ).map((row) => row.children.filter(isElement).map(textOf));
  const text = textOf(tree);
  return {
    label: textOf(labelNode).replace('Categoria ', ''),
    description: textOf(descriptionNode),
    actions: (actionsNode?.children.filter(isElement) ?? []).map((node) =>
      textOf(node).replace(/^•\s*/, ''),
    ),
    rows,
    tone: ANY_COLOR_TONE[(card.props.style as { borderLeftColor: string }).borderLeftColor],
    subsegmental: text.includes('TEP subsegmentar isolado'),
    redFlags: text.includes('Red flags de deterioração'),
    redFlagItems: findAll(tree, (element) => element.type === 'li').map(textOf),
  };
}

function expectSameManagement(tree: HeadlessNode, state: TepPathwayState, path: string): void {
  expect(state.step, path).toBe('conduta');
  const id = state.category as TepCategoryId;
  const category = TEP_CATEGORIES[id];
  const any = anyManagement(tree);
  expect(any.label, path).toBe(categoryLabel(id, state.respiratory));
  expect(sameText(any.description, category.description), `${path}: descrição`).toBe(true);
  expect(any.actions.length, path).toBe(category.actions.length);
  any.actions.forEach((action, index) => {
    expect(sameText(action, category.actions[index] ?? ''), `${path}: ${action}`).toBe(true);
  });
  const rows: [string, string | undefined][] = [
    ['Destino', category.destination],
    ['Anticoagulação', category.anticoagulation],
    ['Monitorização', category.monitoring],
    ['Terapia avançada', category.advancedTherapy],
    ...(category.followUp ? ([['Seguimento', category.followUp]] as [string, string][]) : []),
  ];
  expect(any.rows.length, path).toBe(rows.length);
  any.rows.forEach(([label = '', value = ''], index) => {
    const [ourLabel = '', ourValue = ''] = rows[index] ?? [];
    expect(normalize(label), path).toBe(normalize(ourLabel));
    expect(sameText(value, ourValue), `${path}: ${label}`).toBe(true);
  });
  expect(any.tone, `${path}: tom`).toBe(category.tone);
  expect(any.subsegmental, `${path}: subsegmentar`).toBe(category.subsegmental);
  expect(any.redFlags, `${path}: red flags`).toBe(category.redFlags);
  if (category.redFlags) {
    expect(any.redFlagItems.length).toBe(RED_FLAGS.items.length);
    any.redFlagItems.forEach((item, index) => {
      expect(sameText(item, RED_FLAGS.items[index] ?? ''), item).toBe(true);
    });
  }
}

/** Opção da pergunta atual pelo texto do ANY: o rótulo nosso tem que achar o botão de lá. */
function anyButtonFor(session: AnyTepSession, label: string): HeadlessElement {
  const button = session
    .buttons()
    .find(
      (candidate) =>
        sameText(textOf(candidate), label) || normalize(textOf(candidate)) === normalize(label),
    );
  if (!button) {
    throw new Error(
      `"${label}" sem botão no ANY. Botões: ${session.buttons().map(textOf).join(' | ')}`,
    );
  }
  return button;
}

interface Walk {
  path: string;
  categories: Set<string>;
}

/** Percorre todas as respostas da classificação nos dois lados, em profundidade. */
function walkClassification(session: AnyTepSession, state: TepPathwayState, walk: Walk): void {
  if (state.step === 'conduta') {
    expect(session.get('panel'), walk.path).toBe('step4');
    expectSameManagement(session.tree, state, walk.path);
    walk.categories.add(categoryLabel(state.category as TepCategoryId, state.respiratory));
    return;
  }
  expect(session.get('panel'), walk.path).toBe('step3');
  expect(session.get('classPanel'), walk.path).toBe(ANY_PANEL[state.question]);
  const question = CLASSIFICATION.questions[state.question];
  for (const option of question.options) {
    const branch = new AnyTepSession(snapshot(session));
    const button = anyButtonFor(branch, option.label);
    branch.click(textOf(button));
    walkClassification(
      branch,
      tepReducer(state, { type: 'responder', answer: option.value as TepAnswer }),
      { path: `${walk.path} › ${option.value}`, categories: walk.categories },
    );
  }
}

const SNAPSHOT_KEYS = [
  'view',
  'panel',
  'classPanel',
  'classState',
  'categoryResult',
  'hasModR',
  'isPregnant',
  'wellsLevel',
  'percResult',
  'ddimerResult',
  'yearsPregResult',
  'tromboStage',
  'ecoChecked',
  'ecoConfirmed',
] as const;

function snapshot(session: AnyTepSession) {
  return Object.fromEntries(SNAPSHOT_KEYS.map((key) => [key, session.get(key)]));
}

describe('TEP × ANY — roteiro: classificação e conduta', () => {
  it('Q1–Q4: todo caminho chega à mesma categoria e à mesma conduta', () => {
    const session = new AnyTepSession({ view: 'pathway', panel: 'step2' });
    session.click('TEP confirmado');
    const state = run([{ type: 'estabilidade', stable: true }, { type: 'confirmar-tep' }]);
    const categories = new Set<string>();
    walkClassification(session, state, { path: 'estável', categories });
    // 9 categorias pela classificação, cada uma com e sem R.
    expect([...categories].sort()).toEqual(
      ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'C3', 'D1', 'D2'].flatMap((id) => [id, `${id}R`]).sort(),
    );
  });

  it('instável: E2, E1 e D direto, sempre com R, como no ANY', () => {
    for (const option of UNSTABLE.classify.options) {
      const session = new AnyTepSession({ view: 'pathway' });
      session.click(anyButtonText(session, STABILITY.unstable));
      expect(session.get('panel')).toBe('stepUnstable');
      session.click(anyButtonText(session, option.label));
      const state = run([
        { type: 'estabilidade', stable: false },
        { type: 'classificar-instavel', category: option.value },
      ]);
      expectSameManagement(session.tree, state, `instável › ${option.value}`);
      expect(session.get('hasModR')).toBe(true);
    }
  });

  it('as 12 categorias aparecem nos caminhos (paridade 100%)', () => {
    const reached = new Set<string>();
    const session = new AnyTepSession({ view: 'pathway', panel: 'step2' });
    session.click('TEP confirmado');
    const state = run([{ type: 'estabilidade', stable: true }, { type: 'confirmar-tep' }]);
    const labels = new Set<string>();
    walkClassification(session, state, { path: 'estável', categories: labels });
    for (const label of labels) reached.add(label.replace(/R$/, ''));
    for (const option of UNSTABLE.classify.options) {
      const unstable = run([
        { type: 'estabilidade', stable: false },
        { type: 'classificar-instavel', category: option.value },
      ]);
      if (unstable.category) reached.add(unstable.category);
    }
    expect([...reached].sort()).toEqual([...TEP_CATEGORY_IDS].sort());
  });

  it('"Prosseguir" do sPESI calculado: mesma resposta nas 64 combinações', () => {
    for (const checked of everyChecklist(6)) {
      const session = new AnyTepSession({
        view: 'pathway',
        panel: 'step3',
        classPanel: 'classQ2',
        classState: { symptomatic: true },
        inlineSpesiChecked: checked,
      });
      session.click(/^Prosseguir como Categoria/);
      const answer = classificationAnswerFor(
        'spesi',
        complete(evaluateCalculator(SPESI, { items: yesNo(SPESI, checked) })),
      );
      expect((session.get('classState') as { risk: string }).risk).toBe(
        answer === 'baixo-risco' ? 'low' : 'high',
      );
    }
  });

  it('"Prosseguir" do PESI calculado: mesma resposta nas combinações e idades de borda', () => {
    const random = seededRandom(SEED + 3);
    for (let index = 0; index < 600; index += 1) {
      const age = random.pick([18, 50, 65, 75, 85, 86, 95, 120]);
      const checked = Array.from({ length: 10 }, () => random.next() < 0.25);
      const session = new AnyTepSession({
        view: 'pathway',
        panel: 'step3',
        classPanel: 'classQ2',
        classState: { symptomatic: true },
        inlinePesiAge: age,
        inlinePesiChecked: checked,
      });
      session.click(/^Prosseguir como Categoria .*risco/);
      const answer = classificationAnswerFor(
        'pesi',
        complete(
          evaluateCalculator(PESI, { inputs: { age: String(age) }, items: yesNo(PESI, checked) }),
        ),
      );
      expect((session.get('classState') as { risk: string }).risk, `${age}/${checked}`).toBe(
        answer === 'baixo-risco' ? 'low' : 'high',
      );
    }
  });

  it('"Prosseguir" do Hestia calculado: mesma resposta nas 2.048 combinações', () => {
    for (const checked of everyChecklist(11)) {
      const session = new AnyTepSession({
        view: 'pathway',
        panel: 'step3',
        classPanel: 'classQ2h',
        classState: { symptomatic: true, risk: 'low' },
        inlineHestiaChecked: checked,
      });
      session.click('Prosseguir — localização do trombo');
      const answer = classificationAnswerFor(
        'hestia',
        complete(evaluateCalculator(HESTIA, { items: yesNo(HESTIA, checked) })),
      );
      expect((session.get('classState') as { hestia: string }).hestia).toBe(
        answer === 'hestia-negativo' ? 'neg' : 'pos',
      );
      expect(session.get('classPanel')).toBe('classQ2b');
    }
  });

  it('"Voltar ao diagnóstico" zera a classificação nos dois', () => {
    const session = new AnyTepSession({ view: 'pathway', panel: 'step2' });
    session.click('TEP confirmado');
    session.click(anyButtonText(session, 'Sim — dispneia, dor torácica, síncope, hemoptise, etc.'));
    session.click(anyButtonText(session, 'sPESI ≥ 1 (risco elevado)'));
    session.click('Voltar ao diagnóstico');
    const state = run([
      { type: 'estabilidade', stable: true },
      { type: 'confirmar-tep' },
      { type: 'responder', answer: 'sintomatico' },
      { type: 'responder', answer: 'risco-elevado' },
      { type: 'voltar' },
    ]);
    expect(session.get('panel')).toBe('step2');
    expect(state.step).toBe('diagnostico');
    expect(session.get('classState')).toEqual({});
    expect(state.classification).toEqual({});
    expect(session.get('classPanel')).toBe(ANY_PANEL[state.question]);
  });

  it('"Reiniciar" volta ao passo 1 e zera classificação e investigação', () => {
    const session = new AnyTepSession({ view: 'pathway', panel: 'step2' });
    session.fire(findToggle(session).props.onChange, 'pregnant');
    session.click('TEP confirmado');
    session.click(anyButtonText(session, 'Não — TEP incidental / assintomático'));
    session.click(anyButtonText(session, 'Subsegmentar isolado'));
    session.click(anyButtonText(session, 'Sem hipoxemia, taquipneia ou necessidade de O₂'));
    session.click('Reiniciar pathway');
    const restarted = tepReducer(
      run([
        { type: 'estabilidade', stable: true },
        { type: 'gestante', pregnant: true },
        { type: 'confirmar-tep' },
        { type: 'responder', answer: 'assintomatico' },
        { type: 'responder', answer: 'subsegmentar' },
        { type: 'responder', answer: 'sem-r' },
      ]),
      { type: 'reiniciar' },
    );
    expect(session.get('panel')).toBe('step1');
    expect(restarted.step).toBe('estabilidade');
    expect(session.get('isPregnant')).toBe(false);
    expect(restarted.diagnosis.pregnant).toBe(false);
    expect(session.get('categoryResult')).toBeNull();
    expect(restarted.category).toBeNull();
  });
});

function anyButtonText(session: AnyTepSession, label: string): string {
  return textOf(anyButtonFor(session, label));
}

function findToggle(session: AnyTepSession): HeadlessElement {
  const toggle = findAll(session.tree, (element) => element.type === 'toggle')[0];
  if (!toggle) throw new Error('toggle de gestante ausente');
  return toggle;
}

// ---- Roteiro: investigação --------------------------------------------------------------------

const ANY_WELLS = { low: 'baixa', moderate: 'intermediaria', high: 'alta' } as const;
const ANY_TEST = { neg: 'negativo', pos: 'positivo' } as const;

function anyDiagnosis(session: AnyTepSession) {
  const wells = session.get('wellsLevel') as keyof typeof ANY_WELLS | null;
  const result = (key: 'percResult' | 'ddimerResult' | 'yearsPregResult') => {
    const value = session.get(key) as keyof typeof ANY_TEST | null;
    return value ? ANY_TEST[value] : null;
  };
  return {
    pregnant: session.get('isPregnant'),
    wells: wells ? ANY_WELLS[wells] : null,
    perc: result('percResult'),
    dDimer: result('ddimerResult'),
    yearsPregnancy: result('yearsPregResult'),
  };
}

/** Ações da investigação com o botão correspondente do ANY. */
const DIAGNOSIS_MOVES: readonly { action: TepAction; any: (session: AnyTepSession) => void }[] = [
  {
    action: { type: 'gestante', pregnant: true },
    any: (s) => s.fire(findToggle(s).props.onChange, 'pregnant'),
  },
  {
    action: { type: 'gestante', pregnant: false },
    any: (s) => s.fire(findToggle(s).props.onChange, 'not_pregnant'),
  },
  ...DIAGNOSIS.wells.options.map((option) => ({
    action: { type: 'wells', level: option.value } as TepAction,
    any: (s: AnyTepSession) => s.click(anyButtonText(s, option.label)),
  })),
  ...DIAGNOSIS.low.percOptions.map((option) => ({
    action: { type: 'perc', result: option.value } as TepAction,
    any: (s: AnyTepSession) => s.click(anyButtonText(s, option.label)),
  })),
  ...DIAGNOSIS.dDimer.options.map((option) => ({
    action: { type: 'd-dimero', result: option.value } as TepAction,
    any: (s: AnyTepSession) => s.click(anyButtonText(s, option.label)),
  })),
  ...DIAGNOSIS.pregnant.options.map((option) => ({
    action: { type: 'years-gestante', result: option.value } as TepAction,
    any: (s: AnyTepSession) => s.click(anyButtonText(s, option.label)),
  })),
];

/** Botão do ANY presente na tela (as ações que o reducer ignora não têm botão lá). */
function canMove(session: AnyTepSession, move: (typeof DIAGNOSIS_MOVES)[number]): boolean {
  const { action } = move;
  if (action.type === 'gestante') return true;
  const label =
    action.type === 'wells'
      ? DIAGNOSIS.wells.options.find((option) => option.value === action.level)?.label
      : action.type === 'perc'
        ? DIAGNOSIS.low.percOptions.find((option) => option.value === action.result)?.label
        : action.type === 'd-dimero'
          ? DIAGNOSIS.dDimer.options.find((option) => option.value === action.result)?.label
          : action.type === 'years-gestante'
            ? DIAGNOSIS.pregnant.options.find((option) => option.value === action.result)?.label
            : undefined;
  return label !== undefined && session.buttons().some((button) => sameText(textOf(button), label));
}

function visible(session: AnyTepSession, text: string): boolean {
  return normalize(textOf(session.tree)).includes(normalize(expectedText(text)));
}

describe('TEP × ANY — roteiro: investigação diagnóstica', () => {
  it('todo estado alcançável pelos botões tem o mesmo resultado e os mesmos blocos', () => {
    const start = new AnyTepSession({ view: 'pathway', panel: 'step2' });
    const queue: { session: AnyTepSession; state: TepPathwayState; path: string }[] = [
      { session: start, state: run([{ type: 'estabilidade', stable: true }]), path: 'início' },
    ];
    const seen = new Set<string>();
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) break;
      const key = JSON.stringify(current.state.diagnosis);
      if (seen.has(key)) continue;
      seen.add(key);
      const { session, state, path } = current;
      expect(anyDiagnosis(session), path).toEqual(state.diagnosis);

      const { diagnosis } = state;
      const anyText = (text: string) => visible(session, text);
      expect(anyText('Wells <2 — Baixa probabilidade.'), path).toBe(
        !diagnosis.pregnant && diagnosis.wells === 'baixa',
      );
      expect(anyText('Wells 2-6 — Probabilidade intermediária.'), path).toBe(
        !diagnosis.pregnant && diagnosis.wells === 'intermediaria',
      );
      expect(anyText('Wells >6 — Alta probabilidade.'), path).toBe(
        !diagnosis.pregnant && diagnosis.wells === 'alta',
      );
      expect(anyText('Resultado do D-dímero:'), path).toBe(
        !diagnosis.pregnant &&
          ((diagnosis.wells === 'baixa' && diagnosis.perc === 'positivo') ||
            diagnosis.wells === 'intermediaria'),
      );
      expect(anyText('Resultado YEARS gestante:'), path).toBe(diagnosis.pregnant);

      for (const move of DIAGNOSIS_MOVES) {
        const next = tepReducer(state, move.action);
        if (!canMove(session, move)) {
          // Sem botão no ANY, o reducer também não muda a investigação.
          expect(next.diagnosis, `${path} › ${JSON.stringify(move.action)}`).toEqual(diagnosis);
          continue;
        }
        const branch = new AnyTepSession(snapshot(session));
        move.any(branch);
        queue.push({
          session: branch,
          state: next,
          path: `${path} › ${JSON.stringify(move.action)}`,
        });
      }
    }
    // Gestante × Wells × PERC × D-dímero × YEARS: os estados alcançáveis.
    expect(seen.size).toBeGreaterThan(10);
  });

  it('Wells calculado no roteiro fixa o mesmo nível nas 128 combinações', () => {
    for (const checked of everyChecklist(7)) {
      // Desmarca um item e toca nele: o ANY recalcula com a lista final.
      const toggled = checked.findIndex(Boolean);
      const before = [...checked];
      const index = toggled === -1 ? 0 : toggled;
      before[index] = !before[index];
      const session = new AnyTepSession({
        view: 'pathway',
        panel: 'step2',
        inlineWellsChecked: before,
      });
      const block = collapsible(session.tree, 'Calcular Wells');
      const button = findAll(block, (element) => element.type === 'button')[index];
      session.fire(button?.props.onClick);
      const action = diagnosisActionFor(
        'wells',
        complete(evaluateCalculator(WELLS_TEP, { items: yesNo(WELLS_TEP, checked) })),
      );
      expect(action).toEqual({
        type: 'wells',
        level: ANY_WELLS[session.get('wellsLevel') as 'low'],
      });
    }
  });

  it('PERC calculado no roteiro fixa o mesmo resultado nas 256 combinações', () => {
    for (const checked of everyChecklist(8)) {
      const index = Math.max(0, checked.findIndex(Boolean));
      const before = [...checked];
      before[index] = !before[index];
      const session = new AnyTepSession({
        view: 'pathway',
        panel: 'step2',
        wellsLevel: 'low',
        inlinePercChecked: before,
      });
      const button = findAll(
        collapsible(session.tree, 'Calcular PERC'),
        (e) => e.type === 'button',
      )[index];
      session.fire(button?.props.onClick);
      const action = diagnosisActionFor(
        'perc',
        complete(evaluateCalculator(PERC_RULE, { items: yesNo(PERC_RULE, checked) })),
      );
      expect(action).toEqual({
        type: 'perc',
        result: ANY_TEST[session.get('percResult') as 'neg'],
      });
    }
  });

  it(`D-dímero e YEARS digitados no roteiro fixam o mesmo resultado (${DIFFERENTIAL_CASES} casos)`, () => {
    const random = seededRandom(SEED + 4);
    for (let index = 0; index < DIFFERENTIAL_CASES; index += 1) {
      const age = random.integer(18, 120);
      const value =
        random.next() < 0.5
          ? ageAdjustedDDimerCutoff(age) + random.integer(-15, 15)
          : random.integer(10, 3000);
      const checked = Array.from({ length: 3 }, () => random.next() < 0.4);
      const typed = String(value);

      const ddimer = new AnyTepSession({
        view: 'pathway',
        panel: 'step2',
        wellsLevel: 'moderate',
        inlineDdimerAge: age,
      });
      const [, valueInput] = findAll(
        collapsible(ddimer.tree, 'Calcular D-dímero ajustado por idade'),
        (element) => element.type === 'input',
      );
      ddimer.fire(valueInput?.props.onChange, { target: { value: typed } });
      expect(
        diagnosisActionFor(
          'dDimer',
          complete(
            evaluateCalculator(D_DIMER_AGE_ADJUSTED, {
              inputs: { age: String(age), 'd-dimer': typed },
            }),
          ),
        ),
        `${age} anos, ${value}`,
      ).toEqual({ type: 'd-dimero', result: ANY_TEST[ddimer.get('ddimerResult') as 'neg'] });

      const years = new AnyTepSession({
        view: 'pathway',
        panel: 'step2',
        wellsLevel: 'moderate',
        inlineYearsChecked: checked,
      });
      const [yearsInput] = findAll(
        collapsible(years.tree, 'Calcular YEARS'),
        (e) => e.type === 'input',
      );
      years.fire(yearsInput?.props.onChange, { target: { value: typed } });
      expect(
        diagnosisActionFor(
          'years',
          complete(
            evaluateCalculator(YEARS, {
              items: yesNo(YEARS, checked),
              inputs: { 'd-dimer': typed },
            }),
          ),
        ),
      ).toEqual({ type: 'd-dimero', result: ANY_TEST[years.get('ddimerResult') as 'neg'] });

      const pregnancy = new AnyTepSession({
        view: 'pathway',
        panel: 'step2',
        isPregnant: true,
        inlineYearsPregChecked: checked,
      });
      const [pregnancyInput] = findAll(
        collapsible(pregnancy.tree, 'Calcular YEARS gestantes'),
        (e) => e.type === 'input',
      );
      pregnancy.fire(pregnancyInput?.props.onChange, { target: { value: typed } });
      expect(
        diagnosisActionFor(
          'yearsPregnancy',
          complete(
            evaluateCalculator(YEARS_PREGNANCY, {
              items: yesNo(YEARS_PREGNANCY, checked),
              inputs: { 'd-dimer': typed },
            }),
          ),
        ),
      ).toEqual({
        type: 'years-gestante',
        result: ANY_TEST[pregnancy.get('yearsPregResult') as 'neg'],
      });
    }
  });
});

// ---- Roteiro: paciente instável ---------------------------------------------------------------

const ANY_THROMBOLYSIS: Record<string, ThrombolysisStage> = {
  question: 'contraindicacao',
  contraindicated: 'contraindicada',
  risk: 'risco-hemorragico',
  doseHigh: 'dose-reduzida',
  doseStandard: 'dose-padrao',
};

describe('TEP × ANY — roteiro: paciente instável', () => {
  it('trombólise: as mesmas etapas e as mesmas doses em todo caminho', () => {
    const t = UNSTABLE.thrombolysis;
    const moves = [
      { label: t.contraindication.yes, answer: 'contraindicada' },
      { label: t.contraindication.no, answer: 'sem-contraindicacao' },
      { label: t.bleedingRisk.yes, answer: 'risco-alto' },
      { label: t.bleedingRisk.no, answer: 'risco-padrao' },
      { label: t.reassess, answer: 'reavaliar' },
    ] as const;
    const start = new AnyTepSession({ view: 'pathway', panel: 'stepUnstable' });
    const queue = [{ session: start, state: run([{ type: 'estabilidade', stable: false }]) }];
    const seen = new Set<string>();
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) break;
      const { session, state } = current;
      if (seen.has(state.thrombolysis)) continue;
      seen.add(state.thrombolysis);
      expect(ANY_THROMBOLYSIS[session.get('tromboStage') as string]).toBe(state.thrombolysis);
      const blocks =
        state.thrombolysis === 'dose-reduzida'
          ? t.reducedDose.blocks
          : state.thrombolysis === 'dose-padrao'
            ? t.standardDose.blocks
            : [];
      for (const block of blocks) {
        expect(visible(session, block.name), block.name).toBe(true);
        expect(visible(session, block.text), block.text).toBe(true);
      }
      for (const move of moves) {
        const next = tepReducer(state, { type: 'trombolise', answer: move.answer });
        const available = session
          .buttons()
          .some(
            (button) =>
              sameText(textOf(button), `← ${move.label}`) || sameText(textOf(button), move.label),
          );
        if (!available) {
          expect(next.thrombolysis).toBe(state.thrombolysis);
          continue;
        }
        const branch = new AnyTepSession(snapshot(session));
        const button = branch
          .buttons()
          .find(
            (candidate) =>
              sameText(textOf(candidate), `← ${move.label}`) ||
              sameText(textOf(candidate), move.label),
          );
        branch.click(textOf(button));
        queue.push({ session: branch, state: next });
      }
    }
    expect([...seen].sort()).toEqual(
      [
        'contraindicacao',
        'contraindicada',
        'risco-hemorragico',
        'dose-reduzida',
        'dose-padrao',
      ].sort(),
    );
  });

  it('eco: mesmo resumo e tom nas 128 combinações de achados', () => {
    const items = ECHO_RV.items;
    for (const checked of everyChecklist(items.length)) {
      const session = new AnyTepSession({
        view: 'pathway',
        panel: 'stepUnstable',
        ecoChecked: checked,
        ecoConfirmed: true,
      });
      const summary = findAll(
        session.tree,
        (element) =>
          typeof element.props.style === 'object' &&
          element.props.style !== null &&
          'borderLeft' in (element.props.style as object),
      )[0];
      const strong = summary?.children.filter(isElement)[0];
      const color = (strong?.props.style as { color: string }).color;
      const ours = complete(evaluateCalculator(ECHO_RV, { items: yesNo(ECHO_RV, checked) }));
      expect(normalize(textOf(strong))).toBe(normalize(ours.band.label));
      expect(ANY_COLOR_TONE[color]).toBe(ours.band.tone);
    }
  });

  it('liga às mesmas drogas de Infusões que o ANY, no endereço do Copiloto', () => {
    navigations.length = 0;
    const session = new AnyTepSession({ view: 'pathway', panel: 'stepUnstable' });
    for (const label of [
      'Calculadora de Noradrenalina',
      'Calculadora de Dobutamina',
      'Calculadora de Heparina',
    ]) {
      session.click(label);
    }
    const anyDrugs = navigations.map((to) => to.replace('/infusion?drug=', ''));
    const ours = [
      ...UNSTABLE.support.blocks.flatMap((block) => (block.link ? [block.link] : [])),
      UNSTABLE.anticoagulation.heparin.link,
    ].map((link) => (link.kind === 'infusao' ? link.drug : null));
    expect(ours).toEqual(anyDrugs);
    expect(infusionDrugHref('heparina')).toBe(
      '/ferramentas/infusoes?droga=heparina&indicacao=tep&de=tep',
    );
    expect(MANAGEMENT.heparin).toMatchObject({ kind: 'infusao', drug: 'heparina' });
  });
});

// ---- Texto do roteiro e da referência ---------------------------------------------------------

/**
 * Trechos de texto do ANY (filhos de texto de cada elemento), sem a pontuação
 * de ligação do layout: travessão inicial ("— vasopressor…"), dois-pontos do
 * rótulo em negrito ("HNF:") e a seta dos links ("Calculadora… →").
 */
function textFragments(node: HeadlessNode, insideCalculator = false): string[] {
  if (!isElement(node)) return [];
  // O resultado das calculadoras embutidas é número que muda a cada toque; o
  // teste das calculadoras confere esses valores.
  const isCalculator = insideCalculator || node.type === 'collapsible';
  const isResult =
    typeof node.props.className === 'string' &&
    node.props.className.startsWith('p-4 rounded-lg text-center mt-3');
  if (isCalculator && isResult) return [];
  const own = node.children
    .filter((child): child is string => typeof child === 'string')
    .map((child) =>
      child
        .trim()
        .replace(/^[—–\-←↺]\s*/, '')
        .replace(/\s*(→|:)$/, '')
        .trim(),
    )
    .filter((child) => child.length >= 3);
  return [...own, ...node.children.flatMap((child) => textFragments(child, isCalculator))];
}

/** Chrome do ANY (navegação e títulos de tela) que não é conteúdo clínico. */
const CHROME = new Set(
  [
    'Menu',
    'Referência rápida',
    'Pathway de decisão',
    'Passo 1 de 4',
    'Paciente instável',
    'Ver referência completa de eco',
    'Verificar contraindicações antes',
    'Ver lista completa de contraindicações',
    '← Voltar',
    'Classificar gravidade:',
    'Ações imediatas',
    // Os links para Via aérea e Sedação levam o nome das ferramentas no Copiloto.
    'Airway Guide',
    'Seda Path',
    'Situação',
    'Recomendação',
    'Categoria',
    'Passo 1 de 4',
    'Passo 2 de 4',
    'Passo 3 de 4',
    'Passo 4 de 4',
    // Rótulos de campo: aqui o campo tem o nome e a unidade ao lado ("Idade", "anos").
    'Idade (anos)',
    'D-dímero (ug/L FEU)',
    'Idade (anos) — somada ao score',
  ].map(normalize),
);

function corpus(): string {
  const strings: string[] = [];
  const collect = (value: unknown): void => {
    if (typeof value === 'string') strings.push(value);
    else if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === 'object') Object.values(value).forEach(collect);
  };
  collect([
    STABILITY,
    UNSTABLE,
    DIAGNOSIS,
    CLASSIFICATION,
    MANAGEMENT,
    TEP_REFERENCE,
    SUBSEGMENTAL_ALERT,
    RED_FLAGS,
    DISPOSITION_LABELS,
    Object.values(TEP_CATEGORIES),
    [WELLS_TEP, PERC_RULE, D_DIMER_AGE_ADJUSTED, YEARS, YEARS_PREGNANCY, SPESI, PESI, HESTIA].map(
      (definition) => [
        definition.items?.map(({ label }) => label),
        definition.reference.pearlsPitfalls,
      ],
    ),
  ]);
  return strings.map(normalize).join('|');
}

describe('TEP × ANY — nenhum texto clínico ficou para trás', () => {
  const ours = corpus();

  it.each([
    ['estabilidade', { view: 'pathway' }],
    ['paciente instável', { view: 'pathway', panel: 'stepUnstable' }],
    [
      'investigação: Wells baixo, PERC positivo',
      {
        view: 'pathway',
        panel: 'step2',
        wellsLevel: 'low',
        percResult: 'pos',
        ddimerResult: 'pos',
      },
    ],
    [
      'investigação: PERC negativo',
      { view: 'pathway', panel: 'step2', wellsLevel: 'low', percResult: 'neg' },
    ],
    [
      'investigação: D-dímero negativo',
      { view: 'pathway', panel: 'step2', wellsLevel: 'moderate', ddimerResult: 'neg' },
    ],
    ['investigação: Wells alto', { view: 'pathway', panel: 'step2', wellsLevel: 'high' }],
    [
      'investigação: gestante positivo',
      { view: 'pathway', panel: 'step2', isPregnant: true, yearsPregResult: 'pos' },
    ],
    [
      'investigação: gestante negativo',
      { view: 'pathway', panel: 'step2', isPregnant: true, yearsPregResult: 'neg' },
    ],
    ['classificação: sPESI', { view: 'pathway', panel: 'step3', classPanel: 'classQ2' }],
    ['classificação: Hestia', { view: 'pathway', panel: 'step3', classPanel: 'classQ2h' }],
    ['classificação: biomarcadores', { view: 'pathway', panel: 'step3', classPanel: 'classQ3' }],
    ['classificação: pré-falência', { view: 'pathway', panel: 'step3', classPanel: 'classQ3b' }],
    ['conduta: A1', { view: 'pathway', panel: 'step4', categoryResult: 'A1' }],
    ['conduta: C2', { view: 'pathway', panel: 'step4', categoryResult: 'C2' }],
    ['referência rápida', { view: 'ref' }],
  ] as const)('%s: todo trecho do ANY está no conteúdo portado', (_name, initial) => {
    const session = new AnyTepSession(initial);
    const missing = textFragments(session.tree)
      .filter((fragment) => !CHROME.has(normalize(fragment)))
      .filter((fragment) => !ours.includes(normalize(expectedText(fragment))));
    expect(missing).toEqual([]);
  });
});
