import { describe, expect, it } from 'vitest';
import { normalizeSearchText } from '../../src/shared/clinical-tools/catalog';
import {
  evaluatePerfusion,
  PERFUSION_INPUTS,
  type PerfusionQuadrantId,
} from '../../src/shared/clinical-tools/shock/perfusion-quadrant';
import { evaluateVneri, VNERI_INPUTS } from '../../src/shared/clinical-tools/shock/vneri';
import {
  classifyGreyZone,
  classifyVti,
  DISTRIBUTIVE_SCREEN,
  evaluateLowOutput,
  GREY_ZONE_PATTERNS,
  INITIAL_VTI_STATE,
  LOW_OUTPUT_FLUIDS,
  LOW_OUTPUT_QUESTIONS,
  VTI_ENTRY,
  VTI_INPUT,
  VTI_MEASUREMENT,
  VTI_RESULT_INFUSIONS,
  VTI_SHOCK_TYPE_CONTENT,
  VTI_SHOCK_TYPES,
  vtiBarPosition,
  vtiReducer,
  VTI_ZONES,
  type LactateTrend,
  type LowOutputAnswers,
  type VentilationMode,
  type VtiAction,
  type VtiScreen,
  type VtiShockType,
  type VtiState,
} from '../../src/shared/clinical-tools/shock/vti';
import type { YesNo } from '../../src/shared/clinical-tools/shock/septic-shock';
import type { ResultTone } from '../../src/shared/clinical-tools/tone';
import { DIFFERENTIAL_CASES, seededRandom } from './seeded-random';
import {
  applyAny,
  buttonWithText,
  click,
  componentsNamed,
  findAll,
  renderShockPath,
  textOf,
  type AnyShockState,
  type ShockPathRender,
} from './shock-path-harness';

/**
 * CC-317 — o choque indiferenciado (módulo VTI, VNERi e gap CO2 × SvcO2
 * avulsos) dá o mesmo resultado do ShockPath congelado do ANY: a faixa do VTI
 * e a barra em 1.000 valores e nas bordas, a cascata do baixo débito em todas
 * as combinações de respostas, a zona cinzenta em 1.000 entradas e nas bordas,
 * e o resumo de cada tipo de choque.
 */

const SEED = 20261016;

function norm(text: string): string {
  return normalizeSearchText(
    text
      .replace(/ScvO(₂|2)/g, 'SvcO2')
      .replace(/pCO2 gap/g, 'gap de pCO2')
      .replace(/^\d+\.\s*/, '')
      .replace(/:$/, '')
      .replace(/\.$/, ''),
  );
}

const ANY_CARD_TONE: Record<string, ResultTone> = {
  red: 'critical',
  yellow: 'attention',
  green: 'neutral',
  // Azul não tem tom de risco no Copiloto (revisão clínica).
  blue: 'neutral',
};

const ANY_SCREEN: Record<string, VtiScreen> = {
  'vti-entry': 'inicio',
  'vti-measure': 'medida',
  'vti-low': 'baixo-debito',
  'vti-grey': 'zona-cinzenta',
  'vti-distributive': 'distributivo',
  'vti-result': 'resultado',
};

const ANY_SHOCK_TYPE: Record<string, VtiShockType> = {
  tamponamento: 'tamponamento',
  obstrutivo: 'obstrutivo',
  cardiogênico: 'cardiogenico',
  'cardiogênico-valvar': 'cardiogenico-valvar',
  hipovolemico: 'hipovolemico',
  distributivo: 'distributivo',
};

const ANY_VENTILATION: Record<VentilationMode, string> = {
  espontanea: 'espontanea',
  mecanica: 'mecânica',
};

const ANY_QUADRANT_ID: Record<string, PerfusionQuadrantId> = {
  lowDC: 'baixo-debito',
  anemic: 'disoxia-anemica',
  micro: 'microcirculacao-inadequada',
  cytopathic: 'hipoxia-citopatica',
};

function expectNoMismatch(mismatches: readonly unknown[]) {
  expect(mismatches.filter(Boolean).slice(0, 5)).toEqual([]);
}

function typed(value: number): string {
  return String(value).replace('.', ',');
}

/** Toca um botão do ANY e devolve tela e tipo de choque resultantes. */
function anyAfter(state: AnyShockState, render: ShockPathRender, label: string) {
  const after = applyAny(state, click(render, buttonWithText(render, label)));
  const type = after.vtiShockType as string | null;
  return {
    screen: ANY_SCREEN[String(after.screen)],
    shockType: type === null ? null : ANY_SHOCK_TYPE[type],
  };
}

function mineAfter(state: VtiState, action: VtiAction) {
  const next = vtiReducer(state, action);
  return { screen: next.screen, shockType: next.shockType };
}

// ---- Medida do VTI ----

describe('VTI contra o ANY (faixa, barra e próximo passo)', () => {
  it(`classifica o VTI como o ANY em ${DIFFERENTIAL_CASES} valores e nas bordas`, () => {
    const random = seededRandom(SEED);
    const values = [
      1,
      15.9,
      16,
      16.1,
      19.9,
      20,
      20.1,
      40,
      ...Array.from({ length: DIFFERENTIAL_CASES }, () =>
        random.onGrid(VTI_INPUT.min, VTI_INPUT.max, VTI_INPUT.step),
      ),
    ];
    const mismatches = values.map((vti) => {
      const render = renderShockPath({ screen: 'vti-measure', vtiValue: vti });
      const cards = componentsNamed(render, 'ResultCard');
      const zone = classifyVti(vti);
      const marker = findAll(render.tree, (element) =>
        String((element.props.style as { left?: string } | undefined)?.left ?? '').startsWith(
          'calc(',
        ),
      )[0];
      const anyPosition = Number(
        String((marker?.props.style as { left: string }).left).match(/calc\(([\d.]+)%/)?.[1],
      );
      const expected = {
        title: norm(String(cards[0]?.props.title)),
        tone: ANY_CARD_TONE[String(cards[0]?.props.color)],
        position: anyPosition,
      };
      const received = { title: norm(zone.title), tone: zone.tone, position: vtiBarPosition(vti) };
      return JSON.stringify(expected) === JSON.stringify(received)
        ? null
        : { case: vti, expected, received };
    });
    expectNoMismatch(mismatches);
  });

  it('o botão de cada faixa leva ao mesmo passo do algoritmo', () => {
    const cases: [number, VtiAction][] = [
      [12, { type: 'investigar-baixo-debito' }],
      [18, { type: 'avaliar-perfusao' }],
      [25, { type: 'choque-distributivo' }],
    ];
    for (const [vti, action] of cases) {
      const state = { screen: 'vti-measure', vtiValue: vti };
      const render = renderShockPath(state);
      const zone = classifyVti(vti);
      expect(mineAfter({ ...INITIAL_VTI_STATE, screen: 'medida' }, action)).toEqual(
        anyAfter(state, render, zone.next),
      );
    }
  });

  it('tem os mesmos sinais de choque e o mesmo passo a passo da medida', () => {
    const entry = renderShockPath({ screen: 'vti-entry' });
    expect(
      findAll(entry.tree, (element) => element.type === 'li').map((li) => norm(textOf(li))),
    ).toEqual(VTI_ENTRY.signs.map(norm));
    const measure = renderShockPath({ screen: 'vti-measure' });
    const steps = findAll(
      measure.tree,
      (element) => element.type === 'p' && /^\d\./.test(textOf(element)),
    ).map((p) => norm(textOf(p)));
    expect(steps).toEqual(VTI_MEASUREMENT.howTo.map(norm));
  });
});

// ---- Baixo débito ----

const ANSWERS: readonly (YesNo | null)[] = [null, 'sim', 'nao'];

function* allLowOutputAnswers(): Generator<LowOutputAnswers> {
  for (const pericardio of ANSWERS) {
    for (const vd of ANSWERS) {
      for (const ve of ANSWERS) {
        for (const valvar of ANSWERS) {
          for (const ventilation of [null, 'espontanea', 'mecanica'] as const) {
            for (const fluidResponsive of ANSWERS) {
              yield { pericardio, vd, ve, valvar, ventilation, fluidResponsive };
            }
          }
        }
      }
    }
  }
}

function anyLowOutputState(answers: LowOutputAnswers): AnyShockState {
  return {
    screen: 'vti-low',
    vtiValue: 12,
    vtiPericardio: answers.pericardio,
    vtiVD: answers.vd,
    vtiVE: answers.ve,
    vtiValvar: answers.valvar,
    vtiVentMode: answers.ventilation === null ? null : ANY_VENTILATION[answers.ventilation],
    vtiFluidResp: answers.fluidResponsive,
  };
}

/** O que a tela do ANY mostra na investigação do baixo débito. */
function anyLowOutput(render: ShockPathRender) {
  const hasText = (text: string) =>
    findAll(render.tree, (element) => element.type === 'div' && textOf(element) === text).length >
    0;
  const outcomeTitle = componentsNamed(render, 'ResultCard')[0]?.props.title;
  const noResponse = componentsNamed(render, 'AlertCard').some(
    ({ props }) => props.title === 'Não responsivo a fluidos',
  );
  const info = componentsNamed(render, 'InfoCard')[0]?.props.title;
  return {
    questions: LOW_OUTPUT_QUESTIONS.filter(({ label }) => hasText(label)).map(({ id }) => id),
    fluidBlock: hasText(LOW_OUTPUT_FLUIDS.title),
    fluidQuestion: hasText(LOW_OUTPUT_FLUIDS.question),
    info: info === undefined ? null : String(info),
    outcome:
      outcomeTitle !== undefined ? norm(String(outcomeTitle)) : noResponse ? 'sem-causa' : null,
  };
}

const ANY_INFO_TITLE: Record<VentilationMode, string> = {
  espontanea: 'Passive Leg Raising (PLR)',
  mecanica: 'Variação dinâmica',
};

describe('investigação do baixo débito contra o ANY', () => {
  it('mostra as mesmas perguntas e o mesmo desfecho em todas as 729 combinações de respostas', () => {
    const mismatches = [];
    let total = 0;
    for (const answers of allLowOutputAnswers()) {
      total += 1;
      const expected = anyLowOutput(renderShockPath(anyLowOutputState(answers)));
      const evaluation = evaluateLowOutput(answers);
      const received = {
        questions: evaluation.questions,
        fluidBlock: evaluation.fluidBlock,
        fluidQuestion: evaluation.fluidQuestion,
        info:
          evaluation.fluidBlock && answers.ventilation !== null
            ? ANY_INFO_TITLE[answers.ventilation]
            : null,
        outcome:
          evaluation.outcome === null || evaluation.outcome === 'sem-causa'
            ? evaluation.outcome
            : norm(VTI_SHOCK_TYPE_CONTENT[evaluation.outcome].label),
      };
      if (JSON.stringify(expected) !== JSON.stringify(received)) {
        mismatches.push({ case: answers, expected, received });
      }
    }
    expect(total).toBe(729);
    expectNoMismatch(mismatches);
  });

  it('"Ver resumo" fixa o mesmo tipo de choque, com os mesmos achados, causas e condutas', () => {
    const mismatches = [];
    for (const answers of allLowOutputAnswers()) {
      const evaluation = evaluateLowOutput(answers);
      if (evaluation.outcome === null || evaluation.outcome === 'sem-causa') continue;
      const anyState = anyLowOutputState(answers);
      const render = renderShockPath(anyState);
      const content = VTI_SHOCK_TYPE_CONTENT[evaluation.outcome];
      // O cartão do desfecho (ResultCard); o da PLR, quando aparece, fica de fora.
      const card = findAll(render.tree, (element) =>
        String(element.props.className ?? '').startsWith('p-4 rounded-xl my-4'),
      )[0];
      const expected = {
        ...anyAfter(anyState, render, 'Ver resumo'),
        tone: ANY_CARD_TONE[String(componentsNamed(render, 'ResultCard')[0]?.props.color)],
        sections: findAll(card, (element) => element.type === 'strong').map((strong) =>
          norm(textOf(strong)),
        ),
        items: findAll(card, (element) => element.type === 'li').map((li) => norm(textOf(li))),
      };
      const received = {
        ...mineAfter(
          { ...INITIAL_VTI_STATE, screen: 'baixo-debito', lowOutput: answers },
          {
            type: 'ver-resumo',
          },
        ),
        tone: content.tone,
        sections: content.sections.map(({ title }) => norm(title)),
        items: content.sections.flatMap(({ items }) => items.map(norm)),
      };
      if (JSON.stringify(expected) !== JSON.stringify(received)) {
        mismatches.push({ case: answers, expected, received });
      }
    }
    expectNoMismatch(mismatches);
  });

  it('"Investigar causa" zera as respostas como o ANY (o modo ventilatório fica)', () => {
    const anyState = {
      screen: 'vti-measure',
      vtiValue: 12,
      vtiPericardio: 'nao',
      vtiVD: 'nao',
      vtiVentMode: 'mecânica',
      vtiFluidResp: 'sim',
      vtiShockType: 'hipovolemico',
    };
    const render = renderShockPath(anyState);
    const after = applyAny(anyState, click(render, buttonWithText(render, 'Investigar causa')));
    const mine = vtiReducer(
      {
        ...INITIAL_VTI_STATE,
        screen: 'medida',
        lowOutput: {
          pericardio: 'nao',
          vd: 'nao',
          ve: null,
          valvar: null,
          ventilation: 'mecanica',
          fluidResponsive: 'sim',
        },
        shockType: 'hipovolemico',
      },
      { type: 'investigar-baixo-debito' },
    );
    expect(mine.lowOutput).toEqual({
      pericardio: after.vtiPericardio,
      vd: after.vtiVD,
      ve: after.vtiVE,
      valvar: after.vtiValvar,
      ventilation: after.vtiVentMode === 'mecânica' ? 'mecanica' : after.vtiVentMode,
      fluidResponsive: after.vtiFluidResp,
    });
    expect(mine.shockType).toBe(after.vtiShockType);
  });
});

// ---- Zona cinzenta ----

describe('zona cinzenta contra o ANY', () => {
  function compareGrey(svco2: number, gapCO2: number, trend: LactateTrend) {
    const state = {
      screen: 'vti-grey',
      vtiValue: 18,
      vtiGreyScvo2: svco2,
      vtiGreyGapCO2: gapCO2,
      vtiGreyLactato: trend === 'crescente' ? 1 : 0,
    };
    const card = componentsNamed(renderShockPath(state), 'ResultCard')[0];
    const pattern = GREY_ZONE_PATTERNS[classifyGreyZone(svco2, gapCO2, trend)];
    const expected = {
      title: norm(String(card?.props.title)),
      tone: ANY_CARD_TONE[String(card?.props.color)],
    };
    const received = { title: norm(pattern.title), tone: pattern.tone };
    return JSON.stringify(expected) === JSON.stringify(received)
      ? null
      : { case: `${svco2}/${gapCO2}/${trend}`, expected, received };
  }

  it(`dá o mesmo padrão em ${DIFFERENTIAL_CASES} entradas`, () => {
    const random = seededRandom(SEED + 1);
    const mismatches = Array.from({ length: DIFFERENTIAL_CASES }, () =>
      compareGrey(
        random.onGrid(PERFUSION_INPUTS.svco2.min, PERFUSION_INPUTS.svco2.max, 0.1),
        random.onGrid(PERFUSION_INPUTS.gapCO2.min, PERFUSION_INPUTS.gapCO2.max, 0.1),
        random.pick(['crescente', 'estavel'] as const),
      ),
    );
    expectNoMismatch(mismatches);
  });

  it('dá o mesmo padrão em todas as combinações das bordas', () => {
    const mismatches = [];
    for (const svco2 of [69.9, 70, 70.1]) {
      for (const gapCO2 of [5.9, 6, 6.1]) {
        for (const trend of ['crescente', 'estavel'] as const) {
          mismatches.push(compareGrey(svco2, gapCO2, trend));
        }
      }
    }
    expectNoMismatch(mismatches);
  });

  it('os botões de cada padrão levam ao mesmo lugar', () => {
    const cases: [number, number, LactateTrend, string, VtiAction][] = [
      [60, 8, 'crescente', 'Investigar causa de baixo débito', { type: 'investigar-baixo-debito' }],
      [75, 4, 'estavel', 'Choque distributivo', { type: 'choque-distributivo' }],
      [60, 4, 'estavel', 'Baixo débito', { type: 'investigar-baixo-debito' }],
      [60, 4, 'estavel', 'Distributivo', { type: 'choque-distributivo' }],
    ];
    for (const [svco2, gapCO2, trend, button, action] of cases) {
      const state = {
        screen: 'vti-grey',
        vtiValue: 18,
        vtiGreyScvo2: svco2,
        vtiGreyGapCO2: gapCO2,
        vtiGreyLactato: trend === 'crescente' ? 1 : 0,
      };
      expect(mineAfter({ ...INITIAL_VTI_STATE, screen: 'zona-cinzenta' }, action)).toEqual(
        anyAfter(state, renderShockPath(state), button),
      );
    }
  });
});

// ---- Distributivo e resultado ----

describe('choque distributivo e resumo contra o ANY', () => {
  it('a tela do distributivo tem as mesmas causas e condutas', () => {
    const render = renderShockPath({ screen: 'vti-distributive', vtiValue: 25 });
    const shown = norm(textOf(render.tree));
    for (const section of VTI_SHOCK_TYPE_CONTENT.distributivo.sections) {
      for (const item of section.items) expect(shown, item).toContain(norm(item));
    }
    expect(shown).toContain(norm(DISTRIBUTIVE_SCREEN.title));
  });

  it.each(VTI_SHOCK_TYPES)('o resumo de %s tem o mesmo título, subtítulo e linhas', (type) => {
    const anyType = Object.keys(ANY_SHOCK_TYPE).find((key) => ANY_SHOCK_TYPE[key] === type);
    const render = renderShockPath({ screen: 'vti-result', vtiValue: 18, vtiShockType: anyType });
    const content = VTI_SHOCK_TYPE_CONTENT[type];
    const title = findAll(render.tree, (element) =>
      String(element.props.className ?? '').startsWith('text-lg font-bold'),
    ).map(textOf);
    const subtitle = findAll(render.tree, (element) =>
      String(element.props.className ?? '').includes('text-sm text-text-secondary mt-2'),
    ).map(textOf);
    const lines = findAll(
      render.tree,
      (element) =>
        element.type === 'div' &&
        element.children.some(
          (child) => typeof child === 'object' && child !== null && child.type === 'strong',
        ),
    ).map((div) => norm(textOf(div)));
    // PHTN (sigla em inglês) virou "hipertensão pulmonar" no porte.
    expect(title.map(norm)).toEqual([norm(content.label)]);
    expect(subtitle.map(norm)).toEqual([norm(content.summary.subtitle)]);
    expect(lines.map((line) => line.replace('phtn', 'hipertensao pulmonar'))).toEqual(
      content.summary.lines.map(({ label, text }) => norm(`${label}: ${text}`)),
    );
  });

  it('os atalhos de Infusões levam às mesmas drogas', () => {
    const drug = (path: string) => path.replace('/infusion?drug=', '');
    const cardiogenic = renderShockPath({
      screen: 'vti-low',
      vtiPericardio: 'nao',
      vtiVD: 'nao',
      vtiVE: 'sim',
    });
    click(cardiogenic, buttonWithText(cardiogenic, 'Calculadora dobutamina'));
    expect(cardiogenic.navigated.map(drug)).toEqual(VTI_SHOCK_TYPE_CONTENT.cardiogenico.infusions);

    const distributive = renderShockPath({ screen: 'vti-distributive' });
    click(distributive, buttonWithText(distributive, 'Calculadora NE'));
    click(distributive, buttonWithText(distributive, 'Calculadora vasopressina'));
    expect(distributive.navigated.map(drug)).toEqual(VTI_SHOCK_TYPE_CONTENT.distributivo.infusions);

    const result = renderShockPath({ screen: 'vti-result', vtiShockType: 'distributivo' });
    for (const label of ['NE', 'Vasopressina', 'Dobutamina']) {
      click(result, buttonWithText(result, label));
    }
    expect(result.navigated.map(drug)).toEqual(VTI_RESULT_INFUSIONS);
  });

  it('as faixas do VTI do motor são as três do ANY', () => {
    expect(Object.keys(VTI_ZONES)).toEqual(['baixo-debito', 'zona-cinzenta', 'debito-adequado']);
  });
});

// ---- VNERi e gap CO2 avulsos ----

describe('VNERi e gap CO2 × SvcO2 avulsos contra o ANY', () => {
  it(`o VNERi avulso dá o mesmo valor em ${DIFFERENTIAL_CASES} entradas`, () => {
    const random = seededRandom(SEED + 2);
    const mismatches = Array.from({ length: DIFFERENTIAL_CASES }, (_, index) => {
      const pad = random.onGrid(VNERI_INPUTS.pad.min, VNERI_INPUTS.pad.max, 1);
      const fc = random.onGrid(VNERI_INPUTS.fc.min, VNERI_INPUTS.fc.max, 1);
      const dose = random.onGrid(0.01, 3, 0.01);
      const any = renderShockPath({
        screen: 'vneri',
        vneriPadS: pad,
        vneriFcS: fc,
        vneriDoseS: dose,
      }).memos[3];
      const mine = evaluateVneri({ pad: typed(pad), fc: typed(fc), doseNE: typed(dose) });
      return mine.status === 'complete' && mine.value === any
        ? null
        : { case: index, expected: any, received: mine };
    });
    expectNoMismatch(mismatches);
  });

  it(`o gap CO2 avulso dá o mesmo quadrante em ${DIFFERENTIAL_CASES} entradas`, () => {
    const random = seededRandom(SEED + 3);
    const mismatches = Array.from({ length: DIFFERENTIAL_CASES }, (_, index) => {
      const svco2 = random.onGrid(PERFUSION_INPUTS.svco2.min, PERFUSION_INPUTS.svco2.max, 0.1);
      const gapCO2 = random.onGrid(PERFUSION_INPUTS.gapCO2.min, PERFUSION_INPUTS.gapCO2.max, 0.1);
      const render = renderShockPath({ screen: 'gapco2', scvo2S: svco2, gapCO2S: gapCO2 });
      const [action] = click(render, buttonWithText(render, 'Interpretar'));
      const expected = ANY_QUADRANT_ID[String((action?.value as { id: string }).id)];
      const mine = evaluatePerfusion({ svco2: typed(svco2), gapCO2: typed(gapCO2) });
      const received = mine.status === 'complete' ? mine.quadrant.id : mine.status;
      return expected === received ? null : { case: index, expected, received };
    });
    expectNoMismatch(mismatches);
  });
});
