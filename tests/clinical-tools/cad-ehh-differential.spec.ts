import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { fmt } from '../any-reference/formatters';
import * as any from '../any-reference/ketoCalc';
import * as K from '../any-reference/ketoData';
import {
  anionGap,
  correctedSodium,
  deltaDelta,
  dkaResolution,
  dkaSeverity,
  effectiveOsmolality,
  freeWaterDeficit,
  glucoseFall,
  hhsVolumeDeficit,
  insulinRate,
  kclPreparation,
  subcutaneousTransition,
  totalBodyWater,
  type Sex,
} from '../../src/shared/clinical-tools/cad-ehh/calc';
import {
  CONSCIOUSNESS_OPTIONS,
  DISPOSITION,
  INSULIN_RATES,
  KCL_PRESENTATIONS,
  KCL_ROUTES,
  LAB_FIELDS,
  MAINTENANCE_FLUID,
  POTASSIUM_BANDS,
  TRACK_OPTIONS,
  WORKSHEET_COLUMNS,
  WORKSHEET_ROWS,
  type CadEhhTrack,
  type Consciousness,
  type LabFieldId,
} from '../../src/shared/clinical-tools/cad-ehh/content';
import {
  CAD_EHH_STEPS,
  CONSULT_SCREEN_TITLE,
  CYCLE_FIELDS,
  HOME_CARDS,
  INITIAL_CAD_EHH_STATE,
  cadEhhReducer,
  panelGuidance,
  readCycle,
  readKcl,
  readPanel,
  type CadEhhState,
  type CycleFieldId,
} from '../../src/shared/clinical-tools/cad-ehh/roteiro';
import {
  ANION_GAP_HIGH_ABOVE,
  ANION_GAP_TEXT,
  DELTA_DELTA_TEXT,
  DELTA_DELTA_TONE,
  FALL_TONE,
  MISSING,
  NO_SEVERITY,
  POTASSIUM_TONE,
  WORKSHEET_HEADER_FIELDS,
  elapsedLabel,
  glucoseFallTitle,
  insulinRateText,
  kclPrescriptionLines,
  transitionDoseText,
} from '../../src/shared/clinical-tools/cad-ehh/screen-text';
import { formatDecimal } from '../../src/shared/clinical-tools/numbers';
import type { ResultTone } from '../../src/shared/clinical-tools/tone';
import {
  alertCards,
  KetoCiclo,
  KetoConsulta,
  KetoManejo,
  KetoPathInternals,
  KetoPlanilha,
  renderKeto,
  setterCalls,
} from './keto-path-harness';
import { DIFFERENTIAL_CASES, seededRandom, type SeededRandom } from './seeded-random';

/**
 * CC-326 — o roteiro de CAD e EHH dá o mesmo resultado do KetoPath congelado
 * (tests/any-reference/ketoCalc.ts e as telas Keto*.tsx).
 *
 * - Contas do `ketoCalc`: 1.000 entradas aleatórias de semente fixa por
 *   função, dentro das faixas do painel do ANY, com igualdade exata (a conta
 *   do porte é a mesma expressão, com o mesmo arredondamento).
 * - Gravidade da CAD: todas as combinações de pH, bicarbonato e consciência
 *   na grade das faixas do ANY.
 * - Regras que moram nas telas do ANY (trava da insulina, faixa do potássio,
 *   prescrição e espelho do KCl, fase B, cartões do ciclo, calculadoras):
 *   1.000 estados aleatórios desenhados pelo harness, comparados com o motor.
 *
 * O texto clínico não entra na comparação onde a regra de linguagem o mudou
 * (as condutas do potássio); aí compara-se a faixa escolhida.
 */

const SEED = 20261015;

/** AlertCard do ANY → tom do motor (ADR-017: verde e azul viram neutro). */
const ANY_ALERT_TONE: Record<string, ResultTone> = {
  danger: 'critical',
  warning: 'attention',
  success: 'neutral',
  info: 'neutral',
};

const FIELD = new Map(LAB_FIELDS.map((field) => [field.id, field]));

function lab(rng: SeededRandom, id: LabFieldId): number {
  const field = FIELD.get(id);
  if (!field) throw new Error(id);
  return rng.onGrid(field.min, field.max, field.step);
}

function maybe<T>(rng: SeededRandom, value: () => T, nullChance = 0.15): T | null {
  return rng.next() < nullChance ? null : value();
}

/** Como o médico digita: vírgula decimal. */
function typed(value: number | null): string {
  return value === null ? '' : String(value).replace('.', ',');
}

const weight = (rng: SeededRandom) => rng.onGrid(40, 200, 0.5);

interface Mismatch {
  case: number;
  expected: unknown;
  received: unknown;
}

function collect(run: (rng: SeededRandom, index: number) => Mismatch | null, seed = SEED) {
  const rng = seededRandom(seed);
  const mismatches: Mismatch[] = [];
  for (let index = 0; index < DIFFERENTIAL_CASES; index += 1) {
    const mismatch = run(rng, index);
    if (mismatch) mismatches.push(mismatch);
  }
  return mismatches.slice(0, 5);
}

function same(index: number, expected: unknown, received: unknown): Mismatch | null {
  return JSON.stringify(expected) === JSON.stringify(received)
    ? null
    : { case: index, expected, received };
}

// ---- 1. Contas do ketoCalc ----

describe('contas do ketoCalc (1.000 entradas cada)', () => {
  it('ânion-gap', () => {
    expect(
      collect((rng, i) => {
        const [na, cl, hco3] = [lab(rng, 'sodio'), lab(rng, 'cloro'), lab(rng, 'bicarbonato')];
        return same(i, any.anionGap(na, cl, hco3), anionGap(na, cl, hco3));
      }),
    ).toEqual([]);
  });

  it('sódio corrigido (fator 2,0), inclusive glicemia ≤ 100', () => {
    expect(
      collect((rng, i) => {
        const [na, glucose] = [lab(rng, 'sodio'), lab(rng, 'glicemia')];
        return same(i, any.sodioCorrigido(na, glucose), correctedSodium(na, glucose));
      }),
    ).toEqual([]);
  });

  it('osmolalidade efetiva', () => {
    expect(
      collect((rng, i) => {
        const [na, glucose] = [lab(rng, 'sodio'), lab(rng, 'glicemia')];
        return same(i, any.osmolaridadeEfetiva(na, glucose), effectiveOsmolality(na, glucose));
      }),
    ).toEqual([]);
  });

  it('água corporal total e déficit de água livre', () => {
    expect(
      collect((rng, i) => {
        const kg = weight(rng);
        const sex = rng.pick<Sex>(['M', 'F']);
        const elderly = rng.next() < 0.5;
        const naCorr = any.sodioCorrigido(lab(rng, 'sodio'), lab(rng, 'glicemia'));
        return same(
          i,
          [any.aguaCorporalTotal(kg, sex, elderly), any.deficitAguaLivre(kg, sex, elderly, naCorr)],
          [totalBodyWater(kg, sex, elderly), freeWaterDeficit(kg, sex, elderly, naCorr)],
        );
      }),
    ).toEqual([]);
  });

  it('déficit de volume no EHH', () => {
    expect(
      collect((rng, i) => {
        const kg = weight(rng);
        return same(i, any.deficitVolumeEHH(kg), hhsVolumeDeficit(kg));
      }),
    ).toEqual([]);
  });

  it('preparo de KCl', () => {
    expect(
      collect((rng, i) => {
        const presentation = rng.pick(KCL_PRESENTATIONS);
        const route = rng.pick(KCL_ROUTES);
        const mEq = rng.onGrid(1, 200, 0.1);
        const rate = rng.next() < 0.1 ? 0 : rng.onGrid(1, 40, 0.5);
        const volume = rng.next() < 0.4 ? undefined : rng.integer(50, 3000);
        const ref = any.preparoKcl(
          mEq,
          presentation.mEqPerAmpoule,
          presentation.mlPerAmpoule,
          route.maxMEqPerLiter,
          rate,
          volume,
        );
        const port = kclPreparation(
          mEq,
          presentation.mEqPerAmpoule,
          presentation.mlPerAmpoule,
          route.maxMEqPerLiter,
          rate,
          volume,
        );
        return same(
          i,
          [
            ref.volumeKcl,
            ref.volumeMinimo,
            ref.velocidadeMlH,
            ref.excedeLimite,
            ref.concentracaoResultante,
          ],
          [
            port.kclVolumeMl,
            port.minimumVolumeMl,
            port.rateMlPerHour,
            port.exceedsLimit,
            port.resultingConcentration,
          ],
        );
      }),
    ).toEqual([]);
  });

  it('velocidade da insulina e transição para a subcutânea', () => {
    expect(
      collect((rng, i) => {
        const kg = weight(rng);
        const rate = rng.pick(INSULIN_RATES);
        const risk = rng.next() < 0.5;
        const ref = any.transicaoInsulina(kg, risk);
        const port = subcutaneousTransition(kg, risk);
        return same(
          i,
          [any.insulinaVelocidade(kg, rate), ref.ddtMin, ref.ddtMax, ref.basalMin, ref.basalMax],
          [
            insulinRate(kg, rate),
            port.totalDailyMin,
            port.totalDailyMax,
            port.basalMin,
            port.basalMax,
          ],
        );
      }),
    ).toEqual([]);
  });

  it('queda da glicemia por hora', () => {
    expect(
      collect((rng, i) => {
        const [current, previous] = [lab(rng, 'glicemia'), lab(rng, 'glicemia')];
        const minutes = rng.integer(-5, 360);
        const ref = any.quedaGlicemia(current, previous, minutes);
        const port = glucoseFall(current, previous, minutes);
        return same(
          i,
          ref && [ref.porHora, ref.absoluta, ref.horas, ref.leitura, ref.extrapolavel],
          port && [port.perHour, port.absolute, port.hours, port.reading, port.extrapolable],
        );
      }),
    ).toEqual([]);
  });

  it('resolução da CAD', () => {
    expect(
      collect((rng, i) => {
        const ph = maybe(rng, () => lab(rng, 'phVenoso'));
        const hco3 = maybe(rng, () => lab(rng, 'bicarbonato'));
        const glucose = maybe(rng, () => lab(rng, 'glicemia'));
        const ref = any.resolvidoCAD(ph, hco3, glucose);
        return same(
          i,
          [ref.obrigatorio, ref.desejavel, ref.resolvido],
          Object.values(dkaResolution(ph, hco3, glucose)),
        );
      }),
    ).toEqual([]);
  });

  it('delta/delta', () => {
    const READING = {
      hiperclorêmica: 'hipercloremica',
      'ag-puro': 'ag-puro',
      alcalose: 'alcalose',
    };
    expect(
      collect((rng, i) => {
        const hco3 = lab(rng, 'bicarbonato');
        const ag = any.anionGap(lab(rng, 'sodio'), lab(rng, 'cloro'), hco3);
        const ref = any.deltaDelta(ag, hco3);
        const port = deltaDelta(ag, hco3);
        return same(
          i,
          ref && [ref.deltaGap, ref.razao, READING[ref.leitura as keyof typeof READING]],
          port && [port.deltaGap, port.ratio, port.reading],
        );
      }),
    ).toEqual([]);
  });
});

describe('gravidade da CAD (todas as combinações da grade)', () => {
  it('pH × bicarbonato × consciência', () => {
    const phs: (number | null)[] = [null];
    for (let ph = 650; ph <= 770; ph += 1) phs.push(ph / 100);
    const bicarbonates: (number | null)[] = [null];
    for (let hco3 = 10; hco3 <= 400; hco3 += 1) bicarbonates.push(hco3 / 10);
    const states: (Consciousness | null)[] = [null, ...CONSCIOUSNESS_OPTIONS.map(({ id }) => id)];
    const mismatches: unknown[] = [];
    for (const ph of phs) {
      for (const hco3 of bicarbonates) {
        for (const state of states) {
          const ref = any.gravidadeCAD(ph, hco3, state);
          const port = dkaSeverity(ph, hco3, state);
          if (ref !== port) mismatches.push({ ph, hco3, state, ref, port });
        }
      }
    }
    expect(mismatches.slice(0, 5)).toEqual([]);
  });
});

// ---- 2. Regras das telas do ANY ----

const EMPTY_DADOS = {
  glicemia: null,
  sodio: null,
  potassio: null,
  cloro: null,
  bicarbonato: null,
  phVenoso: null,
  ureia: null,
  cetonuria: null,
  nivelConsciencia: null,
};

type Panel = Record<LabFieldId, number | null>;

function randomPanel(rng: SeededRandom): Panel {
  return Object.fromEntries(
    LAB_FIELDS.map(({ id }) => [id, maybe(rng, () => lab(rng, id), 0.2)]),
  ) as Panel;
}

/** O mesmo painel no estado do porte (texto digitado com vírgula). */
function stateWith(panel: Panel, extra: Partial<CadEhhState> = {}): CadEhhState {
  const typedPanel = Object.fromEntries(
    Object.entries(panel).map(([id, value]) => [id, typed(value)]),
  ) as Record<LabFieldId, string>;
  return { ...INITIAL_CAD_EHH_STATE, ...extra, panel: typedPanel };
}

const track = (rng: SeededRandom) => rng.pick<CadEhhTrack>(TRACK_OPTIONS.map(({ id }) => id));

describe('trava da insulina e faixa do potássio (PassoInsulina, PassoPotassio)', () => {
  it('sem potássio a seção fica travada; abaixo de 3,5 abre bloqueada', () => {
    expect(
      collect((rng, i) => {
        const panel = randomPanel(rng);
        panel.potassio = maybe(rng, () => lab(rng, 'potassio'), 0.25);
        const kg = maybe(rng, () => weight(rng), 0.2);
        const rate = rng.pick(INSULIN_RATES);
        const trilha = track(rng);
        const render = renderKeto(
          KetoManejo.PassoInsulina,
          { dados: { ...EMPTY_DADOS, ...panel }, peso: kg, trilha },
          { PassoInsulina: [rate] },
        );
        const titles = alertCards(render).map(({ title }) => title);
        const anyGate = titles.includes('Seção travada')
          ? 'sem-potassio'
          : titles.includes('Insulina bloqueada')
            ? 'bloqueada'
            : 'liberada';
        const state = stateWith(panel, { track: trilha, insulinRate: rate });
        const guidance = panelGuidance(state, readPanel(state.panel).values, kg);
        // A velocidade desenhada pelo ANY (U/h e mL/h iguais, 1 U/mL) contra a do motor.
        let anySpeed: string | null = null;
        if (anyGate !== 'sem-potassio') {
          if (render.text.includes(MISSING.weightForInsulin)) anySpeed = 'sem peso';
          else if (kg !== null) {
            const speed = fmt(any.insulinaVelocidade(kg, rate), 1);
            anySpeed = render.text.includes(`Insulina ${speed} U/h Velocidade ${speed} mL/h`)
              ? speed
              : 'não desenhou';
          }
        }
        const portSpeed =
          guidance.insulinGate === 'sem-potassio'
            ? null
            : guidance.insulinRate === null
              ? 'sem peso'
              : insulinRateText(guidance.insulinRate).unitsPerHour.replace(' U/h', '');
        return same(i, [anyGate, anySpeed], [guidance.insulinGate, portSpeed]);
      }),
    ).toEqual([]);
  });

  it('a linha ativa da tabela do potássio e o alerta de potássio baixo', () => {
    expect(
      collect((rng, i) => {
        const k = maybe(rng, () => lab(rng, 'potassio'), 0.2);
        const render = renderKeto(KetoManejo.PassoPotassio, {
          dados: { ...EMPTY_DADOS, potassio: k },
        });
        const active = render.elements.find(({ tag, props }) => tag === 'tr' && props.style);
        const anyRange = active ? active.text.split(' ')[0] : null;
        const lowAlert = alertCards(render).some(
          ({ title }) => title === 'Potássio abaixo de 3,5 mEq/L',
        );
        const state = stateWith({ ...randomPanel(rng), potassio: k });
        const band = panelGuidance(state, readPanel(state.panel).values, null).potassiumBand;
        const portRange = band ? POTASSIUM_BANDS.find(({ id }) => id === band)?.range : null;
        return same(i, [anyRange, lowAlert], [portRange?.split(' ')[0] ?? null, band === 'baixo']);
      }),
    ).toEqual([]);
  });
});

describe('calculadora de KCl (CalculadoraKcl)', () => {
  const ANY_PRESENTATION: Record<string, string> = { '10': '10', '19.1': '19.1' };

  it('linhas da prescrição, alerta de concentração e de efeito osmótico', () => {
    expect(
      collect((rng, i) => {
        const presentation = rng.pick(KCL_PRESENTATIONS);
        const route = rng.pick(KCL_ROUTES);
        const mEq = rng.onGrid(1, 200, 0.1);
        const volume = rng.next() < 0.4 ? null : rng.integer(50, 3000);
        const rate = rng.onGrid(1, 40, 0.5);
        const render = renderKeto(
          KetoManejo.PassoPotassio,
          { dados: EMPTY_DADOS },
          {
            CalculadoraKcl: [
              ANY_PRESENTATION[presentation.id],
              route.id,
              '',
              typed(mEq),
              typed(volume),
              typed(rate),
            ],
          },
        );
        const anyLines = render.components
          .filter(({ name }) => name === 'Linha')
          .map(({ props }) => [props.rotulo, props.valor, Boolean(props.destaque)]);
        const anyAlerts = alertCards(render).map(({ title }) => title);
        const reading = readKcl({
          presentation: presentation.id,
          route: route.id,
          mlRaw: '',
          mEqRaw: typed(mEq),
          volumeRaw: typed(volume),
          rateRaw: typed(rate),
        });
        const portLines = kclPrescriptionLines(reading).map(({ label, value, alert }) => [
          label,
          value,
          alert,
        ]);
        const portAlerts = [
          reading.result?.preparation.exceedsLimit ? 'Concentração acima do limite da via' : null,
          reading.osmoticAlert ? 'Efeito osmótico do potássio' : null,
        ].filter(Boolean);
        return same(
          i,
          [anyLines, anyAlerts.filter((title) => title !== 'Antes de repor — função renal')],
          [portLines, portAlerts],
        );
      }),
    ).toEqual([]);
  });

  it('o espelho mL ↔ mEq e a troca de apresentação', () => {
    expect(
      collect((rng, i) => {
        const presentation = rng.pick(KCL_PRESENTATIONS);
        const other = KCL_PRESENTATIONS.find(({ id }) => id !== presentation.id);
        const ml = rng.onGrid(0.5, 100, 0.5);
        const mEq = rng.onGrid(1, 200, 0.1);
        const base = { CalculadoraKcl: [presentation.id, 'periferica', typed(ml)] };
        const render = renderKeto(KetoManejo.PassoPotassio, { dados: EMPTY_DADOS }, base);
        const inputs = render.elements.filter(({ tag }) => tag === 'input');
        const mlInput = inputs.find(({ props }) => props.placeholder === '15');
        const mEqInput = inputs.find(({ props }) => props.placeholder === '20');
        const otherButton = render.elements.find(
          ({ tag, text }) => tag === 'button' && text === other?.label,
        );
        if (!mlInput || !mEqInput || !otherButton || !other) throw new Error('tela mudou');
        setterCalls.length = 0;
        (mlInput.props.onChange as (event: unknown) => void)({ target: { value: typed(ml) } });
        const anyFromMl = setterCalls.find(({ index }) => index === 3)?.value;
        setterCalls.length = 0;
        (mEqInput.props.onChange as (event: unknown) => void)({ target: { value: typed(mEq) } });
        const anyFromMEq = setterCalls.find(({ index }) => index === 2)?.value;
        setterCalls.length = 0;
        (otherButton.props.onClick as () => void)();
        const anyAfterSwitch = setterCalls.find(({ index }) => index === 3)?.value;

        const start: CadEhhState = {
          ...INITIAL_CAD_EHH_STATE,
          kcl: { ...INITIAL_CAD_EHH_STATE.kcl, presentation: presentation.id },
        };
        const fromMl = cadEhhReducer(start, { type: 'kcl-ml', raw: typed(ml) });
        const fromMEq = cadEhhReducer(start, { type: 'kcl-meq', raw: typed(mEq) });
        const switched = cadEhhReducer(fromMl, { type: 'kcl-apresentacao', id: other.id });
        return same(
          i,
          [anyFromMl, anyFromMEq, anyAfterSwitch],
          [fromMl.kcl.mEqRaw, fromMEq.kcl.mlRaw, switched.kcl.mEqRaw],
        );
      }),
    ).toEqual([]);
  });
});

describe('fluidos, classificação e calculadoras (PassoFluidos, PassoClassificacao, TelaCalculadoras)', () => {
  it('fase B pelo sódio corrigido e déficit de volume no EHH', () => {
    expect(
      collect((rng, i) => {
        const panel = randomPanel(rng);
        const kg = maybe(rng, () => weight(rng), 0.2);
        const trilha = track(rng);
        const render = renderKeto(KetoManejo.PassoFluidos, {
          dados: { ...EMPTY_DADOS, ...panel },
          peso: kg,
          trilha,
          fase: 'manutencao',
        });
        const phaseB = alertCards(render).find(({ title }) => title.startsWith('Sódio corrigido'));
        const hhsVolume = render.text.match(/Para \d+ kg (\S+ a \S+ L)/)?.[1] ?? null;
        const state = stateWith(panel, { track: trilha });
        const guidance = panelGuidance(state, readPanel(state.panel).values, kg);
        const deficit = guidance.hhsVolumeDeficit;
        return same(
          i,
          [phaseB?.title ?? null, phaseB?.text ?? null, hhsVolume],
          [
            guidance.correctedNa === null
              ? null
              : `Sódio corrigido: ${formatDecimal(guidance.correctedNa, 1)} mEq/L`,
            guidance.maintenance === null ? null : MAINTENANCE_FLUID[guidance.maintenance],
            deficit
              ? `${formatDecimal(deficit.min, 1)} a ${formatDecimal(deficit.max, 1)} L`
              : null,
          ],
        );
      }),
    ).toEqual([]);
  });

  it('gravidade, disposição e o alerta de glicemia abaixo de 200', () => {
    expect(
      collect((rng, i) => {
        const panel = randomPanel(rng);
        const consciousness = maybe(rng, () => rng.pick(CONSCIOUSNESS_OPTIONS).id, 0.25);
        const dados = { ...EMPTY_DADOS, ...panel, nivelConsciencia: consciousness };
        const gravidade = any.gravidadeCAD(panel.phVenoso, panel.bicarbonato, consciousness);
        const render = renderKeto(KetoPathInternals.PassoClassificacao, {
          dados,
          trilha: 'cad',
          setTrilha: () => {},
          gravidade,
        });
        const cards = alertCards(render);
        const severityCard = cards.find(({ title }) => title.startsWith('CAD '));
        const state = stateWith(panel, { consciousness });
        const guidance = panelGuidance(state, readPanel(state.panel).values, null);
        return same(
          i,
          [
            cards.some(({ title }) => title === 'Glicemia abaixo de 200 — atenção'),
            severityCard ? [severityCard.title, severityCard.text, severityCard.type] : null,
            render.text.includes(NO_SEVERITY),
          ],
          [
            guidance.glucoseBelow200,
            guidance.severity
              ? [
                  `CAD ${guidance.severity}`,
                  DISPOSITION[guidance.severity],
                  { leve: 'success', moderada: 'warning', grave: 'danger' }[guidance.severity],
                ]
              : null,
            guidance.severity === null,
          ],
        );
      }),
    ).toEqual([]);
  });

  it('ânion-gap, sódio corrigido, osmolalidade e déficit de água na tela Calculadoras', () => {
    expect(
      collect((rng, i) => {
        const panel = randomPanel(rng);
        const kg = maybe(rng, () => weight(rng), 0.2);
        const trilha = track(rng);
        const sex = rng.pick<Sex>(['M', 'F']);
        const elderly = rng.next() < 0.5;
        const render = renderKeto(
          KetoConsulta.TelaCalculadoras,
          { dados: { ...EMPTY_DADOS, ...panel }, peso: kg, trilha },
          { TelaCalculadoras: [sex, elderly] },
        );
        const badges = render.components
          .filter(({ name }) => name === 'Collapsible')
          .map(({ props }) => [props.title, props.badge ?? null]);
        // O título do cartão do AG é o número inteiro ("27 mEq/L"); o do sódio tem vírgula.
        const agCard = alertCards(render).find(({ title }) => /^-?\d+ mEq\/L$/.test(title));
        const deficitText = render.text.match(/(-?\d+,\d) L déficit estimado/)?.[1] ?? null;

        const state = stateWith(panel, { track: trilha, sex, elderly });
        const g = panelGuidance(state, readPanel(state.panel).values, kg);
        const portBadges = [
          ['Ânion-gap', g.anionGap !== null ? `${g.anionGap} mEq/L` : null],
          ['Sódio corrigido', g.correctedNa !== null ? formatDecimal(g.correctedNa, 1) : null],
          [
            'Osmolaridade efetiva',
            g.effectiveOsmolality !== null ? `${g.effectiveOsmolality}` : null,
          ],
          ...(trilha === 'cad' ? [] : [['Déficit de água livre', 'EHH']]),
        ];
        const high = g.anionGap !== null && g.anionGap > ANION_GAP_HIGH_ABOVE;
        return same(
          i,
          [badges, agCard ? [agCard.type, agCard.text] : null, deficitText],
          [
            portBadges,
            g.anionGap === null
              ? null
              : [high ? 'warning' : 'info', high ? ANION_GAP_TEXT.high : ANION_GAP_TEXT.normal],
            g.freeWaterDeficit === null ? null : formatDecimal(g.freeWaterDeficit, 1),
          ],
        );
      }),
    ).toEqual([]);
  });
});

describe('ciclo de reavaliação (KetoCiclo)', () => {
  const NOW = Date.UTC(2026, 9, 15, 12, 0);
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  const POTASSIUM_BY_ANY_CONDUCT = new Map(
    K.POTASSIO_FAIXAS.map((band) => [band.conduta, band.id]),
  );

  function randomRound(rng: SeededRandom): Record<CycleFieldId, number | null> {
    return Object.fromEntries(
      CYCLE_FIELDS.map((id) => [id, maybe(rng, () => lab(rng, id), 0.2)]),
    ) as Record<CycleFieldId, number | null>;
  }

  it('cartões, queda por hora, resolução e transição', () => {
    expect(
      collect((rng, i) => {
        const previous = rng.next() < 0.15 ? null : randomRound(rng);
        const minutes = rng.integer(0, 300);
        const at = NOW - minutes * 60_000 - rng.integer(0, 59_999);
        const current = randomRound(rng);
        const kg = maybe(rng, () => weight(rng), 0.2);
        const trilha = track(rng);
        const risk = rng.next() < 0.5;
        const render = renderKeto(
          KetoCiclo.KetoCiclo,
          {
            peso: kg,
            trilha,
            rodada: 2,
            anterior: previous ? { ...previous, em: at } : null,
            valores: { ...current, em: NOW },
            setValores: () => {},
            fecharRodada: () => {},
          },
          { KetoCiclo: [false, 'rapido', risk] },
        );
        const cards = alertCards(render).map(({ type, title, text }) => ({
          tone: ANY_ALERT_TONE[type],
          title,
          text,
        }));

        const state: CadEhhState = {
          ...INITIAL_CAD_EHH_STATE,
          hypoglycemiaRisk: risk,
          cycle: {
            round: 2,
            previous: previous ? { values: previous, at } : null,
            current: Object.fromEntries(
              Object.entries(current).map(([id, value]) => [id, typed(value)]),
            ) as Record<CycleFieldId, string>,
          },
        };
        const reading = readCycle(state, kg, NOW);

        const anyFall = cards.find(
          ({ title }) => title.startsWith('Glicemia caiu') || title.startsWith('Glicemia subiu'),
        );
        const anyK = cards.find(({ title }) => title.startsWith('Potássio '));
        const anyKBand = anyK
          ? [...POTASSIUM_BY_ANY_CONDUCT.entries()].find(([conduct]) =>
              anyK.text.includes(conduct),
            )?.[1]
          : null;
        const anyNa = cards.find(({ title }) => title.startsWith('Sódio corrigido'));
        const anyDelta = cards.find(({ title }) => title.startsWith('Ânion-gap'));
        const below250 = cards.find(({ title }) => title === 'Glicemia abaixo de 250 mg/dL');
        const reduced = below250?.text.match(/Insulina a 0,05 U\/kg\/h = (\S+) U\/h/)?.[1] ?? null;

        const expected = {
          elapsed: previous ? render.text.includes(elapsedLabel(reading.minutes ?? -1)) : null,
          fall: anyFall ? [anyFall.tone, anyFall.title] : null,
          below250: below250 ? reduced : false,
          na: anyNa ? [anyNa.title, anyNa.text] : null,
          k: anyK ? [anyK.title, anyK.tone, anyKBand] : null,
          delta: anyDelta ? [anyDelta.title, anyDelta.tone, anyDelta.text] : null,
          resolved: cards.some(({ title }) => title === 'Critério obrigatório atendido'),
          transition: kg === null ? render.text.includes(MISSING.weightForTransition) : render.text,
        };
        const { fall, deltaDelta: dd } = reading;
        const transition = reading.transition ? transitionDoseText(reading.transition) : null;
        const received = {
          elapsed: previous ? true : null,
          fall: fall ? [FALL_TONE[fall.reading], glucoseFallTitle(fall)] : null,
          below250: reading.glucoseBelow250
            ? reading.reducedInsulinRate === null
              ? null
              : formatDecimal(reading.reducedInsulinRate, 1)
            : false,
          na:
            reading.correctedNa === null || reading.maintenance === null
              ? null
              : [
                  `Sódio corrigido ${formatDecimal(reading.correctedNa, 1)} mEq/L`,
                  MAINTENANCE_FLUID[reading.maintenance],
                ],
          k:
            reading.values.potassio === null || reading.potassiumBand === null
              ? null
              : [
                  `Potássio ${formatDecimal(reading.values.potassio, 1)} mEq/L`,
                  POTASSIUM_TONE[reading.potassiumBand],
                  reading.potassiumBand,
                ],
          delta:
            dd && reading.anionGap !== null
              ? [
                  `Ânion-gap ${reading.anionGap} · razão delta/delta ${formatDecimal(dd.ratio, 2)}`,
                  DELTA_DELTA_TONE[dd.reading],
                  anyDelta?.text.startsWith(DELTA_DELTA_TEXT[dd.reading]) &&
                  anyDelta.text.includes(`Delta gap ${formatDecimal(dd.deltaGap, 1)}`)
                    ? anyDelta.text
                    : 'texto diferente',
                ]
              : null,
          resolved: reading.resolution.resolved,
          transition:
            transition === null
              ? true
              : render.text.includes(transition.totalDaily) &&
                  render.text.includes(transition.basal)
                ? render.text
                : 'dose diferente',
        };
        return same(i, expected, received);
      }),
    ).toEqual([]);
  });
});

describe('estrutura das telas', () => {
  it('os oito passos, os cartões da tela inicial e os títulos das telas de consulta', () => {
    const anySteps = [...KetoPathInternals.FASE1, ...KetoPathInternals.FASE2].map(
      ({ id, n, titulo, sub }) => [id, n, titulo, sub],
    );
    expect(CAD_EHH_STEPS.map(({ id, n, title, subtitle }) => [id, n, title, subtitle])).toEqual(
      anySteps,
    );
    expect(
      HOME_CARDS.map(({ screen, title, subtitle, highlight }) => [
        screen === 'inicio' ? 'home' : screen,
        title,
        subtitle,
        highlight,
      ]),
    ).toEqual(
      KetoPathInternals.CARDS.map(({ id, titulo, sub, destaque }) => [
        id,
        titulo,
        sub,
        Boolean(destaque),
      ]),
    );
    expect(CONSULT_SCREEN_TITLE).toEqual(KetoPathInternals.TITULOS);
  });

  it('a planilha impressa: 19 colunas com grupo, 12 linhas e o cabeçalho', () => {
    const render = renderKeto(KetoPlanilha.KetoPlanilha, {});
    const headers = render.elements.filter(({ tag }) => tag === 'th').map(({ text }) => text);
    expect(headers).toEqual(
      WORKSHEET_COLUMNS.map(({ label, group }) => (group ? `${label} ${group}` : label)),
    );
    const bodyRows = render.elements.filter(({ tag, text }) => tag === 'tr' && text === '');
    expect(bodyRows).toHaveLength(WORKSHEET_ROWS);
    const header = render.elements
      .filter(({ tag, text }) => tag === 'span' && text.includes(':'))
      .map(({ text }) => text);
    expect(header).toEqual(WORKSHEET_HEADER_FIELDS.map((field) => field.replace(/\s+/g, ' ')));
  });
});
