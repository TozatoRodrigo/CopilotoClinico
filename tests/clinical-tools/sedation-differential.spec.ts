import { describe, expect, it } from 'vitest';
import {
  COMBATIVE,
  DURING,
  IV_PREPARATION,
  KETAMINE_CALCULATOR,
  KETOFOL_SCREEN,
  LOW_COOPERATION,
  RED_FLAG_IDS,
  SCREEN_INFO,
  SEDATION_CHECK_IDS,
  SEDATION_CHECKLISTS,
  SEDATION_CHOICES,
  URGENT_IM,
  type CombativeRegimen,
  type RedFlagId,
  type SedationCheckId,
  type SedationChoiceId,
  type SedationNotice,
  type SedationNoticeTone,
  type SedationScreen,
  type UrgentImDrug,
} from '../../src/shared/clinical-tools/sedation/content';
import {
  deriveSedation,
  type SedationBlock,
} from '../../src/shared/clinical-tools/sedation/derive';
import {
  ketamineImTexts,
  ketofolEachText,
  ketofolVolumeText,
  medicationDoseLine,
  regimenTitle,
  REGIMENS,
} from '../../src/shared/clinical-tools/sedation/doses';
import {
  currentScreen,
  INITIAL_SEDATION_STATE,
  isKetofolReduced,
  sedationReducer,
  type SedationAction,
  type SedationState,
} from '../../src/shared/clinical-tools/sedation/state';
import type { ResultTone } from '../../src/shared/clinical-tools/tone';
import { AnySedaPage, anySedaInternals, type AnyScreen } from './sedation-any-harness';
import { anyText, normalizeText, regimenCardStrings } from './sedation-content-walk';
import {
  advance,
  answerRecentSedation,
  BACK,
  choose,
  combative,
  nextButton,
  replay,
  urgentIm,
  type Step,
} from './sedation-steps';
import { DIFFERENTIAL_CASES, seededRandom } from './seeded-random';

/**
 * CC-328 — o roteiro de sedação dá o mesmo resultado que a página SedaPath
 * congelada do ANY (tests/any-reference/SedaPath.tsx), rodada pelo
 * `sedation-any-harness` sem React: mesma tela, trilha, opções (com o tom),
 * medicações com via e dose, quadros de regime, avisos, pergunta das 4 h e
 * doses por peso. Todos os caminhos de grau de colaboração × urgência ×
 * acesso IV × sedação recente × medicação; doses em 1.000 pesos e 1.000
 * sequências de toques, com semente fixa.
 *
 * As diferenças deliberadas (Voltar, pergunta das 4 h única, faixa de peso,
 * peso comum às telas) têm teste próprio no fim, para a divergência ser
 * escolha e não acidente. Estão em docs/ferramentas/revisao-clinica/sedacao.md.
 */

const SEED = 20261015;

const SCREEN_OF_ANY: Record<AnyScreen, SedationScreen> = {
  triagem: 'triagem',
  colaborativo: 'colaborativo',
  'sem-sedação': 'sem-sedacao',
  'sedação-vo': 'sedacao-vo',
  'pouco-colaborativo': 'pouco-colaborativo',
  'urgencia-alta-pc': 'urgente',
  'escolha-im-urgente': 'im-urgente',
  'urgencia-baixa': 'nao-urgente',
  'nao-colaborativo': 'combativo',
  'preparo-iv': 'preparo-iv',
  ketofol: 'cetofol',
  durante: 'durante',
  pos: 'pos',
};

/** Itens de checklist do ANY sem acento ("alta-náusea" → "alta-nausea"). */
function checkIdOfAny(id: string): SedationCheckId {
  const plain = id.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const found = SEDATION_CHECK_IDS.find((checkId) => checkId === plain);
  if (!found) throw new Error(`Item de checklist do ANY sem par no porte: ${id}`);
  return found;
}

const RED_FLAG_OF_ANY: Record<string, RedFlagId> = {
  'rf-trauma': 'trauma',
  'rf-vad': 'via-aerea-dificil',
  'rf-hemo': 'instabilidade',
  'rf-jejum': 'jejum',
};

const ANY_URGENT_DRUG: Record<UrgentImDrug, string> = {
  cetamina: 'ketamina',
  midazolam: 'midazolam',
};

const ANY_COMBATIVE: Record<CombativeRegimen, string> = {
  cetamina: 'ketamina',
  'midazolam-haloperidol-prometazina': 'mida-hf',
};

/** Cor do cartão de opção do ANY → tom do motor (ADR-017); azul era a cor de destaque. */
const COLOR_TONE: Record<string, ResultTone | null> = {
  green: 'neutral',
  yellow: 'attention',
  red: 'critical',
  blue: null,
};

const ALERT_TONE: Record<string, SedationNoticeTone> = {
  info: 'info',
  warning: 'attention',
  danger: 'critical',
  success: 'neutral',
};

// ---- Fotografia comparável de uma tela --------------------------------------

interface Snapshot {
  screen: SedationScreen;
  trail: string[];
  choices: { title: string; tone: ResultTone | null }[];
  meds: {
    title: string;
    dose: string;
    timing: string;
    preferIf: string | null;
    selected: boolean;
  }[];
  regimens: string[][];
  alerts: { tone: SedationNoticeTone; title: string; text: string }[];
  /** Resposta mostrada na pergunta das 4 h ("sim"/"nao"), quando ela está na tela. */
  recentSedation: string | null;
  results: { label: string; value: string }[];
  next: string | null;
}

function anySnapshot(page: AnySedaPage): Snapshot {
  const next = nextButton(page);
  return {
    screen: SCREEN_OF_ANY[page.state.screen],
    trail: page.trail().map(normalizeText),
    choices: page.optionCards().map(({ title, color }) => ({
      title: anyText(title),
      tone: COLOR_TONE[color] ?? null,
    })),
    meds: page.medOptions().map((option) => ({
      title: anyText(option.title),
      dose: anyText(option.dose),
      timing: anyText(option.indication),
      preferIf: option.extra === null ? null : anyText(option.extra),
      selected: option.selected,
    })),
    regimens: page.regimenBoxes().map((lines) => lines.map(anyText)),
    alerts: page.alerts().map(({ type, title, text }) => ({
      tone: ALERT_TONE[type] ?? 'info',
      title: anyText(title),
      text: anyText(text),
    })),
    recentSedation: page.toggleValue(),
    results: page.resultRows().map(({ label, value }) => ({
      label: anyText(label),
      value: anyText(value),
    })),
    next: next === null ? null : anyText(next),
  };
}

/** Avisos que no ANY são caixas coloridas próprias, e não `AlertCard`. */
const NOT_ALERT_CARD: ReadonlySet<SedationNotice> = new Set<SedationNotice>([
  LOW_COOPERATION.deescalation,
  COMBATIVE.risk,
  IV_PREPARATION.environment,
]);

function alertOf(notice: SedationNotice): Snapshot['alerts'][number] {
  return {
    tone: notice.tone,
    title: normalizeText(notice.title),
    text: normalizeText(notice.lines.join('')),
  };
}

function portAlerts(block: SedationBlock): Snapshot['alerts'] {
  switch (block.kind) {
    case 'notice':
      return NOT_ALERT_CARD.has(block.notice) ? [] : [alertOf(block.notice)];
    case 'checklist': {
      const checklist = SEDATION_CHECKLISTS[block.id];
      return 'notice' in checklist ? [alertOf(checklist.notice)] : [];
    }
    case 'ketofol-doses':
      // No ANY a base da dose só aparece junto do resultado (peso digitado).
      return block.doses ? [alertOf(block.basis)] : [];
    case 'complications':
      return DURING.complications.map(alertOf);
    default:
      return [];
  }
}

function portResults(block: SedationBlock): Snapshot['results'] {
  const row = (label: string, value: string) => ({
    label: normalizeText(label),
    value: normalizeText(value),
  });
  if (block.kind === 'ketamine-calculator' && block.dose) {
    const texts = ketamineImTexts(block.dose);
    return [
      row(KETAMINE_CALCULATOR.doseLabel, texts.dose),
      row(KETAMINE_CALCULATOR.volumeLabel, texts.volume),
    ];
  }
  if (block.kind === 'ketofol-doses' && block.doses) {
    const { induction, maintenance } = block.doses;
    return [
      row(KETOFOL_SCREEN.inductionDoseLabel, ketofolEachText(induction)),
      row(KETOFOL_SCREEN.inductionVolumeLabel, ketofolVolumeText(induction)),
      row(KETOFOL_SCREEN.maintenanceDoseLabel, ketofolEachText(maintenance)),
      row(KETOFOL_SCREEN.maintenanceVolumeLabel, ketofolVolumeText(maintenance)),
    ];
  }
  return [];
}

function portSnapshot(state: SedationState, weightRaw: string): Snapshot {
  const view = deriveSedation(state, weightRaw);
  const { blocks } = view;
  return {
    screen: view.screen,
    trail: view.path.map((screen) => normalizeText(SCREEN_INFO[screen].trail)),
    choices: blocks.flatMap((block) =>
      block.kind === 'choices'
        ? block.choices.map((id) => ({
            title: normalizeText(SEDATION_CHOICES[id].title),
            tone: SEDATION_CHOICES[id].tone,
          }))
        : [],
    ),
    meds: blocks.flatMap((block) =>
      block.kind === 'urgent-im' || block.kind === 'combative'
        ? block.options.map((option) => {
            const regimen = REGIMENS[option.regimen];
            return {
              title: normalizeText(regimenTitle(regimen)),
              dose: normalizeText(medicationDoseLine(regimen)),
              timing: normalizeText(option.timing),
              preferIf: option.preferIf ? normalizeText(option.preferIf) : null,
              selected: option.id === block.selected,
            };
          })
        : [],
    ),
    regimens: blocks.flatMap((block) =>
      block.kind === 'regimen' ? [regimenCardStrings(block.card).map(normalizeText)] : [],
    ),
    alerts: blocks.flatMap(portAlerts),
    recentSedation: blocks.reduce<string | null>(
      (value, block) => (block.kind === 'recent-sedation' ? (block.answer ? 'sim' : 'nao') : value),
      null,
    ),
    results: blocks.flatMap(portResults),
    next: view.next ? normalizeText(view.next.label) : null,
  };
}

/**
 * Decisões completas de cada tela, para percorrer todo o roteiro: a resposta
 * das 4 h entra junto da escolha seguinte, e a medicação junto do avanço.
 */
function decisions(state: SedationState): Step[][] {
  const view = deriveSedation(state, '');
  const choices = view.blocks.flatMap((block) => (block.kind === 'choices' ? block.choices : []));
  switch (view.screen) {
    case 'pouco-colaborativo':
      return [false, true].flatMap((answer) =>
        (['urgente', 'nao-urgente'] as const).map((choice) => [
          ...(answer ? [answerRecentSedation(true)] : []),
          choose(choice),
        ]),
      );
    case 'preparo-iv':
      return state.oralSedationFailed
        ? [[advance('Calcular cetofol')]]
        : [false, true].map((answer) => [
            answerRecentSedation(answer),
            advance('Calcular cetofol'),
          ]);
    case 'im-urgente':
      return URGENT_IM.options.map(({ id }) => [urgentIm(id), advance('Durante sedação')]);
    case 'combativo':
      return COMBATIVE.options.flatMap(({ id }) =>
        (['contencao-suficiente', 'sedacao-iv-adicional'] as const).map((choice) => [
          combative(id),
          choose(choice),
        ]),
      );
    default:
      if (choices.length > 0) return choices.map((choice) => [choose(choice)]);
      return view.next ? [[advance(view.next.label)]] : [];
  }
}

/** Todos os caminhos da triagem até uma tela final. */
function allPaths(): (readonly Step[])[] {
  const paths: (readonly Step[])[] = [];
  const walk = (steps: readonly Step[]) => {
    const options = decisions(replay(steps).state);
    if (options.length === 0) {
      paths.push(steps);
      return;
    }
    for (const decision of options) walk([...steps, ...decision]);
  };
  walk([]);
  return paths;
}

/** Pesos conferidos em toda tela com conta: limites da faixa adulta e alguns no meio. */
const PATH_WEIGHTS = ['40', '55,5', '70', '72,3', '123,4', '200'];

/** O ANY lê o peso com `parseFloat`: ponto decimal. */
function anyWeight(raw: string): string {
  return raw.replace(',', '.');
}

function onlyNamed(snapshot: Snapshot, keys: readonly (keyof Snapshot)[]): Partial<Snapshot> {
  return Object.fromEntries(keys.map((key) => [key, snapshot[key]]));
}

describe('teste diferencial contra o ANY — sedação (CC-328)', () => {
  const any = anySedaInternals();

  describe('dados do roteiro', () => {
    it('mesmas 13 telas, com o rótulo da trilha do ANY', () => {
      const anyScreens = Object.keys(any.BREADCRUMB_LABELS) as AnyScreen[];
      expect(anyScreens.map((screen) => SCREEN_OF_ANY[screen])).toEqual(Object.keys(SCREEN_INFO));
      for (const screen of anyScreens) {
        expect(normalizeText(SCREEN_INFO[SCREEN_OF_ANY[screen]].trail), screen).toBe(
          anyText(any.BREADCRUMB_LABELS[screen]),
        );
      }
    });

    it('começa como o ANY: triagem, sem sedação recente, nada escolhido nem marcado', () => {
      const initial = any.INITIAL_STATE;
      expect({
        path: initial.history.map((screen) => SCREEN_OF_ANY[screen]),
        recentSedation: initial.sedaçãoPrevia || initial.sedaçãoPreviaPc,
        oralSedationFailed: initial.sedaçãoPreviaVO,
        urgentImDrug: initial.medUrgente,
        combativeRegimen: initial.medCombativo,
      }).toEqual({
        path: INITIAL_SEDATION_STATE.path,
        recentSedation: INITIAL_SEDATION_STATE.recentSedation,
        oralSedationFailed: INITIAL_SEDATION_STATE.oralSedationFailed,
        urgentImDrug: INITIAL_SEDATION_STATE.urgentImDrug,
        combativeRegimen: INITIAL_SEDATION_STATE.combativeRegimen,
      });
    });
  });

  describe('via e dose em todos os caminhos', () => {
    const paths = allPaths();

    it('percorre os 23 caminhos: 3 do colaborativo, 14 do pouco colaborativo e 6 do combativo', () => {
      const byCooperation = paths.reduce<Record<string, number>>((count, steps) => {
        const cooperation = replay(steps).state.path[1] ?? 'triagem';
        return { ...count, [cooperation]: (count[cooperation] ?? 0) + 1 };
      }, {});
      expect(byCooperation).toEqual({ colaborativo: 3, 'pouco-colaborativo': 14, combativo: 6 });
    });

    it('cobre grau de colaboração × urgência × acesso IV × sedação recente × medicação', () => {
      const combos = new Set(
        paths.map((steps) => {
          const { state } = replay(steps);
          return [
            state.path[1],
            state.path.includes('urgente')
              ? 'urgente'
              : state.path.includes('nao-urgente')
                ? 'nao-urgente'
                : '-',
            state.path.includes('preparo-iv')
              ? 'iv'
              : state.path.includes('im-urgente')
                ? 'im'
                : '-',
            isKetofolReduced(state) ? 'sedado' : 'sem-sedacao',
            state.urgentImDrug ?? state.combativeRegimen ?? '-',
          ].join(' | ');
        }),
      );
      for (const recent of ['sedado', 'sem-sedacao']) {
        expect(combos).toContain(`pouco-colaborativo | urgente | iv | ${recent} | -`);
        expect(combos).toContain(`pouco-colaborativo | nao-urgente | iv | ${recent} | -`);
        for (const drug of ['cetamina', 'midazolam']) {
          expect(combos).toContain(`pouco-colaborativo | urgente | im | ${recent} | ${drug}`);
        }
        for (const regimen of ['cetamina', 'midazolam-haloperidol-prometazina']) {
          expect(combos).toContain(`combativo | - | iv | ${recent} | ${regimen}`);
        }
      }
      expect(combos).toContain('colaborativo | - | iv | sedado | -');
    });

    it('a cada passo: mesma tela, trilha, opções, medicações, regimes, avisos e pergunta das 4 h', () => {
      const mismatches: unknown[] = [];
      for (const steps of paths) {
        for (let length = 0; length <= steps.length; length += 1) {
          const { page, state } = replay(steps.slice(0, length));
          const expected = anySnapshot(page);
          const received = portSnapshot(state, '');
          if (JSON.stringify(received) !== JSON.stringify(expected)) {
            mismatches.push({
              steps: steps.slice(0, length).map(({ label }) => label),
              expected,
              received,
            });
          }
        }
      }
      expect(mismatches.slice(0, 3)).toEqual([]);
    });

    it('a cada tela com conta: as doses e a base da dose batem nos pesos de referência', () => {
      const mismatches: unknown[] = [];
      let screensWithWeight = 0;
      for (const steps of paths) {
        for (let length = 0; length <= steps.length; length += 1) {
          const prefix = steps.slice(0, length);
          if (!replay(prefix).page.hasWeightInput()) continue;
          screensWithWeight += 1;
          for (const weight of PATH_WEIGHTS) {
            const { page, state } = replay(prefix);
            page.typeWeight(anyWeight(weight));
            const expected = anySnapshot(page);
            const received = portSnapshot(state, weight);
            if (JSON.stringify(received) !== JSON.stringify(expected)) {
              mismatches.push({
                steps: prefix.map(({ label }) => label),
                weight,
                expected,
                received,
              });
            }
          }
        }
      }
      expect(screensWithWeight).toBeGreaterThan(0);
      expect(mismatches.slice(0, 3)).toEqual([]);
    });
  });

  describe('doses por peso', () => {
    /** Telas do ANY já posicionadas em cada conta. */
    function ketamineUrgent(): { page: AnySedaPage; state: SedationState } {
      return replay([
        choose('pouco-colaborativo'),
        choose('urgente'),
        choose('sem-acesso-iv'),
        urgentIm('cetamina'),
      ]);
    }
    function ketamineCombative(): { page: AnySedaPage; state: SedationState } {
      return replay([choose('combativo'), combative('cetamina')]);
    }
    function ketofol(reduced: boolean): { page: AnySedaPage; state: SedationState } {
      return replay([
        choose('pouco-colaborativo'),
        ...(reduced ? [answerRecentSedation(true)] : []),
        choose('urgente'),
        choose('com-acesso-iv'),
        advance('Calcular cetofol'),
      ]);
    }

    it.each([
      ['cetamina IM no urgente sem acesso IV', ketamineUrgent],
      ['cetamina IM no combativo', ketamineCombative],
      ['cetofol com dose padrão', () => ketofol(false)],
      ['cetofol com dose reduzida (sedação nas últimas 4 h)', () => ketofol(true)],
    ] as const)(
      `%s: dose e volume iguais aos do ANY em ${DIFFERENTIAL_CASES} pesos`,
      (_name, open) => {
        const random = seededRandom(SEED);
        const { page, state } = open();
        const mismatches: unknown[] = [];
        for (let index = 0; index < DIFFERENTIAL_CASES; index += 1) {
          const weight = random.onGrid(40, 200, 0.1);
          page.typeWeight(String(weight));
          const expected = anySnapshot(page);
          const received = portSnapshot(state, String(weight).replace('.', ','));
          const pick = (snapshot: Snapshot) => onlyNamed(snapshot, ['results', 'alerts']);
          if (JSON.stringify(pick(received)) !== JSON.stringify(pick(expected))) {
            mismatches.push({
              case: index,
              weight,
              expected: pick(expected),
              received: pick(received),
            });
          }
          expect(expected.results.length).toBeGreaterThan(0);
        }
        expect(mismatches.slice(0, 5)).toEqual([]);
      },
    );
  });

  describe(`${DIFFERENTIAL_CASES} sequências de toques`, () => {
    type Move = { label: string; port: SedationAction | null; any: (page: AnySedaPage) => void };

    /** Tudo o que dá para tocar na tela do ANY agora, com o equivalente no porte. */
    function movesOn(page: AnySedaPage): Move[] {
      const screen = SCREEN_OF_ANY[page.state.screen];
      const moves: Move[] = [];
      for (const card of page.optionCards()) {
        const id = (Object.keys(SEDATION_CHOICES) as SedationChoiceId[]).find(
          (choice) => normalizeText(SEDATION_CHOICES[choice].title) === anyText(card.title),
        );
        if (!id) throw new Error(`Opção do ANY sem par: ${card.title}`);
        moves.push({
          label: `opção ${id}`,
          port: { type: 'choose', choice: id },
          any: (p) => p.chooseOption(card.title),
        });
      }
      for (const med of page.medOptions()) {
        if (screen === 'im-urgente') {
          const drug = (Object.keys(ANY_URGENT_DRUG) as UrgentImDrug[]).find(
            (key) =>
              anyText(
                regimenTitle(REGIMENS[URGENT_IM.options.find(({ id }) => id === key)!.regimen]),
              ) === anyText(med.title),
          );
          if (!drug) throw new Error(med.title);
          moves.push({
            label: `IM ${drug}`,
            port: { type: 'choose-urgent-im', drug },
            any: (p) => p.chooseMed(med.title),
          });
        } else {
          const regimen = (Object.keys(ANY_COMBATIVE) as CombativeRegimen[]).find(
            (key) =>
              anyText(
                regimenTitle(REGIMENS[COMBATIVE.options.find(({ id }) => id === key)!.regimen]),
              ) === anyText(med.title),
          );
          if (!regimen) throw new Error(med.title);
          moves.push({
            label: `contenção ${regimen}`,
            port: { type: 'choose-combative-regimen', regimen },
            any: (p) => p.chooseMed(med.title),
          });
        }
      }
      if (page.toggleValue() !== null) {
        for (const value of [true, false]) {
          moves.push({
            label: `4 h ${value ? 'sim' : 'não'}`,
            port: { type: 'set-recent-sedation', value },
            any: (p) => p.setToggle(value ? 'sim' : 'nao'),
          });
        }
      }
      const next = nextButton(page);
      if (next)
        moves.push({ label: 'avançar', port: { type: 'advance' }, any: (p) => p.click(next) });
      // "Voltar" do cetofol e do pós-sedação diverge de propósito (teste no fim).
      if (page.buttonLabels().includes('← Voltar') && screen !== 'cetofol' && screen !== 'pos') {
        moves.push(BACK);
      }
      if (page.buttonLabels().includes('Novo paciente')) {
        moves.push({
          label: 'novo paciente',
          port: { type: 'reset' },
          any: (p) => p.click('Novo paciente'),
        });
      }
      moves.push({ label: 'reiniciar fluxo', port: { type: 'reset' }, any: (p) => p.restart() });
      for (const item of page.checklistItems()) {
        const id = checkIdOfAny(item.id);
        moves.push({
          label: `check ${id}`,
          port: { type: 'toggle-check', id },
          any: (p) => p.toggleCheck(item.id),
        });
      }
      for (const flag of page.redFlags()) {
        const id = RED_FLAG_OF_ANY[flag.id];
        if (!id) throw new Error(flag.id);
        moves.push({
          label: `red flag ${id}`,
          port: { type: 'toggle-red-flag', id },
          any: (p) => p.toggleRedFlag(flag.id),
        });
      }
      return moves;
    }

    function anyChecked(page: AnySedaPage): SedationCheckId[] {
      const { state } = page;
      const groups = [
        state.posImChecks,
        state.urgBaixaChecks,
        state.posCombativoChecks,
        state.materialChecks,
        state.equipeChecks,
        state.altaChecks,
        state.contençãoChecks,
      ];
      const marked = new Set(
        groups.flatMap((group) =>
          Object.entries(group).flatMap(([id, on]) => (on ? [checkIdOfAny(id)] : [])),
        ),
      );
      return SEDATION_CHECK_IDS.filter((id) => marked.has(id));
    }

    function anyRedFlags(page: AnySedaPage): RedFlagId[] {
      const marked = new Set(
        Object.entries(page.state.redflags).flatMap(([id, on]) => {
          const flag = RED_FLAG_OF_ANY[id];
          return on && flag ? [flag] : [];
        }),
      );
      return RED_FLAG_IDS.filter((id) => marked.has(id));
    }

    it('mesmo estado e mesma tela a cada toque (cetofol pela metade, marcações e escolhas)', () => {
      const random = seededRandom(SEED);
      const mismatches: unknown[] = [];
      let staleLowCooperationAnswer = 0;
      for (let walk = 0; walk < DIFFERENTIAL_CASES && mismatches.length === 0; walk += 1) {
        const page = new AnySedaPage();
        let state = INITIAL_SEDATION_STATE;
        let lastAnswerAt: SedationScreen | null = null;
        const labels: string[] = [];
        const steps = random.integer(1, 30);
        for (let step = 0; step < steps; step += 1) {
          const move = random.pick(movesOn(page));
          labels.push(move.label);
          const screenBefore = currentScreen(state);
          move.any(page);
          if (move.port) state = sedationReducer(state, move.port);
          if (move.port?.type === 'set-recent-sedation') lastAnswerAt = screenBefore;
          if (move.port?.type === 'reset') lastAnswerAt = null;

          const expected = anySnapshot(page);
          const received = portSnapshot(state, '');
          // Deliberado: a resposta das 4 h dada no preparo IV vale também no pouco
          // colaborativo; o ANY mostrava lá a resposta antiga.
          const stale = received.screen === 'pouco-colaborativo' && lastAnswerAt === 'preparo-iv';
          if (stale) staleLowCooperationAnswer += 1;
          const keys: (keyof Snapshot)[] = stale
            ? ['screen', 'trail', 'choices', 'meds', 'next']
            : [
                'screen',
                'trail',
                'choices',
                'meds',
                'regimens',
                'alerts',
                'recentSedation',
                'next',
              ];
          const sameScreen =
            JSON.stringify(onlyNamed(received, keys)) === JSON.stringify(onlyNamed(expected, keys));
          const sameState =
            isKetofolReduced(state) === (page.state.sedaçãoPrevia || page.state.sedaçãoPreviaVO) &&
            state.oralSedationFailed === page.state.sedaçãoPreviaVO &&
            (state.urgentImDrug === null
              ? page.state.medUrgente === null
              : ANY_URGENT_DRUG[state.urgentImDrug] === page.state.medUrgente) &&
            (state.combativeRegimen === null
              ? page.state.medCombativo === null
              : ANY_COMBATIVE[state.combativeRegimen] === page.state.medCombativo) &&
            JSON.stringify(state.checked) === JSON.stringify(anyChecked(page)) &&
            JSON.stringify(state.redFlags) === JSON.stringify(anyRedFlags(page));
          if (!sameScreen || !sameState) {
            mismatches.push({
              walk,
              labels,
              expected: onlyNamed(expected, keys),
              received: onlyNamed(received, keys),
              state,
              any: page.state,
            });
            break;
          }
        }
      }
      expect(mismatches).toEqual([]);
      // Os sorteios passam pela divergência deliberada (e só ela foi tolerada).
      expect(staleLowCooperationAnswer).toBeGreaterThan(0);
      // ~1,5 s sozinho; folga para a suíte inteira rodando em paralelo no CI.
    }, 20_000);
  });

  describe('diferenças deliberadas (docs/ferramentas/revisao-clinica/sedacao.md)', () => {
    const toKetofol = [
      choose('pouco-colaborativo'),
      choose('urgente'),
      choose('com-acesso-iv'),
      advance('Calcular cetofol'),
    ];

    it('"Voltar" duas vezes do cetofol sai do preparo IV; no ANY voltava para o cetofol', () => {
      const { page, state } = replay(toKetofol);
      page.click('← Voltar');
      page.click('← Voltar');
      expect(page.state.screen).toBe('ketofol');

      const back = sedationReducer(sedationReducer(state, { type: 'back' }), { type: 'back' });
      expect(currentScreen(back)).toBe('urgente');
    });

    it('"Voltar" do pós-sedação do combativo contido volta ao combativo; no ANY abria "Durante"', () => {
      const { page, state } = replay([
        choose('combativo'),
        combative('midazolam-haloperidol-prometazina'),
        choose('contencao-suficiente'),
      ]);
      page.click('← Voltar');
      expect(page.state.screen).toBe('durante');

      expect(currentScreen(sedationReducer(state, { type: 'back' }))).toBe('combativo');
    });

    it('a pergunta das 4 h é uma só: a resposta do preparo IV aparece no pouco colaborativo', () => {
      const { page, state } = replay([
        choose('pouco-colaborativo'),
        answerRecentSedation(true),
        choose('urgente'),
        choose('com-acesso-iv'),
        answerRecentSedation(false),
        BACK,
        BACK,
      ]);
      // ANY: o pouco colaborativo ainda mostra "Sim", mas o cetofol já usaria a dose cheia.
      expect(page.toggleValue()).toBe('sim');
      expect(page.state.sedaçãoPrevia).toBe(false);
      // Porte: uma resposta só, e a dose do cetofol é a mesma do ANY.
      expect(portSnapshot(state, '').recentSedation).toBe('nao');
      expect(isKetofolReduced(state)).toBe(page.state.sedaçãoPrevia || page.state.sedaçãoPreviaVO);
    });

    it('peso fora da faixa adulta (40–200 kg) não calcula; o ANY calculava qualquer peso positivo', () => {
      for (const weight of ['30', '250']) {
        const { page, state } = replay([choose('combativo'), combative('cetamina')]);
        page.typeWeight(weight);
        expect(page.resultRows()).not.toEqual([]);
        expect(portSnapshot(state, weight).results).toEqual([]);
        expect(deriveSedation(state, weight).weight.ok).toBe(false);
      }
    });

    it('o peso é o mesmo em todas as telas; no ANY o cetofol pedia o peso de novo', () => {
      const steps = [
        choose('combativo'),
        combative('cetamina'),
        choose('sedacao-iv-adicional'),
        advance('Calcular cetofol'),
      ];
      const { page, state } = replay(steps.slice(0, 2));
      page.typeWeight('80');
      for (const step of steps.slice(2)) step.any(page);
      expect(page.resultRows()).toEqual([]);

      const atKetofol = steps
        .slice(2)
        .reduce((current, step) => sedationReducer(current, step.port), state);
      expect(portSnapshot(atKetofol, '80').results.length).toBe(4);
    });
  });
});
