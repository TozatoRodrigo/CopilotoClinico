import { describe, expect, it } from 'vitest';
import * as anyTox from '../any-reference/toxData';
import { evaluateCalculator } from '../../src/shared/clinical-tools/calculator';
import { NOMOGRAMA_RUMACK } from '../../src/shared/clinical-tools/calculators/nomograma-rumack';
import { formatCompact, formatDecimal } from '../../src/shared/clinical-tools/numbers';
import { validateNumber } from '../../src/shared/clinical-tools/ranges';
import {
  atropineAmpoulesText,
  atropineMaintenance,
  atropineRateText,
  NAC_WEIGHT_RANGE,
  nacDoses,
} from '../../src/shared/clinical-tools/toxicology/antidote-doses';
import { ANTIDOTES } from '../../src/shared/clinical-tools/toxicology/antidotes';
import { POISON_CENTER_CONTACTS, telHref } from '../../src/shared/clinical-tools/toxicology/ciatox';
import { EXAM_CHECKLIST } from '../../src/shared/clinical-tools/toxicology/checklist';
import {
  activatedCharcoalDose,
  decontaminationFlowReducer,
  decontaminationProgress,
  decontaminationView,
  DECONTAMINATION_INTRO,
  INITIAL_DECONTAMINATION_FLOW,
  REDUCED_BENEFIT_TEXT,
  type DecontaminationFlowState,
} from '../../src/shared/clinical-tools/toxicology/decontamination';
import {
  assessDisposition,
  checkedCountLabel,
  DISPOSITION_CRITERIA,
  DISPOSITION_INTRO,
  DISPOSITION_NOTES,
} from '../../src/shared/clinical-tools/toxicology/disposition';
import { TOX_MODULES } from '../../src/shared/clinical-tools/toxicology/modules';
import { searchAntidotes } from '../../src/shared/clinical-tools/toxicology/search';
import {
  DELAYED_TOXICITY,
  ECG_FINDINGS,
  ECG_TREATMENT,
  INTENTIONAL_INGESTION_EXAMS,
  MIOSIS,
  MYDRIASIS,
  ODORS,
  TABLE_TABS,
  TOXIDROME_COMPARISON,
  type TableRowHighlight,
  type ToxTableRow,
} from '../../src/shared/clinical-tools/toxicology/tables';
import {
  INITIAL_TOXIDROME_FLOW,
  TOXIDROME_QUESTIONS,
  TOXIDROMES,
  toxidromeFlowReducer,
  toxidromeProgress,
  toxidromeStep,
  VITAL_SIGN_LABELS,
  type ToxidromeFlowState,
} from '../../src/shared/clinical-tools/toxicology/toxidromes';
import {
  createHeadlessReact,
  findAll,
  loadFrozenModule,
  textOf,
  valueNextTo,
  type HeadlessElement,
  type HeadlessNode,
} from './any-component-harness';
import { DIFFERENTIAL_CASES, seededRandom } from './seeded-random';

/**
 * CC-323 — roteiro de Toxicologia contra a referência congelada do ANY: o
 * `toxData.ts` (conteúdo) e a tela `ToxPath.tsx`, rodada sem React
 * (any-component-harness), onde mora a regra da árvore, da descontaminação,
 * do destino e as contas de carvão, NAC e atropina.
 *
 * Texto é comparado sem acento, caixa e espaço (o porte só corrigiu
 * acentuação). As outras mudanças de texto são as de `TEXT_EDITS`, todas de
 * linguagem (ADR-017) e listadas na revisão clínica
 * (docs/ferramentas/revisao-clinica/toxicologia.md).
 *
 * Diferença de conta deliberada: o nomograma do card da NAC compara o nível
 * com a linha arredondada a 0,1 (a conta da calculadora, uma só no
 * Copiloto); o ToxPath comparava com a linha sem arredondar. O teste aceita
 * divergência só nessa faixa estreita.
 */

const SEED = 20261015;

const TEXT_EDITS: readonly (readonly [string, string])[] = [
  ['poliintóxicação', 'poli-intoxicação'],
  ['(dar naloxona!)', '(considere naloxona)'],
  ['= INTERNAR e monitorar!', '= considere internar e monitorar.'],
  ['Recomenda-se contatar o CIATox', 'Considere contatar o CIATox'],
  ['entre em contato com', 'considere entrar em contato com'],
  ['benzodiazep��nico', 'benzodiazepínico'],
  ['Critérios de disposição', 'Critérios de destino'],
  ['Alta vs. Enfermaria vs. UTI', 'Alta, enfermaria ou UTI'],
];

/** Sem acento, caixa, espaço nem grau ("40C" = "40 °C"; "2o" = "2º"). */
function norm(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/°/g, '')
    .replace(/\s+/g, '');
}

/** Texto do ANY com as edições de linguagem do porte aplicadas, normalizado. */
function fromAny(text: string): string {
  return norm(TEXT_EDITS.reduce((current, [from, to]) => current.split(from).join(to), text));
}

// ---- ToxPath sem React ---------------------------------------------------------------------

const react = createHeadlessReact();
const h = react.module.createElement;

function withoutChildren(props: Record<string, unknown>): Record<string, unknown> {
  const { children: _children, ...rest } = props;
  return rest;
}

let anyWeight: number | null = null;

const ToxPath = loadFrozenModule('ToxPath.tsx', react, {
  '../components/layout/Disclaimer': { Disclaimer: () => null },
  '../components/layout/Header': {
    Header: (props: Record<string, unknown>) => h('header', withoutChildren(props)),
  },
  '../components/layout/Footer': { Footer: () => null },
  '../components/layout/Container': {
    Container: (props: { children: HeadlessNode }) => h('container', {}, props.children),
  },
  '../components/layout/FABMenu': { FABMenu: () => null },
  '../components/common/Card': {
    Card: (props: Record<string, unknown> & { children: HeadlessNode }) =>
      h('card', withoutChildren(props), props.children),
  },
  '../components/common/Collapsible': {
    Collapsible: (props: Record<string, unknown> & { children: HeadlessNode }) =>
      h('collapsible', withoutChildren(props), props.children),
  },
  '../components/common/AlertCard': {
    AlertCard: (props: Record<string, unknown> & { children: HeadlessNode }) =>
      h('alertcard', withoutChildren(props), props.children),
  },
  '../contexts/ToastContext': { useToast: () => ({}) },
  '../contexts/WeightContext': { useWeight: () => ({ weight: anyWeight, setWeight: () => {} }) },
  '../data/toxData': anyTox,
}).default as (props: Record<string, never>) => HeadlessNode;

/**
 * Dirige o ToxPath como um médico: o estado de cada `useState` fica no array
 * (posição 0 é a tela) e um clique aplica os `set` que o componente chamou.
 */
class AnyScreen {
  tree: HeadlessNode = null;
  constructor(readonly state: unknown[]) {
    this.render();
  }

  render(): void {
    this.tree = react.render(ToxPath, {}, this.state);
  }

  click(element: HeadlessElement): void {
    react.setCalls.length = 0;
    const onClick = element.props.onClick as ((event: unknown) => void) | undefined;
    if (!onClick) throw new Error(`"${textOf(element)}" não é clicável`);
    onClick({ stopPropagation() {} });
    for (const { position, value } of [...react.setCalls]) {
      this.state[position] =
        typeof value === 'function'
          ? (value as (prev: unknown) => unknown)(this.state[position])
          : value;
    }
    this.render();
  }

  all(predicate: (element: HeadlessElement) => boolean): HeadlessElement[] {
    return findAll(this.tree, predicate);
  }

  button(label: string): HeadlessElement {
    const found = this.all((element) => element.type === 'button' && textOf(element) === label);
    if (!found[0]) throw new Error(`botão "${label}" ausente`);
    return found[0];
  }
}

function progressOf(tree: HeadlessNode): number {
  const bar = findAll(
    tree,
    (element) => typeof (element.props.style as { width?: string } | undefined)?.width === 'string',
  )[0];
  if (!bar) throw new Error('barra de progresso ausente');
  return Number.parseFloat((bar.props.style as { width: string }).width);
}

// ---- Conteúdo (toxData.ts) -----------------------------------------------------------------

describe('conteúdo × toxData.ts do ANY', () => {
  it('as 11 perguntas, com textos, opções e destinos iguais', () => {
    expect(TOXIDROME_QUESTIONS.map(({ id }) => id)).toEqual(
      anyTox.toxQuestions.map(({ id }) => id),
    );
    for (const [index, reference] of anyTox.toxQuestions.entries()) {
      const ported = TOXIDROME_QUESTIONS[index]!;
      expect(norm(ported.text), `pergunta ${reference.id}`).toBe(fromAny(reference.text));
      expect(norm(ported.hint)).toBe(fromAny(reference.hint));
      expect(
        ported.options.map((option) => [norm(option.label), option.next, option.result]),
      ).toEqual(
        reference.options.map((option) => [fromAny(option.text), option.next, option.result]),
      );
    }
  });

  it('as 8 toxíndromes, com sinais, sinais vitais, agentes e próximo passo iguais', () => {
    expect(Object.keys(TOXIDROMES)).toEqual(Object.keys(anyTox.toxindromes));
    for (const [id, reference] of Object.entries(anyTox.toxindromes)) {
      const ported = TOXIDROMES[id as keyof typeof TOXIDROMES];
      expect(norm(ported.name), id).toBe(fromAny(reference.nome));
      expect(ported.signs.map(norm)).toEqual(reference.sinais.map(fromAny));
      const anyVitals = Object.entries(reference.vitais).map(([key, sign]) => [
        norm(key),
        fromAny(sign.valor),
        sign.classe,
      ]);
      expect(
        (Object.keys(VITAL_SIGN_LABELS) as (keyof typeof VITAL_SIGN_LABELS)[]).map((key) => [
          key,
          norm(ported.vitals[key].value),
          ported.vitals[key].trend,
        ]),
      ).toEqual(anyVitals);
      expect(norm(ported.agents)).toBe(fromAny(reference.agentes));
      expect(norm(ported.treatment)).toBe(fromAny(reference.antídoto));
    }
  });

  it('os 15 antídotos, com doses, disponibilidade, alertas e calculadora iguais', () => {
    expect(ANTIDOTES.map(({ id }) => id)).toEqual(anyTox.antidotes.map(({ id }) => norm(id)));
    for (const [index, reference] of anyTox.antidotes.entries()) {
      const ported = ANTIDOTES[index]!;
      expect(norm(ported.name), reference.id).toBe(fromAny(reference.name));
      expect(norm(ported.indication)).toBe(fromAny(reference.indication));
      expect(ported.available).toBe(reference.available);
      expect(norm(ported.searchTerms)).toBe(fromAny(reference.searchTerms));
      expect(ported.sections.map(({ title, lines }) => [norm(title), lines.map(norm)])).toEqual(
        reference.sections.map(({ title, lines }) => [fromAny(title), lines.map(fromAny)]),
      );
      expect(ported.warnings.map(norm)).toEqual((reference.warnings ?? []).map(fromAny));
      expect(ported.infos.map(norm)).toEqual((reference.infos ?? []).map(fromAny));
      expect(ported.calculator).toBe(reference.hasCalculator);
    }
  });

  it('os 17 critérios de destino, na mesma ordem e nível', () => {
    const reference = [...anyTox.utiCriteria, ...anyTox.enfermariaCriteria];
    expect(
      DISPOSITION_CRITERIA.map(({ text, detail, example, level }) =>
        [text, detail, example].map(norm).concat(level),
      ),
    ).toEqual(
      reference.map(({ text, detail, example, level }) =>
        [text, detail, example].map(fromAny).concat(level),
      ),
    );
  });

  it('o checklist de 32 itens em 6 seções', () => {
    expect(
      EXAM_CHECKLIST.map((section) => [
        section.letter,
        norm(section.title),
        section.items.map(({ label, hint }) => [norm(label), norm(hint)]),
      ]),
    ).toEqual(
      anyTox.checklistSections.map((section) => [
        section.letter,
        fromAny(section.title),
        section.items.map(({ label, hint }) => [fromAny(label), fromAny(hint)]),
      ]),
    );
  });

  it('as tabelas de ECG, odores, pupilas, bombas-relógio e exames, com o mesmo destaque', () => {
    const HIGHLIGHT: Record<string, TableRowHighlight> = {
      danger: 'critical',
      warning: 'attention',
      success: 'emphasis',
      accent: 'emphasis',
    };
    const rows = (ported: readonly ToxTableRow[]) =>
      ported.map(({ label, value, highlight }) => [norm(label), norm(value), highlight]);
    const anyRows = (reference: readonly { col1: string; col2: string; highlight?: string }[]) =>
      reference.map(({ col1, col2, highlight }) => [
        fromAny(col1),
        fromAny(col2),
        highlight ? HIGHLIGHT[highlight] : undefined,
      ]);
    expect(rows(ECG_FINDINGS)).toEqual(anyRows(anyTox.ecgTable));
    expect(rows(ECG_TREATMENT)).toEqual(anyRows(anyTox.ecgTreatmentTable));
    expect(rows(ODORS)).toEqual(anyRows(anyTox.odoresTable));
    expect(rows(MYDRIASIS)).toEqual(anyRows(anyTox.midríaseTable));
    expect(rows(MIOSIS)).toEqual(anyRows(anyTox.mioseTable));
    expect(rows(DELAYED_TOXICITY)).toEqual(anyRows(anyTox.bombasTable));
    expect(rows(INTENTIONAL_INGESTION_EXAMS)).toEqual(anyRows(anyTox.examesIngestaoTable));
    expect(
      TOXIDROME_COMPARISON.map(({ title, rows: cardRows }) => [
        norm(title),
        cardRows.map(({ label, value }) => [norm(label), norm(value)]),
      ]),
    ).toEqual(
      anyTox.tabelaComparacoes.map(({ title, rows: cardRows }) => [
        fromAny(title),
        cardRows.map(({ label, value }) => [fromAny(label), fromAny(value)]),
      ]),
    );
  });

  it('as abas de tabela e as seções da tela inicial (doses tóxicas fica no CC-324)', () => {
    expect(TABLE_TABS.map(({ id, label }) => [id, norm(label)])).toEqual(
      anyTox.tabelaTabs
        .filter(({ id }) => id !== 'doses')
        .map(({ id, label }) => [id, fromAny(label)]),
    );
    expect(TOX_MODULES.map(({ title, subtitle }) => [norm(title), norm(subtitle)])).toEqual(
      anyTox.homeModules.map(({ title, subtitle }) => [fromAny(title), fromAny(subtitle)]),
    );
  });
});

// ---- Tela inicial --------------------------------------------------------------------------

describe('tela inicial × ToxPath', () => {
  it('os telefones do CIATox são os do ANY, no texto e no tel:', () => {
    const screen = new AnyScreen(['home']);
    const calls = screen
      .all((element) => element.type === 'a' && String(element.props.href).startsWith('tel:'))
      .map((link) => link.props.href);
    expect(new Set(calls)).toEqual(new Set(POISON_CENTER_CONTACTS.map(telHref)));
    const text = textOf(screen.tree);
    for (const contact of POISON_CENTER_CONTACTS) expect(text).toContain(contact.phone);
  });
});

// ---- Árvore de toxíndromes -----------------------------------------------------------------

describe('árvore de toxíndromes × ToxPath', () => {
  it('todo caminho: mesma pergunta, mesmo número, mesmo progresso e mesma toxíndrome no fim', () => {
    let leaves = 0;
    const visit = (anyState: unknown[], ours: ToxidromeFlowState, depth: number) => {
      const screen = new AnyScreen(anyState.map((value) => structuredClone(value)));
      const step = toxidromeStep(ours);
      expect(progressOf(screen.tree), JSON.stringify(ours)).toBeCloseTo(toxidromeProgress(ours), 9);

      if (step.kind === 'result') {
        leaves += 1;
        const name = screen.all((element) => element.type === 'h3')[0];
        expect(fromAny(textOf(name))).toBe(norm(step.toxidrome.name));
        expect(fromAny(valueNextTo(screen.tree, 'Recomendações terapêuticas') ?? '')).toBe(
          norm(step.toxidrome.treatment),
        );
        return;
      }

      const card = screen.all((element) => element.type === 'card')[0]!;
      expect(fromAny(textOf(findAll(card, (element) => element.type === 'h2')[0]))).toBe(
        norm(step.question.text),
      );
      expect(textOf(card)).toContain(`Pergunta ${step.number}`);
      const buttons = findAll(card, (element) => element.type === 'button');
      expect(buttons.map((button) => fromAny(textOf(button)))).toEqual(
        step.question.options.map(({ label }) => norm(label)),
      );

      for (const [index, option] of step.question.options.entries()) {
        const next = new AnyScreen(anyState.map((value) => structuredClone(value)));
        next.click(
          findAll(
            next.all((element) => element.type === 'card')[0]!,
            (element) => element.type === 'button',
          )[index]!,
        );
        visit(
          next.state,
          toxidromeFlowReducer(ours, { type: 'answer', value: option.value }),
          depth + 1,
        );
      }

      if (depth > 0) {
        const back = new AnyScreen(anyState.map((value) => structuredClone(value)));
        back.click(back.button('Pergunta anterior'));
        const ourBack = toxidromeFlowReducer(ours, { type: 'back' });
        expect(progressOf(back.tree)).toBeCloseTo(toxidromeProgress(ourBack), 9);
      }
    };
    visit(['toxindromes', [], null], INITIAL_TOXIDROME_FLOW, 0);
    // 18 caminhos da pergunta 1 até uma toxíndrome.
    expect(leaves).toBe(18);
  });
});

// ---- Descontaminação -----------------------------------------------------------------------

describe('descontaminação × ToxPath', () => {
  const ALERT_TONE: Record<string, string> = { danger: 'critical', warning: 'attention' };

  it('todo caminho dos 5 passos leva ao mesmo resultado, com o mesmo texto e tom', () => {
    let leaves = 0;
    const visit = (anyState: unknown[], ours: DecontaminationFlowState) => {
      const screen = new AnyScreen(anyState);
      const view = decontaminationView(ours);
      expect(progressOf(screen.tree)).toBeCloseTo(decontaminationProgress(ours), 9);

      if (view.kind === 'intro') {
        expect(textOf(screen.tree)).toContain(DECONTAMINATION_INTRO.title);
        const next = new AnyScreen([...anyState]);
        next.click(next.button('Iniciar avaliação'));
        visit(next.state, decontaminationFlowReducer(ours, { type: 'start' }));
        return;
      }

      if (view.kind === 'result') {
        leaves += 1;
        if (view.result.id === 'indicado') {
          const text = textOf(screen.tree);
          expect(text).toContain(view.result.title);
          expect(text).toContain(view.reducedBenefit ? REDUCED_BENEFIT_TEXT : view.result.text);
          return;
        }
        const alert = screen.all((element) => element.type === 'alertcard')[0]!;
        expect(ALERT_TONE[String(alert.props.type)]).toBe(view.result.tone);
        expect(fromAny(String(alert.props.title))).toBe(norm(view.result.title));
        expect(fromAny(textOf(alert))).toBe(norm(view.result.text));
        return;
      }

      const card = screen.all((element) => element.type === 'card')[0]!;
      expect(textOf(card)).toContain(`Passo ${view.step.id} de 5`);
      expect(fromAny(textOf(findAll(card, (element) => element.type === 'h2')[0]))).toBe(
        norm(view.step.question),
      );
      const buttons = findAll(card, (element) => element.type === 'button');
      expect(buttons.map((button) => fromAny(textOf(button)))).toEqual(
        view.step.options.map(({ label }) => norm(label)),
      );
      for (const [index, option] of view.step.options.entries()) {
        const next = new AnyScreen(structuredClone(anyState));
        next.click(
          findAll(
            next.all((element) => element.type === 'card')[0]!,
            (element) => element.type === 'button',
          )[index]!,
        );
        visit(
          next.state,
          decontaminationFlowReducer(ours, { type: 'answer', value: option.value }),
        );
      }
    };
    anyWeight = null;
    visit(['descontaminação', 0, {}, null, '', '', ''], INITIAL_DECONTAMINATION_FLOW);
    // 18 caminhos até um resultado.
    expect(leaves).toBe(18);
  });

  it(`carvão ativado em ${DIFFERENTIAL_CASES} pesos = CarvaoAtivadoCalc`, () => {
    const random = seededRandom(SEED);
    const indicated = [
      'descontaminação',
      5,
      { 1: 'nao', 2: 'menos_1h', 3: 'adsorvida', 4: 'consciente', 5: 'sem_ci' },
      'indicado',
      '',
      '',
      '',
    ];
    for (let index = 0; index < DIFFERENTIAL_CASES; index += 1) {
      const weight = random.onGrid(0.5, 300, 0.1);
      anyWeight = weight;
      const screen = new AnyScreen([...indicated]);
      const dose = screen.all((element) => String(element.props.className).includes('text-2xl'))[0];
      expect(textOf(dose), `caso ${index}: ${weight} kg`).toBe(
        `${activatedCharcoalDose(weight)} g`,
      );
    }
    anyWeight = null;
  });
});

// ---- Critérios de destino ------------------------------------------------------------------

describe('critérios de destino × ToxPath', () => {
  const UTI = DISPOSITION_CRITERIA.filter(({ level }) => level === 'uti');
  const ENFERMARIA = DISPOSITION_CRITERIA.filter(({ level }) => level === 'enfermaria');

  function anyDisposition(uti: boolean[], enfermaria: boolean[]) {
    const screen = new AnyScreen(['disposição', uti, enfermaria]);
    const bar = screen.all(
      (element) => 'style' in element.props && textOf(element).startsWith('CONSIDERE '),
    )[0];
    const count = screen.all(
      (element) => element.type === 'p' && /marcado/.test(textOf(element)),
    )[0];
    return { label: textOf(bar), count: textOf(count), screen };
  }

  it('a lista, os avisos e o lembrete das bombas-relógio são os do ANY', () => {
    const { screen } = anyDisposition(
      UTI.map(() => false),
      ENFERMARIA.map(() => false),
    );
    const titles = screen
      .all((element) => element.type === 'collapsible')
      .map((element) => String(element.props.title));
    expect(titles.map(fromAny)).toEqual(DISPOSITION_CRITERIA.map(({ text }) => norm(text)));
    const alerts = screen.all((element) => element.type === 'alertcard');
    expect(
      alerts.map((alert) => [
        alert.props.title ? fromAny(String(alert.props.title)) : null,
        fromAny(textOf(alert)),
      ]),
    ).toEqual([
      [null, norm(DISPOSITION_INTRO)],
      [norm(DISPOSITION_NOTES.observation.title), norm(DISPOSITION_NOTES.observation.text)],
      [norm(DISPOSITION_NOTES.discharge.title), norm(DISPOSITION_NOTES.discharge.text)],
    ]);
    expect(fromAny(textOf(screen.tree))).toContain(norm(DISPOSITION_NOTES.delayedToxicity.text));
  });

  it(`${DIFFERENTIAL_CASES} combinações de critérios: mesmo destino e mesma contagem`, () => {
    const random = seededRandom(SEED + 1);
    const cases: boolean[][] = [
      DISPOSITION_CRITERIA.map(() => false),
      ...DISPOSITION_CRITERIA.map((_, only) =>
        DISPOSITION_CRITERIA.map((__, index) => index === only),
      ),
    ];
    while (cases.length < DIFFERENTIAL_CASES) {
      const density = random.pick([0.05, 0.15, 0.4]);
      cases.push(DISPOSITION_CRITERIA.map(() => random.next() < density));
    }
    for (const [index, checked] of cases.entries()) {
      const uti = checked.slice(0, UTI.length);
      const enfermaria = checked.slice(UTI.length);
      const reference = anyDisposition(uti, enfermaria);
      const ours = assessDisposition(
        DISPOSITION_CRITERIA.filter((_, position) => checked[position]).map(({ id }) => id),
      );
      expect(fromAny(reference.label), `caso ${index}`).toBe(norm(ours.disposition.label));
      expect(reference.count).toBe(checkedCountLabel(ours.checked.length));
    }
  });
});

// ---- Antídotos: NAC, nomograma e atropina --------------------------------------------------

describe('antídotos × ToxPath', () => {
  function antidotes(state: {
    search?: string;
    peso?: string;
    tempo?: string;
    nivel?: string;
    atropina?: string;
  }) {
    return new AnyScreen([
      'antídotos',
      state.search ?? '',
      state.peso ?? '',
      state.tempo ?? '',
      state.nivel ?? '',
      state.atropina ?? '',
    ]);
  }

  /** "10.5 g (10500 mg) em 200 mL SF" → gramas e mg do ANY. */
  function stage(text: string | null): { grams: string; mg: number; rest: string } {
    const match = /^([\d.]+) g \(([\d.e+-]+) mg\) (.+)$/.exec(text ?? '');
    if (!match) throw new Error(`etapa da NAC fora do formato: ${text}`);
    return { grams: match[1]!, mg: Number(match[2]), rest: match[3]! };
  }

  it(`NAC em ${DIFFERENTIAL_CASES} pesos: mesmas três etapas e mesma dose total`, () => {
    const random = seededRandom(SEED + 2);
    const labels = ['1a ETAPA (1 hora)', '2a ETAPA (4 horas)', '3a ETAPA (16 horas)'];
    for (let index = 0; index < DIFFERENTIAL_CASES; index += 1) {
      const weight = random.onGrid(20, 250, 0.1);
      const screen = antidotes({ peso: String(weight) });
      const ours = nacDoses(weight);
      for (const [position, label] of labels.entries()) {
        const reference = stage(valueNextTo(screen.tree, label));
        const ported = ours.stages[position]!;
        expect(reference.grams.replace('.', ','), `caso ${index}: ${weight} kg`).toBe(
          formatDecimal(ported.doseMg / 1000, 1),
        );
        expect(Number(formatCompact(ported.doseMg, 1).replace(',', '.'))).toBeCloseTo(
          reference.mg,
          6,
        );
        expect(reference.rest).toBe(`em ${ported.diluentMl} mL SF`);
      }
      const total = screen.all(
        (element) => element.type === 'p' && textOf(element).startsWith('Dose total:'),
      )[0];
      expect(textOf(total).replace('.', ',')).toBe(
        `Dose total: ${formatDecimal(ours.totalMg / 1000, 1)} g em 21 horas`,
      );
    }
  });

  it('NAC fora de 20–250 kg: o ANY não mostra dose e o Copiloto recusa o peso', () => {
    for (const weight of ['19.9', '250.1']) {
      expect(valueNextTo(antidotes({ peso: weight }).tree, '1a ETAPA (1 hora)')).toBeNull();
      expect(validateNumber(weight.replace('.', ','), NAC_WEIGHT_RANGE).ok).toBe(false);
    }
  });

  it(`nomograma do card em ${DIFFERENTIAL_CASES} casos: mesma linha; acima/abaixo só difere no arredondamento da linha`, () => {
    const random = seededRandom(SEED + 3);
    let roundingDivergences = 0;
    for (let index = 0; index < DIFFERENTIAL_CASES; index += 1) {
      const hours = random.onGrid(4, 24, 0.1);
      const exactLine = 150 * Math.exp(-0.173 * (hours - 4));
      // Um terço dos casos cai colado na linha, onde as duas contas podem discordar.
      const level =
        random.next() < 0.33
          ? Math.max(0.1, Number((exactLine + random.pick([-0.1, -0.05, 0, 0.05, 0.1])).toFixed(2)))
          : random.onGrid(0.1, 1000, 0.1);
      const screen = antidotes({ tempo: String(hours), nivel: String(level) });
      const alert = screen.all(
        (element) =>
          element.type === 'alertcard' && /LINHA DE TRATAMENTO/.test(String(element.props.title)),
      )[0];
      if (!alert) throw new Error(`caso ${index}: nomograma do ANY sem resultado`);
      const anyLine = /Linha em [\d.]+h: ([\d.]+) ug\/mL/.exec(textOf(alert))?.[1];
      const anyAbove = String(alert.props.title).startsWith('ACIMA');

      const ours = evaluateCalculator(NOMOGRAMA_RUMACK, {
        inputs: { hours: String(hours).replace('.', ','), level: String(level).replace('.', ',') },
      });
      if (ours.status !== 'complete') throw new Error(`caso ${index}: calculadora sem resultado`);
      expect(formatDecimal(ours.value, 1), `caso ${index}: ${hours} h`).toBe(
        anyLine?.replace('.', ','),
      );
      const oursAbove = ours.band.id === 'acima';
      if (oursAbove !== anyAbove) {
        roundingDivergences += 1;
        const [low, high] = [Math.min(exactLine, ours.value), Math.max(exactLine, ours.value)];
        expect(
          level,
          `caso ${index}: diverge fora da faixa do arredondamento`,
        ).toBeGreaterThanOrEqual(low);
        expect(level).toBeLessThan(high);
      }
    }
    // A faixa existe e é estreita: alguns casos colados na linha divergem, quase nenhum.
    expect(roundingDivergences).toBeGreaterThan(0);
    expect(roundingDivergences).toBeLessThan(DIFFERENTIAL_CASES * 0.1);
  });

  it(`atropina em ${DIFFERENTIAL_CASES} doses de ataque: mesma infusão e mesmas ampolas`, () => {
    const random = seededRandom(SEED + 4);
    for (let index = 0; index < DIFFERENTIAL_CASES; index += 1) {
      const loading = random.onGrid(0.01, 1000, 0.01);
      const screen = antidotes({ atropina: String(loading) });
      const rate = screen.all(
        (element) => element.type === 'p' && /mg\/hora$/.test(textOf(element)),
      )[0];
      const ampoules = screen.all(
        (element) => element.type === 'p' && /^Aprox\./.test(textOf(element)),
      )[0];
      const ours = atropineMaintenance(loading);
      expect(textOf(rate).replace('.', ','), `caso ${index}: ${loading} mg`).toBe(
        atropineRateText(ours),
      );
      expect(textOf(ampoules)).toBe(atropineAmpoulesText(ours));
    }
  });

  it('busca: tudo o que o ANY achava o Copiloto acha (e também sem acento)', () => {
    const words = new Set(
      anyTox.antidotes.flatMap(({ name, indication, searchTerms }) =>
        `${name} ${indication} ${searchTerms}`.toLowerCase().split(/[\s/().,-]+/),
      ),
    );
    for (const word of words) {
      if (word.length < 3 || word.includes('�')) continue;
      const screen = antidotes({ search: word });
      const found = screen
        .all((element) => element.type === 'collapsible')
        .map((element) => fromAny(String(element.props.title)));
      const ours = searchAntidotes(word).map(({ name }) => norm(name));
      for (const name of found) expect(ours, `"${word}"`).toContain(name);
    }
  });
});

// ---- Tabelas: notas de cada aba ------------------------------------------------------------

describe('tabelas × ToxPath', () => {
  it.each(TABLE_TABS.map((tab) => [tab.id, tab] as const))('aba %s: mesmas notas', (id, tab) => {
    const screen = new AnyScreen(['tabelas', id, '', null, '', '']);
    const anyNotes = screen
      .all((element) => element.type === 'alertcard')
      .map((alert) => [String(alert.props.type), fromAny(textOf(alert))]);
    const ours = tab.blocks.flatMap((block) =>
      block.kind === 'note'
        ? [[block.tone === 'critical' ? 'danger' : 'info', norm(`${block.lead}: ${block.text}`)]]
        : [],
    );
    expect(ours).toEqual(anyNotes);
  });

  it('títulos e cabeçalhos das tabelas de cada aba', () => {
    for (const tab of TABLE_TABS) {
      const screen = new AnyScreen(['tabelas', tab.id, '', null, '', '']);
      const headers = screen
        .all((element) => element.type === 'th')
        .map((cell) => fromAny(textOf(cell)));
      const ours = tab.blocks.flatMap((block) =>
        block.kind === 'table' ? block.headers.map(norm) : [],
      );
      expect(ours, tab.id).toEqual(headers);
    }
  });
});
