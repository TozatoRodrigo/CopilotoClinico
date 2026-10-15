import { describe, expect, it } from 'vitest';
import { calcDengueHydration } from '../any-reference/calculations';
import { classifyDengue } from '../../src/shared/clinical-tools/dengue/classification';
import {
  ALARM_SIGN_IDS,
  ALARM_SIGNS,
  CLASSIFICATION_REASON,
  DENGUE_GROUP_INFO,
  DENGUE_GROUPS,
  GRAVITY_SIGN_IDS,
  GRAVITY_SIGNS,
  HYDRATION_KEYS,
  RISK_CONDITION_IDS,
  RISK_CONDITIONS,
  WEIGHT_SCREENS,
  type DengueGroup,
  type DengueScreen,
} from '../../src/shared/clinical-tools/dengue/content';
import {
  evaluateHematocrit,
  HEMATOCRIT_RANGE,
} from '../../src/shared/clinical-tools/dengue/hematocrit';
import {
  albuminVials,
  dengueHydration,
  formatMilliliters,
  type DengueHydration,
} from '../../src/shared/clinical-tools/dengue/hydration';
import { buildPatientMessage } from '../../src/shared/clinical-tools/dengue/patient-message';
import {
  dengueReducer,
  INITIAL_DENGUE_STATE,
  type DengueAction,
  type DengueState,
} from '../../src/shared/clinical-tools/dengue/state';
import type { ResultTone } from '../../src/shared/clinical-tools/tone';
import {
  anyDengueInternals,
  openAnyDengue,
  textOf,
  type AnyDenguePage,
  type AnyDengueState,
  type AnyElement,
  type AnyGroup,
  type AnyNode,
  type AnyScreen,
} from './dengue-any-harness';
import { normalizeText, volumeScreenStrings, type VolumeScreen } from './dengue-content-walk';
import { DIFFERENTIAL_CASES, seededRandom } from './seeded-random';

/**
 * CC-325 — o roteiro de dengue portado dá o mesmo resultado da página do ANY
 * congelada (tests/any-reference/DenguePath.tsx), rodada de verdade pelo
 * dublê de React (dengue-any-harness.ts):
 *
 * - hidratação: 1.000 pesos, mesmos volumes sem tolerância e o mesmo número
 *   na tela de cada volume das telas que usam peso;
 * - classificação: as 65.536 combinações de sinais (8 de alarme, 3 de
 *   gravidade, 5 de risco) dão o mesmo grupo, nome e motivo;
 * - variação do Ht: 1.000 pares, mesmo valor, faixa e tom;
 * - roteiro: 1.000 sequências de toques com semente fixa, estado igual a
 *   cada passo (tela, grupo da trilha, sinais, passo da classificação
 *   direta, Ht, mensagem);
 * - mensagem de alta: igual à do ANY, menos a linha da marca.
 */

const SEED = 20261015;

const ANY_SCREEN: Record<DengueScreen, AnyScreen> = {
  inicio: 'home',
  'trilha-1': 'step1',
  'trilha-2': 'step2',
  'trilha-3': 'step3',
  'trilha-4': 'stepGrupo',
  'trilha-5': 'step5',
  grupos: 'grupos',
  classificacao: 'classificação',
  'grupo-a': 'grupoA',
  'grupo-b': 'grupoB',
  'grupo-c': 'grupoC',
  'grupo-d': 'grupoD',
  calculadoras: 'calculadoras',
  efasd: 'efasd',
  exames: 'examediff',
  alta: 'altasegura',
  referencias: 'referências',
};

/** ADR-017, "Cores": verde → neutro, amarelo → atenção, vermelhos → crítico. */
const ANY_COLOR_TONE: Record<string, ResultTone> = {
  '#4CAF50': 'neutral',
  '#FFC107': 'attention',
  '#FF5252': 'critical',
  '#F44336': 'critical',
};

function weightOnGrid(random: ReturnType<typeof seededRandom>): number {
  return random.onGrid(40, 200, 0.1);
}

const WEIGHT_EDGES = [40, 40.1, 70, 72.5, 99.9, 100, 150.3, 199.9, 200];

// ---------------------------------------------------------------------------
// Hidratação
// ---------------------------------------------------------------------------

const ANY_HYDRATION_KEY: Record<(typeof HYDRATION_KEYS)[number], string> = {
  oralTotal: 'voTotal',
  oralSro: 'voSRO',
  oralLiquids: 'voLiquidos',
  ivHourly: 'ivHora',
  iv2h: 'iv2h',
  maintenance6h: 'ivMan6',
  maintenance8h: 'ivMan8',
  bolus: 'bolus',
  albuminLow: 'alb05',
  albuminHigh: 'alb1',
};

describe('hidratação → calcDengueHydration do ANY', () => {
  const random = seededRandom(SEED);
  const weights = [
    ...WEIGHT_EDGES,
    ...Array.from({ length: DIFFERENTIAL_CASES }, () => weightOnGrid(random)),
  ];
  const { fmtInt } = anyDengueInternals();

  it('dá os mesmos volumes, sem tolerância, em 1.000 pesos e nas bordas', () => {
    const mismatches: unknown[] = [];
    for (const weight of weights) {
      const reference = calcDengueHydration(weight) as Record<string, number>;
      const ported = dengueHydration(weight);
      for (const key of HYDRATION_KEYS) {
        if (ported[key] !== reference[ANY_HYDRATION_KEY[key]]) {
          mismatches.push({
            weight,
            key,
            any: reference[ANY_HYDRATION_KEY[key]],
            ported: ported[key],
          });
        }
      }
    }
    expect(mismatches.slice(0, 5)).toEqual([]);
  });

  it('formata cada volume, vazão e frasco como o fmtInt do ANY', () => {
    const mismatches: unknown[] = [];
    for (const weight of weights) {
      const h = dengueHydration(weight);
      const pairs: [string, string][] = [
        ...HYDRATION_KEYS.map((key): [string, string] => [
          fmtInt(h[key]),
          formatMilliliters(h[key]),
        ]),
        [fmtInt(h.maintenance6h / 6), formatMilliliters(h.maintenance6h / 6)],
        [fmtInt(h.maintenance8h / 8), formatMilliliters(h.maintenance8h / 8)],
        [String(Math.ceil(h.albuminLow / 50)), String(albuminVials(h.albuminLow))],
        [String(Math.ceil(h.albuminHigh / 50)), String(albuminVials(h.albuminHigh))],
      ];
      for (const [expected, received] of pairs) {
        if (expected !== received) mismatches.push({ weight, expected, received });
      }
    }
    expect(fmtInt(null)).toBe(formatMilliliters(null));
    expect(mismatches.slice(0, 5)).toEqual([]);
  });

  it('só calcula com o peso adulto do ANY (40 a 200 kg)', () => {
    const page = openAnyDengue();
    page.setState({ screen: 'calculadoras' });
    for (const weight of [39.9, 200.1]) {
      page.setWeight(weight);
      expect(page.texts()).not.toContain(fmtInt(weight * 60));
    }
    page.setWeight(40);
    expect(page.texts()).toContain(fmtInt(40 * 60));
  });
});

/**
 * Textos da tela que mudam com o peso: os de "com peso" que não existem "sem
 * peso". Comparar só isso deixa a estrutura do JSX de fora (o ANY quebra o
 * texto em pedaços diferentes dos nossos) e pega cada número da tela.
 */
function weightTokens(withWeight: readonly string[], withoutWeight: readonly string[]): string[] {
  const tokens = (texts: readonly string[]) =>
    texts.flatMap((text) => text.match(/[\p{L}\d.,]+/gu) ?? []);
  const remaining = new Map<string, number>();
  for (const token of tokens(withoutWeight)) remaining.set(token, (remaining.get(token) ?? 0) + 1);
  const added: string[] = [];
  for (const token of tokens(withWeight)) {
    const left = remaining.get(token) ?? 0;
    if (left > 0) remaining.set(token, left - 1);
    else added.push(token);
  }
  return added.sort();
}

interface VolumeCase {
  name: string;
  any: Partial<AnyDengueState>;
  ported: VolumeScreen;
}

const VOLUME_CASES: readonly VolumeCase[] = [
  { name: 'calculadoras', any: { screen: 'calculadoras' }, ported: { screen: 'calculadoras' } },
  ...DENGUE_GROUPS.flatMap((group): VolumeCase[] => [
    {
      name: `passo 4 da trilha, Grupo ${group}`,
      any: { screen: 'stepGrupo', trilhaGrupo: group },
      ported: { screen: 'trilha-4', group },
    },
    {
      name: `manejo do Grupo ${group}`,
      any: { screen: `grupo${group}` as AnyScreen },
      ported: { screen: 'grupo', group },
    },
  ]),
];

describe('volumes na tela → mesmos números do ANY', () => {
  it.each(VOLUME_CASES.map((volumeCase) => [volumeCase.name, volumeCase] as const))(
    '%s, em 1.000 pesos',
    (_name, volumeCase) => {
      const random = seededRandom(SEED + 1);
      const page = openAnyDengue();
      page.setState(volumeCase.any);
      page.setWeight(null);
      const anyEmpty = page.texts();
      const portedEmpty = volumeScreenStrings(volumeCase.ported, null);
      const mismatches: unknown[] = [];
      const weights = [
        ...WEIGHT_EDGES,
        ...Array.from({ length: DIFFERENTIAL_CASES }, () => weightOnGrid(random)),
      ];
      for (const weight of weights) {
        page.setWeight(weight);
        const expected = weightTokens(page.texts(), anyEmpty);
        const received = weightTokens(
          volumeScreenStrings(volumeCase.ported, dengueHydration(weight)),
          portedEmpty,
        );
        if (expected.join('|') !== received.join('|')) {
          mismatches.push({ weight, expected, received });
        }
        // A tela precisa ter mostrado algum número: senão o teste não testa nada.
        if (expected.length === 0) mismatches.push({ weight, problem: 'nenhum volume na tela' });
      }
      expect(mismatches.slice(0, 3)).toEqual([]);
    },
  );
});

// ---------------------------------------------------------------------------
// Classificação
// ---------------------------------------------------------------------------

function pick<Id extends string>(ids: readonly Id[], flags: readonly boolean[]): Id[] {
  return ids.filter((_id, index) => flags[index]);
}

function bits(mask: number, offset: number, size: number): boolean[] {
  return Array.from({ length: size }, (_, index) => Boolean((mask >> (offset + index)) & 1));
}

describe('classificação → classifyNow do ANY', () => {
  const internals = anyDengueInternals();

  it('tem os mesmos sinais, na mesma ordem (a menos da acentuação)', () => {
    const same = (any: readonly string[], ported: readonly { label: string }[]) =>
      expect(ported.map(({ label }) => normalizeText(label))).toEqual(any.map(normalizeText));
    same(internals.ALARM_LABELS, ALARM_SIGNS);
    same(internals.GRAVITY_LABELS, GRAVITY_SIGNS);
    same(internals.RISK_LABELS, RISK_CONDITIONS);
  });

  it('tem os mesmos nomes de grupo, com o tom do ADR-017', () => {
    for (const group of DENGUE_GROUPS) {
      const config = internals.GRUPO_CONFIG[group];
      expect(DENGUE_GROUP_INFO[group].label).toBe(config.label);
      expect(DENGUE_GROUP_INFO[group].tone).toBe(ANY_COLOR_TONE[config.color]);
    }
  });

  it('dá o mesmo grupo e motivo nas 65.536 combinações de sinais', () => {
    const page = openAnyDengue();
    const mismatches: unknown[] = [];
    const seen = new Set<string>();
    for (let mask = 0; mask < 1 << 16; mask += 1) {
      const alarmes = bits(mask, 0, 8);
      const gravidade = bits(mask, 8, 3);
      const risco = bits(mask, 11, 5);
      page.setState({ screen: 'step3', alarmes, gravidade, risco, classResult: null });
      page.click('Classificar');
      const anyResult = page.state().classResult;
      const ported = classifyDengue({
        alarms: pick(ALARM_SIGN_IDS, alarmes),
        gravity: pick(GRAVITY_SIGN_IDS, gravidade),
        risks: pick(RISK_CONDITION_IDS, risco),
      });
      if (anyResult?.grupo !== ported.group || anyResult.desc !== ported.reason) {
        mismatches.push({ mask, any: anyResult, ported });
      }
      if (anyResult && !seen.has(anyResult.grupo)) {
        // Uma vez por grupo, confere o que a tela mostra (o resto é igual).
        seen.add(anyResult.grupo);
        const shown = normalizeText(page.texts().join(' '));
        expect(shown).toContain(normalizeText(`Grupo ${ported.group}`));
        expect(shown).toContain(normalizeText(DENGUE_GROUP_INFO[ported.group].label));
        expect(shown).toContain(normalizeText(CLASSIFICATION_REASON[ported.group]));
      }
    }
    expect(mismatches.slice(0, 3)).toEqual([]);
    expect([...seen].sort()).toEqual([...DENGUE_GROUPS]);
  });
});

// ---------------------------------------------------------------------------
// Variação do hematócrito
// ---------------------------------------------------------------------------

const HT_TEXT = /^[+-]?\d+\.\d%$/;

/** A linha colorida da interpretação (`<div className="text-sm mt-1" style={{ color }}>`). */
function findColored(nodes: AnyNode[]): { text: string; color: string } | null {
  for (const node of nodes) {
    if (typeof node === 'string') continue;
    const style = node.props.style as { color?: string } | undefined;
    if (node.props.className === 'text-sm mt-1' && style?.color) {
      return { text: textOf(node), color: style.color };
    }
    const inner = findColored(node.children);
    if (inner) return inner;
  }
  return null;
}

/** O texto e a cor da interpretação do Ht na tela de calculadoras do ANY. */
function anyHematocrit(page: AnyDenguePage, basal: string, atual: string) {
  page.setState({ screen: 'calculadoras', htBasal: basal, htAtual: atual });
  const display = page.texts().find((text) => HT_TEXT.test(text)) ?? null;
  const colored = findColored(page.render());
  return { display, interpretation: colored?.text ?? null, color: colored?.color ?? null };
}

describe('variação do Ht → calculadora do ANY', () => {
  it('dá o mesmo valor, faixa e tom em 1.000 pares e nas bordas', () => {
    const random = seededRandom(SEED + 2);
    const page = openAnyDengue();
    const edges: [number, number][] = [
      [45, 54],
      [40, 48],
      [50, 55],
      [50, 54.9],
      [50, 50],
      [50, 50.1],
      [50, 45],
      [50, 44.9],
      [10, 80],
      [80, 10],
    ];
    const pairs: [number, number][] = [
      ...edges,
      ...Array.from({ length: DIFFERENTIAL_CASES }, (): [number, number] => [
        random.onGrid(HEMATOCRIT_RANGE.min, HEMATOCRIT_RANGE.max, 0.1),
        random.onGrid(HEMATOCRIT_RANGE.min, HEMATOCRIT_RANGE.max, 0.1),
      ]),
    ];
    const mismatches: unknown[] = [];
    for (const [basal, atual] of pairs) {
      const any = anyHematocrit(page, String(basal), String(atual));
      const ported = evaluateHematocrit({ baseline: String(basal), current: String(atual) });
      if (ported.status !== 'complete') {
        mismatches.push({ basal, atual, ported });
        continue;
      }
      const expected = {
        // Vírgula decimal no Copiloto; o ANY mostrava ponto.
        display: any.display?.replace('.', ','),
        band: any.interpretation,
        tone: any.color ? ANY_COLOR_TONE[any.color] : undefined,
      };
      const received = { display: ported.display, band: ported.band.label, tone: ported.band.tone };
      if (JSON.stringify(expected) !== JSON.stringify(received)) {
        mismatches.push({ basal, atual, expected, received });
      }
    }
    expect(mismatches.slice(0, 3)).toEqual([]);
  });

  it('sem os dois valores, não calcula (como o ANY)', () => {
    const page = openAnyDengue();
    expect(anyHematocrit(page, '', '54').display).toBeNull();
    expect(evaluateHematocrit({ baseline: '', current: '54' }).status).toBe('pending');
  });
});

// ---------------------------------------------------------------------------
// Mensagem de alta
// ---------------------------------------------------------------------------

/** A última linha de assinatura do ANY leva a marca "ANY App"; no Copiloto, a do Copiloto. */
function withoutBrand(message: string): string[] {
  return message.split('\n').filter((line) => !/^_(Dengue Path|Dengue —)/.test(line));
}

describe('mensagem de alta → gerarMsgWhatsApp do ANY', () => {
  it.each([
    new Date(2026, 0, 5, 9, 3),
    new Date(2026, 9, 15, 14, 5),
    new Date(2026, 11, 31, 23, 59),
    new Date(2027, 1, 28, 0, 0),
  ])('é a mesma, menos a marca, quando emitida em %s', (now) => {
    const page = openAnyDengue();
    page.setState({ screen: 'altasegura' });
    page.setNow(now);
    page.click('Gerar orientações para WhatsApp');
    const any = page.state().wppMsg;
    const ported = buildPatientMessage({ issuedAt: now });
    expect(withoutBrand(ported)).toEqual(withoutBrand(any));
    expect(ported.split('\n')).toHaveLength(any.split('\n').length);
  });
});

// ---------------------------------------------------------------------------
// Roteiro: sequências de toques
// ---------------------------------------------------------------------------

function portedScreenOf(anyScreen: AnyScreen): DengueScreen {
  const entry = Object.entries(ANY_SCREEN).find(([, any]) => any === anyScreen);
  if (!entry) throw new Error(`Tela do ANY sem correspondente: ${anyScreen}`);
  return entry[0] as DengueScreen;
}

function directStepOf(state: AnyDengueState): 1 | 2 | 3 {
  if (state.classStep3Visible) return 3;
  return state.classStep2Visible ? 2 : 1;
}

function projectAny(state: AnyDengueState) {
  return {
    screen: portedScreenOf(state.screen),
    trailGroup: state.trilhaGrupo,
    alarms: pick(ALARM_SIGN_IDS, state.alarmes),
    gravity: pick(GRAVITY_SIGN_IDS, state.gravidade),
    risks: pick(RISK_CONDITION_IDS, state.risco),
    directStep: directStepOf(state),
    htBaseline: state.htBasal,
    htCurrent: state.htAtual,
    message: state.wppVisible ? withoutBrand(state.wppMsg) : null,
  };
}

function projectPorted(state: DengueState) {
  return {
    screen: state.screen,
    trailGroup: state.trailGroup,
    alarms: [...state.alarms],
    gravity: [...state.gravity],
    risks: [...state.risks],
    directStep: state.directStep,
    htBaseline: state.htBaseline,
    htCurrent: state.htCurrent,
    message: state.patientMessage
      ? withoutBrand(buildPatientMessage({ issuedAt: new Date(state.patientMessage.issuedAt) }))
      : null,
  };
}

/** Um toque possível na tela atual do ANY e a ação equivalente do porte. */
interface Move {
  label: string;
  any: () => void;
  ported: DengueAction[];
}

const GROUP_BY_LABEL = /Grupo ([ABCD])$/;

/**
 * Traduz um elemento clicável do ANY na ação do porte. `null` = toque que o
 * porte não modela (copiar/compartilhar a mensagem: efeito fora do estado).
 */
function portedActionFor(
  label: string,
  element: AnyElement,
  state: AnyDengueState,
  at: number,
  noIndex: number,
): DengueAction[] | null {
  const internals = anyDengueInternals();
  // Item marcado mostra "✓" antes do texto (CheckItem do ANY).
  label = label.replace(/^✓\s*/, '');
  const screen = state.screen;
  if (element.type === 'button' && internals.ALARM_LABELS.includes(label)) {
    return [{ type: 'toggle-alarm', id: ALARM_SIGN_IDS[internals.ALARM_LABELS.indexOf(label)]! }];
  }
  if (element.type === 'button' && internals.GRAVITY_LABELS.includes(label)) {
    return [
      { type: 'toggle-gravity', id: GRAVITY_SIGN_IDS[internals.GRAVITY_LABELS.indexOf(label)]! },
    ];
  }
  if (element.type === 'button' && internals.RISK_LABELS.includes(label)) {
    return [{ type: 'toggle-risk', id: RISK_CONDITION_IDS[internals.RISK_LABELS.indexOf(label)]! }];
  }
  const open = (target: DengueScreen): DengueAction[] => [{ type: 'open-screen', screen: target }];
  switch (label) {
    case 'Início':
    case '← Início':
      return open('inicio');
    case 'Próximo →':
      if (screen === 'step1') return open('trilha-2');
      if (screen === 'step2') return open('trilha-3');
      return open('trilha-5');
    case '← Voltar':
      if (screen === 'step2') return open('trilha-1');
      if (screen === 'step3') return open('trilha-2');
      if (screen === 'stepGrupo') return open('trilha-3');
      return open('trilha-4');
    case 'Classificar':
      return [];
    case 'Reavaliar classificação':
      return [{ type: 'reassess' }];
    case 'Ver orientações completas para alta segura →':
    case 'Orientações de alta completas →':
    case 'Gerar orientações para WhatsApp →':
      return open('alta');
    case 'Gerar orientações para WhatsApp':
      return [{ type: 'generate-patient-message', at }];
    case 'Copiar mensagem':
    case 'Enviar no WhatsApp':
      return null;
    case 'Sim → Grupo D':
      return [{ type: 'answer-direct', step: 1, present: true, at }];
    case 'Sim → Grupo C':
      return [{ type: 'answer-direct', step: 2, present: true, at }];
    case 'Sim → Grupo B':
      return [{ type: 'answer-direct', step: 3, present: true, at }];
    case 'Não → Grupo A':
      return [{ type: 'answer-direct', step: 3, present: false, at }];
    case 'Não → Próximo':
      return [{ type: 'answer-direct', step: noIndex === 0 ? 1 : 2, present: false, at }];
  }
  if (label.startsWith('Ver manejo do Grupo')) return [{ type: 'open-trail-group', at }];
  if (label.startsWith('Dengue Path')) return open('trilha-1');
  if (screen === 'home') {
    const target = HOME_TARGETS.find(([prefix]) => label.startsWith(prefix));
    if (target) return open(target[1]);
  }
  if (screen === 'grupos') {
    const group = label.match(/^Grupo ([ABCD])/)?.[1] as DengueGroup | undefined;
    if (group) return open(`grupo-${group.toLowerCase()}` as DengueScreen);
  }
  const reclassTo = label.match(GROUP_BY_LABEL)?.[1] as DengueGroup | undefined;
  if (reclassTo && /^grupo[ABCD]$/.test(screen)) return [{ type: 'reclassify', to: reclassTo, at }];
  throw new Error(`Toque do ANY sem ação no porte: "${label}" em ${screen}`);
}

const HOME_TARGETS: readonly [string, DengueScreen][] = [
  ['Manejo por grupos', 'grupos'],
  ['Calculadoras', 'calculadoras'],
  ['Protocolo E-FASD', 'efasd'],
  ['Exames e diag. diferenciais', 'exames'],
  ['Classificação direta', 'classificacao'],
  ['Alta segura', 'alta'],
  ['Referências', 'referencias'],
];

const FAB_TARGETS: Record<string, DengueScreen> = {
  Início: 'inicio',
  Trilha: 'trilha-1',
  Grupos: 'grupos',
  Calculadoras: 'calculadoras',
  Exames: 'exames',
  'Alta segura': 'alta',
};

function fabItems(nodes: AnyNode[]): { label: string; onClick: () => void }[] {
  for (const node of nodes) {
    if (typeof node === 'string') continue;
    if (node.type === '@FABMenu')
      return node.props.items as { label: string; onClick: () => void }[];
    const inner = fabItems(node.children);
    if (inner.length > 0) return inner;
  }
  return [];
}

function htInputs(nodes: AnyNode[]): AnyElement[] {
  return nodes.flatMap((node) => {
    if (typeof node === 'string') return [];
    if (node.type === 'input') return [node];
    return htInputs(node.children);
  });
}

describe('roteiro → estado do DenguePath do ANY', () => {
  it('fica igual ao ANY a cada toque, em 1.000 sequências', () => {
    const random = seededRandom(SEED + 3);
    const failures: unknown[] = [];
    const HT_VALUES = ['', '40', '45', '48', '52,5', '38.4'];
    // Cobertura: as sequências precisam passar por todas as telas e ações.
    const screens = new Set<string>();
    const actions = new Set<string>();
    let moveCount = 0;

    for (let sequence = 0; sequence < DIFFERENTIAL_CASES && failures.length === 0; sequence += 1) {
      const page = openAnyDengue();
      let ported: DengueState = INITIAL_DENGUE_STATE;
      // O resultado do ANY fica guardado até o próximo "Classificar"; o porte é ao vivo.
      let freshResult = false;
      const length = random.integer(5, 40);
      const trail: string[] = [];

      for (let step = 0; step < length; step += 1) {
        const anyState = page.state();
        const at = Date.UTC(2026, 9, 15, 12, 0) + (sequence * 100 + step) * 60_000;
        page.setNow(new Date(at));
        const tree = page.render();
        let noIndex = 0;
        const moves: Move[] = [];
        for (const clickable of page.clickables()) {
          const index = clickable.label === 'Não → Próximo' ? noIndex++ : 0;
          const actions = portedActionFor(clickable.label, clickable.element, anyState, at, index);
          if (actions) moves.push({ label: clickable.label, any: clickable.run, ported: actions });
        }
        for (const item of fabItems(tree)) {
          moves.push({
            label: `menu: ${item.label}`,
            any: item.onClick,
            ported: [{ type: 'open-screen', screen: FAB_TARGETS[item.label]! }],
          });
        }
        if (anyState.screen === 'calculadoras') {
          htInputs(tree).forEach((input, index) => {
            const value = random.pick(HT_VALUES);
            moves.push({
              label: `Ht ${index === 0 ? 'basal' : 'atual'} = ${value}`,
              any: () => (input.props.onChange as (e: unknown) => void)({ target: { value } }),
              ported: [{ type: index === 0 ? 'set-ht-baseline' : 'set-ht-current', raw: value }],
            });
          });
        }

        // Diferenças deliberadas (state.ts): o porte não apaga marcação ao navegar
        // e o "Ver manejo" usa a classificação ao vivo. Esses toques só entram quando
        // os dois lados chegam ao mesmo estado; os casos que divergem têm teste próprio.
        const allowed = moves.filter((move) => {
          const opens = move.ported.find((action) => action.type === 'open-screen');
          if (opens?.type === 'open-screen' && opens.screen === 'trilha-1') {
            return ported.alarms.length === 0;
          }
          if (opens?.type === 'open-screen' && opens.screen === 'trilha-3') {
            return ported.gravity.length === 0 && ported.risks.length === 0;
          }
          if (move.label.startsWith('Ver manejo do Grupo')) return freshResult;
          return true;
        });
        if (allowed.length === 0) break;
        // Pesos para a sequência andar pelo roteiro: o menu (6 atalhos sempre
        // presentes) sai em 1 de 10 toques, e marcar sinal em metade dos demais —
        // senão quase nenhuma sequência chegaria à classificação e à alta.
        const menu = allowed.filter((candidate) => candidate.label.startsWith('menu: '));
        const onPage = allowed.filter((candidate) => !candidate.label.startsWith('menu: '));
        const navigation = onPage.filter(
          (candidate) => !candidate.ported.some((action) => action.type.startsWith('toggle-')),
        );
        const roll = random.next();
        const pool =
          menu.length > 0 && (roll < 0.1 || onPage.length === 0)
            ? menu
            : navigation.length > 0 && roll < 0.55
              ? navigation
              : onPage;
        const move = random.pick(pool);
        trail.push(move.label);

        move.any();
        page.render();
        ported = move.ported.reduce(dengueReducer, ported);
        moveCount += 1;
        screens.add(ported.screen);
        move.ported.forEach((action) => actions.add(action.type));

        if (move.label === 'Classificar') freshResult = true;
        if (
          move.label === 'Reavaliar classificação' ||
          move.ported.some((action) => action.type.startsWith('toggle-')) ||
          (move.ported[0]?.type === 'open-screen' && move.ported[0].screen === 'trilha-3')
        ) {
          freshResult = false;
        }

        const expected = projectAny(page.state());
        const received = projectPorted(ported);
        if (JSON.stringify(expected) !== JSON.stringify(received)) {
          failures.push({ sequence, trail, expected, received });
          break;
        }
        const classResult = page.state().classResult;
        if (move.label === 'Classificar' && classResult?.grupo !== classifyDengue(ported).group) {
          failures.push({ sequence, trail, any: classResult, ported: classifyDengue(ported) });
          break;
        }
      }
    }
    expect(failures).toEqual([]);
    expect(moveCount).toBeGreaterThan(10_000);
    expect([...screens].sort()).toEqual(Object.keys(ANY_SCREEN).sort());
    expect([...actions].sort()).toEqual(
      [
        'answer-direct',
        'generate-patient-message',
        'open-screen',
        'open-trail-group',
        'reassess',
        'reclassify',
        'set-ht-baseline',
        'set-ht-current',
        'toggle-alarm',
        'toggle-gravity',
        'toggle-risk',
      ].sort(),
    );
  });

  it('mostra o peso nas mesmas telas do ANY', () => {
    const { SCREENS_WITH_WEIGHT } = anyDengueInternals();
    expect([...WEIGHT_SCREENS].map((screen) => ANY_SCREEN[screen]).sort()).toEqual(
      [...SCREENS_WITH_WEIGHT].sort(),
    );
  });
});

describe('roteiro → diferenças deliberadas em relação ao ANY', () => {
  it('voltar ao passo 1 apaga os alarmes no ANY; no porte, só "Novo paciente" apaga', () => {
    const page = openAnyDengue();
    page.setState({ screen: 'step2' });
    page.click(ALARM_SIGNS[0].label);
    page.click('← Voltar');
    expect(page.state().alarmes.some(Boolean)).toBe(false);

    let ported = dengueReducer(
      { ...INITIAL_DENGUE_STATE, screen: 'trilha-2' },
      { type: 'toggle-alarm', id: 'dor-abdominal' },
    );
    ported = dengueReducer(ported, { type: 'open-screen', screen: 'trilha-1' });
    expect(ported.alarms).toEqual(['dor-abdominal']);
    expect(dengueReducer(ported, { type: 'reset' }).alarms).toEqual([]);
  });

  it('marcar gravidade depois de "Classificar" deixa o ANY no grupo antigo; o porte acompanha', () => {
    const page = openAnyDengue();
    page.setState({ screen: 'step3' });
    page.click('Classificar');
    page.click(GRAVITY_SIGNS[0].label);
    expect(page.state().classResult?.grupo).toBe<AnyGroup>('A');

    const ported = dengueReducer(
      { ...INITIAL_DENGUE_STATE, screen: 'trilha-3' },
      { type: 'toggle-gravity', id: 'choque' },
    );
    expect(classifyDengue(ported).group).toBe('D');
  });
});
