import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import {
  AIRWAY_STEPS,
  CHECKLISTS,
  CRASH_ITEMS,
  CRASH_LETTERS,
  INDICATIONS,
  LEMON_ITEMS,
  POPULATIONS,
  ROMAN_ITEMS,
  STANDALONE_CHECKLISTS,
  type AirwayPopulation,
  type CormackGrade,
  type CrashLetter,
  type LemonId,
  type RomanId,
} from '../../src/shared/clinical-tools/airway/content';
import { deriveAirway } from '../../src/shared/clinical-tools/airway/derive';
import {
  laryngealMaskSize,
  laryngealTubeSize,
  suggestedTube,
  supraglotticDeviceText,
} from '../../src/shared/clinical-tools/airway/devices';
import {
  AIRWAY_DRUGS,
  formatDose,
  getAirwayDrug,
  type AirwayDrugId,
} from '../../src/shared/clinical-tools/airway/drugs';
import {
  airwayReducer,
  INITIAL_AIRWAY_STATE,
  OUTCOME_CHOICES,
  outcomeChoices,
  shockIndexOf,
  type AirwayAction,
  type AirwayOutcome,
  type AirwayState,
  type OutcomeChoice,
} from '../../src/shared/clinical-tools/airway/state';
import { buildAirwaySummary } from '../../src/shared/clinical-tools/airway/summary';
import { formatDecimal } from '../../src/shared/clinical-tools/numbers';
import type { ResultTone } from '../../src/shared/clinical-tools/tone';
import {
  anyAirwayInternals,
  AnyAirwaySession,
  findAll,
  textOf,
  type AnyElement,
  type AnyState,
} from './airway-any-runner';
import { DIFFERENTIAL_CASES, seededRandom, type SeededRandom } from './seeded-random';

/**
 * CC-315 — o roteiro de via aérea dá o mesmo resultado que a página
 * AirwayGuide congelada do ANY (tests/any-reference/AirwayGuide.tsx), rodada
 * pelo `airway-any-runner` sem React: mesmas doses, volumes, tamanhos, índice
 * de choque, H do CRASH, avisos, medicações escolhidas, desfecho e linhas do
 * relatório. Sorteios com semente fixa; escores pequenos em todas as
 * combinações.
 *
 * As poucas diferenças deliberadas (peso sem padrão de 70 kg, aviso do H
 * visível, resumo honesto) têm teste próprio no fim, para a divergência ser
 * escolha e não acidente. Estão em docs/ferramentas/revisao-clinica/via-aerea.md.
 */

const SEED = 20261015;

/** O ANY chama a cetamina de "ketamina" no id. */
const ANY_DRUG_ID: Record<AirwayDrugId, string> = {
  fentanil: 'fentanil',
  cetamina: 'ketamina',
  etomidato: 'etomidato',
  propofol: 'propofol',
  rocuronio: 'rocuronio',
  succinilcolina: 'succinilcolina',
};

const ANY_POPULATION: Record<AirwayPopulation, string> = {
  adulto: 'adulto',
  idoso: 'idoso',
  obeso: 'obeso',
  gestante: 'gestante',
};

/** Cor das classes do ANY → tom do motor (ADR-017). */
function toneOfClass(className: string): ResultTone | null {
  if (className.includes('danger')) return 'critical';
  if (className.includes('warning')) return 'attention';
  if (className.includes('success')) return 'neutral';
  return null;
}

/** Rótulos comparados sem acento: o porte corrigiu a acentuação do ANY ("limítrofe"). */
function plain(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** O ANY escreve número com ponto; o porte, com vírgula. */
function withComma(text: string): string {
  return text.replace(/(\d)\.(\d)/g, '$1,$2');
}

function apply(state: AirwayState, ...actions: AirwayAction[]): AirwayState {
  return actions.reduce(airwayReducer, state);
}

function alertTitles(session: AnyAirwaySession, step: number): string[] {
  session.goToStep(step);
  return findAll(session.render(), (element) => element.type === '@AlertCard').map((element) =>
    String(element.props.title),
  );
}

function subset<T>(random: SeededRandom, items: readonly T[]): T[] {
  return items.filter(() => random.next() < 0.5);
}

describe('teste diferencial contra o ANY — via aérea (CC-315)', () => {
  const any = anyAirwayInternals();

  describe('dados do roteiro', () => {
    it('medicações: mesmas drogas, apresentação, concentração, unidades, régua e categoria', () => {
      expect(AIRWAY_DRUGS.map(({ id }) => ANY_DRUG_ID[id])).toEqual(any.DRUGS.map(({ id }) => id));
      AIRWAY_DRUGS.forEach((drug, index) => {
        const reference = any.DRUGS[index];
        expect(reference, drug.id).toBeDefined();
        if (!reference) return;
        expect({
          name: drug.name,
          presentation: drug.presentation.replace(/–/g, '-'),
          concentration: drug.concentration,
          unit: drug.doseUnit,
          rateUnit: drug.rateUnit,
          min: drug.rate.min,
          max: drug.rate.max,
          step: drug.rate.step,
          defaultVal: drug.rate.initial,
          category: drug.category,
          hasAlert: drug.alert !== undefined,
        }).toEqual({
          name: reference.name,
          presentation: reference.presentation,
          concentration: reference.concentration,
          unit: reference.unit,
          rateUnit: reference.rateUnit,
          min: reference.min,
          max: reference.max,
          step: reference.step,
          defaultVal: reference.defaultVal,
          category: reference.category,
          hasAlert: reference.alert !== undefined,
        });
      });
    });

    it('etomidato com dose em décimos e as demais em inteiros, como calcDoseDecimal × calcDose', () => {
      for (const drug of AIRWAY_DRUGS) {
        expect(drug.doseDecimals, drug.id).toBe(drug.id === 'etomidato' ? 1 : 0);
      }
    });

    it('mesmos 11 passos, 3 indicações, letras do CRASH, LEMON, ROMAN e checklist de IOT', () => {
      expect(AIRWAY_STEPS.map(({ number, title }) => [number, title.toLowerCase()])).toEqual(
        any.PATHWAY_STEPS.map(({ number, title }) => [number, title.toLowerCase()]),
      );
      expect(INDICATIONS.map(({ title }) => title)).toEqual(
        any.INDICATION_ITEMS.map(({ title }) => title),
      );
      expect(CRASH_ITEMS.map(({ id }) => id)).toEqual(any.CRASH_ITEMS.map(({ letter }) => letter));
      CRASH_ITEMS.forEach((item, index) => {
        expect(item.suggestions.length, item.id).toBe(any.CRASH_ITEMS[index]?.recs.length);
      });
      expect(LEMON_ITEMS.map(({ id }) => id).join('')).toBe(
        any.LEMON_ITEMS.map(({ title }) => title[0]).join(''),
      );
      expect(ROMAN_ITEMS.map(({ id }) => id).join('')).toBe(
        any.ROMAN_ITEMS.map(({ title }) => title[0]).join(''),
      );
      expect(STANDALONE_CHECKLISTS.map((key) => CHECKLISTS[key].items.length)).toEqual([
        any.CHECKLIST_PACIENTE.length,
        any.CHECKLIST_EQUIP.length,
        any.CHECKLIST_EQUIPE.length,
        any.CHECKLIST_POS.length,
      ]);
    });
  });

  describe('doses por peso', () => {
    interface CardReading {
      weight: number;
      rate: number;
      dose: string;
      volume: string;
    }

    function readCard(session: AnyAirwaySession, drugId: AirwayDrugId): CardReading {
      const card = findAll(
        session.render(),
        (element) =>
          element.type === '#DoseCard' &&
          (element.props.drug as { id: string }).id === ANY_DRUG_ID[drugId],
      )[0];
      if (!card) throw new Error(`Cartão de ${drugId} ausente no ANY`);
      const span = (className: string): string => {
        const found = findAll(
          card,
          (element: AnyElement) =>
            element.type === 'span' && String(element.props.className ?? '') === className,
        )[0];
        return found ? textOf(found) : '';
      };
      return {
        weight: Number(card.props.weight),
        rate: Number(card.props.sliderValue),
        dose: span('font-bold text-white'),
        volume: span('text-text-secondary'),
      };
    }

    it(`dose, volume e régua iguais aos do cartão do ANY em ${DIFFERENTIAL_CASES} entradas`, () => {
      const random = seededRandom(SEED);
      const mismatches: unknown[] = [];
      for (let index = 0; index < DIFFERENTIAL_CASES; index += 1) {
        const weight = random.onGrid(40, 200, 0.1);
        const drug = random.pick(AIRWAY_DRUGS);
        const rate = random.onGrid(drug.rate.min, drug.rate.max, drug.rate.step);

        const session = new AnyAirwaySession();
        session.dispatch({ type: 'SET_LOCAL_WEIGHT', value: weight });
        session.dispatch({ type: 'SET_MED_SLIDER', med: ANY_DRUG_ID[drug.id], value: rate });
        // Metade no passo 8 do roteiro, metade na tela avulsa de doses.
        if (index % 2 === 0) session.goToStep(8);
        else session.dispatch({ type: 'SET_SCREEN', screen: 'doses' });
        const card = readCard(session, drug.id);

        const state = apply(INITIAL_AIRWAY_STATE, { type: 'set-drug-rate', drug: drug.id, rate });
        const derived = deriveAirway(state, String(weight).replace('.', ','));
        const view = derived.drugs.find((item) => item.drug.id === drug.id);
        const received = {
          weight: derived.weightKg,
          rate: view?.ratePerKg,
          dose: view?.dose ? formatDose(drug, view.dose.dose) : null,
          volume: view?.dose ? `= ${formatDecimal(view.dose.volumeMl, 1)} mL` : null,
        };
        const expected = {
          weight: card.weight,
          rate: card.rate,
          dose: withComma(card.dose),
          volume: withComma(card.volume),
        };
        if (JSON.stringify(received) !== JSON.stringify(expected)) {
          mismatches.push({ case: index, drug: drug.id, weight, rate, expected, received });
        }
      }
      expect(mismatches.slice(0, 5)).toEqual([]);
    });

    it('a conta é a mesma do calcDose/calcDoseDecimal/calcVolume do ANY nos casos-chave de 70 kg', () => {
      for (const drug of AIRWAY_DRUGS) {
        const view = deriveAirway(INITIAL_AIRWAY_STATE, '70').drugs.find(
          (item) => item.drug.id === drug.id,
        );
        const anyDose =
          drug.id === 'etomidato'
            ? any.calcDoseDecimal(70, drug.rate.initial)
            : any.calcDose(70, drug.rate.initial);
        expect(view?.dose?.dose, drug.id).toBe(anyDose);
        expect(formatDecimal(view?.dose?.volumeMl ?? Number.NaN, 1)).toBe(
          withComma(any.calcVolume(anyDose, drug.concentration)),
        );
      }
    });
  });

  describe('índice de choque e o H do CRASH', () => {
    interface Snapshot {
      shockIndex: number | null;
      tone: ResultTone | null;
      h: boolean;
      autoMarked: boolean;
      heartRateAlert: string | null;
      systolicAlert: string | null;
    }

    function anySnapshot(session: AnyAirwaySession, toastsBefore: number): Snapshot {
      const tree = session.render();
      const box = findAll(
        tree,
        (element) => element.type === 'div' && textOf(element).startsWith('SI = '),
      )[0];
      const alertIn = (label: string): string | null => {
        const alert = findAll(session.fieldBlock(label), (element) =>
          /bg-(danger|warning)\/20/.test(String(element.props.className ?? '')),
        )[0];
        if (!alert) return null;
        return `${plain(textOf(alert))}:${toneOfClass(String(alert.props.className))}`;
      };
      return {
        shockIndex: session.state.shockIndex,
        tone: box ? toneOfClass(String(box.props.className ?? '')) : null,
        h: session.state.crash.H,
        autoMarked: session.toasts.length > toastsBefore,
        heartRateAlert: alertIn('FC (bpm)'),
        systolicAlert: alertIn('PAS (mmHg)'),
      };
    }

    function ourSnapshot(before: AirwayState, after: AirwayState, action: AirwayAction): Snapshot {
      const view = deriveAirway(after, '');
      const typedVital = action.type === 'set-heart-rate' || action.type === 'set-systolic';
      return {
        shockIndex: view.shockIndex?.value ?? null,
        tone: view.shockIndex?.tone ?? null,
        h: after.crash.includes('H'),
        autoMarked: typedVital && !before.crash.includes('H') && after.crash.includes('H'),
        heartRateAlert: view.heartRateAlert
          ? `${plain(view.heartRateAlert.label)}:${view.heartRateAlert.tone}`
          : null,
        systolicAlert: view.systolicAlert
          ? `${plain(view.systolicAlert.label)}:${view.systolicAlert.tone}`
          : null,
      };
    }

    type VitalEvent =
      | { kind: 'fc'; value: number }
      | { kind: 'pas'; value: number }
      | { kind: 'toggle-h' };

    function play(events: readonly VitalEvent[], population: AirwayPopulation) {
      const session = new AnyAirwaySession();
      session.dispatch({ type: 'SET_POPULATION', value: ANY_POPULATION[population] });
      session.goToStep(2);
      let ours = apply(
        INITIAL_AIRWAY_STATE,
        { type: 'set-population', population },
        {
          type: 'go-to-step',
          step: 2,
        },
      );
      const steps: { event: VitalEvent; expected: Snapshot; received: Snapshot }[] = [];
      for (const event of events) {
        const toastsBefore = session.toasts.length;
        let action: AirwayAction;
        if (event.kind === 'fc') {
          session.type('FC (bpm)', String(event.value));
          action = { type: 'set-heart-rate', raw: String(event.value) };
        } else if (event.kind === 'pas') {
          session.type('PAS (mmHg)', String(event.value));
          action = { type: 'set-systolic', raw: String(event.value) };
        } else {
          session.dispatch({ type: 'TOGGLE_CRASH', letter: 'H' });
          action = { type: 'toggle-crash', letter: 'H' };
        }
        const before = ours;
        ours = airwayReducer(ours, action);
        steps.push({
          event,
          expected: anySnapshot(session, toastsBefore),
          received: ourSnapshot(before, ours, action),
        });
      }
      return { session, ours, steps };
    }

    it(`${DIFFERENTIAL_CASES} sequências de FC, PAS e H: mesmo índice, cor, H e marcação automática`, () => {
      const random = seededRandom(SEED + 1);
      const mismatches: unknown[] = [];
      for (let index = 0; index < DIFFERENTIAL_CASES; index += 1) {
        const fc = (): VitalEvent => ({ kind: 'fc', value: random.integer(30, 250) });
        const pas = (): VitalEvent => ({ kind: 'pas', value: random.integer(40, 300) });
        const events: VitalEvent[] = random.next() < 0.5 ? [fc(), pas()] : [pas(), fc()];
        if (random.next() < 0.25) events.unshift({ kind: 'toggle-h' });
        for (let extra = random.integer(0, 3); extra > 0; extra -= 1) {
          events.push(random.pick<() => VitalEvent>([fc, pas, () => ({ kind: 'toggle-h' })])());
        }
        const population = random.pick(POPULATIONS).id;
        const { session, ours, steps } = play(events, population);

        for (const step of steps) {
          if (JSON.stringify(step.expected) !== JSON.stringify(step.received)) {
            mismatches.push({ case: index, events, ...step });
          }
        }
        // Instabilidade (passo 6) e redução de dose (passo 8) a partir do mesmo estado.
        const view = deriveAirway(ours, '');
        const expected = {
          instability: alertTitles(session, 6).includes('Instabilidade hemodinâmica'),
          reduction: alertTitles(session, 8).includes('Considere redução de dose'),
        };
        const received = {
          instability: view.hemodynamicInstability,
          reduction: view.doseReduction,
        };
        if (JSON.stringify(expected) !== JSON.stringify(received)) {
          mismatches.push({ case: index, events, population, expected, received });
        }
      }
      expect(mismatches.slice(0, 5)).toEqual([]);
    });

    it('bordas: 1,0 não marca; 1,005 marca o H mas mostra 1,00; 0,7 é normal e 0,71 é atenção', () => {
      const edges: [number, number][] = [
        [100, 100],
        [201, 200],
        [101, 100],
        [70, 100],
        [71, 100],
        [250, 40],
        [30, 300],
      ];
      for (const [hr, sbp] of edges) {
        const { steps } = play(
          [
            { kind: 'fc', value: hr },
            { kind: 'pas', value: sbp },
          ],
          'adulto',
        );
        for (const step of steps) expect(step.received, `${hr}/${sbp}`).toEqual(step.expected);
      }
    });
  });

  describe('instabilidade e redução de dose', () => {
    it('todas as combinações de CRASH × população × índice de choque', () => {
      const mismatches: unknown[] = [];
      const vitals: (readonly [number, number] | null)[] = [null, [80, 120], [130, 90]];
      for (let mask = 0; mask < 2 ** CRASH_LETTERS.length; mask += 1) {
        const letters = CRASH_LETTERS.filter((_, bit) => mask & (1 << bit));
        for (const { id: population } of POPULATIONS) {
          for (const pair of vitals) {
            const session = new AnyAirwaySession();
            let ours = apply(INITIAL_AIRWAY_STATE, { type: 'set-population', population });
            session.dispatch({ type: 'SET_POPULATION', value: ANY_POPULATION[population] });
            for (const letter of letters) {
              session.dispatch({ type: 'TOGGLE_CRASH', letter });
              ours = airwayReducer(ours, { type: 'toggle-crash', letter });
            }
            if (pair) {
              session.goToStep(2);
              session.type('FC (bpm)', String(pair[0]));
              session.type('PAS (mmHg)', String(pair[1]));
              ours = apply(
                ours,
                { type: 'set-heart-rate', raw: String(pair[0]) },
                { type: 'set-systolic', raw: String(pair[1]) },
              );
            }
            const view = deriveAirway(ours, '70');
            const expected = {
              crashAlert: alertTitles(session, 2).includes('VAD Fisiológica identificada'),
              instability: alertTitles(session, 6).includes('Instabilidade hemodinâmica'),
              reduction: alertTitles(session, 8).includes('Considere redução de dose'),
              crash: CRASH_LETTERS.filter((letter) => session.state.crash[letter]),
            };
            const received = {
              crashAlert: view.crashCount > 0,
              instability: view.hemodynamicInstability,
              reduction: view.doseReduction,
              crash: [...ours.crash],
            };
            if (JSON.stringify(expected) !== JSON.stringify(received)) {
              mismatches.push({ letters, population, pair, expected, received });
            }
          }
        }
      }
      expect(mismatches.slice(0, 5)).toEqual([]);
    });
  });

  describe('VAD anatômica', () => {
    it('LEMON × ROMAN em todas as 1.024 combinações, com CRASH sorteado', () => {
      const random = seededRandom(SEED + 2);
      const mismatches: unknown[] = [];
      const lemonIds = LEMON_ITEMS.map(({ id }) => id);
      const romanIds = ROMAN_ITEMS.map(({ id }) => id);
      for (let mask = 0; mask < 2 ** 10; mask += 1) {
        const lemon = lemonIds.filter((_, bit) => mask & (1 << bit));
        const roman = romanIds.filter((_, bit) => mask & (1 << (bit + 5)));
        const crash = subset<CrashLetter>(random, CRASH_LETTERS);

        const session = new AnyAirwaySession();
        session.dispatch({ type: 'SET_VAD_OPTION', option: 'yes' });
        let ours = apply(INITIAL_AIRWAY_STATE, { type: 'set-vad-assessment', value: 'avaliar' });
        lemon.forEach((id: LemonId) => {
          session.dispatch({ type: 'TOGGLE_LEMON', index: lemonIds.indexOf(id) });
          ours = airwayReducer(ours, { type: 'toggle-lemon', id });
        });
        roman.forEach((id: RomanId) => {
          session.dispatch({ type: 'TOGGLE_ROMAN', index: romanIds.indexOf(id) });
          ours = airwayReducer(ours, { type: 'toggle-roman', id });
        });
        crash.forEach((letter) => {
          session.dispatch({ type: 'TOGGLE_CRASH', letter });
          ours = airwayReducer(ours, { type: 'toggle-crash', letter });
        });

        const view = deriveAirway(ours, '70');
        session.goToStep(3);
        const summary = findAll(
          session.render(),
          (element) =>
            element.type === '@AlertCard' && element.props.title === 'Resumo VAD Anatômica',
        )[0];
        const step5 = alertTitles(session, 5);
        const expected = {
          counts: summary ? textOf(summary.children) : null,
          difficult: step5.includes('Via aérea difícil identificada'),
          risk: step5.includes('Risco elevado identificado'),
          difficultAtProcedure: alertTitles(session, 9).includes('Via aérea difícil identificada'),
        };
        const received = {
          counts: `LEMON: ${view.lemonCount}/5 | ROMAN: ${view.romanCount}/5`,
          difficult: view.difficultAnatomy,
          risk: view.crashCount > 0 || view.difficultAnatomy,
          difficultAtProcedure: view.difficultAnatomy,
        };
        if (JSON.stringify(expected) !== JSON.stringify(received)) {
          mismatches.push({ lemon, roman, crash, expected, received });
        }
      }
      expect(mismatches.slice(0, 5)).toEqual([]);
    });
  });

  describe('tubo e dispositivos extraglóticos', () => {
    it('tubo pelo sexo', () => {
      expect(withComma(any.getTubeSize('M'))).toBe(suggestedTube('M'));
      expect(withComma(any.getTubeSize('F'))).toBe(suggestedTube('F'));
    });

    it(`máscara laríngea e tubo laríngeo em ${DIFFERENTIAL_CASES} pesos e alturas e nas bordas`, () => {
      const random = seededRandom(SEED + 3);
      const weights = [40, 49.9, 50, 69.9, 70, 200];
      const heights = [100, 154.9, 155, 179.9, 180, 250];
      for (let index = 0; index < DIFFERENTIAL_CASES; index += 1) {
        weights.push(random.onGrid(40, 200, 0.1));
        heights.push(random.onGrid(100, 250, 0.1));
      }
      for (const weight of weights) {
        expect(String(laryngealMaskSize(weight)), `peso ${weight}`).toBe(any.getDEGSize(weight));
      }
      for (const height of heights) {
        expect(String(laryngealTubeSize(height)), `altura ${height}`).toBe(any.getTLSize(height));
      }
    });

    it('texto do DEG no plano B igual ao do ANY, com e sem altura', () => {
      const random = seededRandom(SEED + 4);
      for (let index = 0; index < 200; index += 1) {
        const weight = random.onGrid(40, 200, 0.1);
        const height = random.next() < 0.5 ? null : random.integer(100, 250);
        const session = new AnyAirwaySession();
        session.dispatch({ type: 'SET_LOCAL_WEIGHT', value: weight });
        if (height !== null) session.dispatch({ type: 'SET_HEIGHT', value: height });
        session.goToStep(5);
        const item = findAll(
          session.render(),
          (element) =>
            element.type === '#SimpleCheckItem' &&
            element.props.title === 'DEG testado e lubrificado',
        )[0];
        expect(supraglotticDeviceText(weight, height), `${weight} kg, ${height} cm`).toBe(
          item?.props.desc,
        );
      }
    });
  });

  describe('medicações escolhidas', () => {
    it(`${DIFFERENTIAL_CASES} sequências de toques nos cartões: um indutor, um BNM, fentanil opcional`, () => {
      const random = seededRandom(SEED + 5);
      const mismatches: unknown[] = [];
      for (let index = 0; index < DIFFERENTIAL_CASES; index += 1) {
        const session = new AnyAirwaySession();
        session.dispatch({ type: 'SET_LOCAL_WEIGHT', value: 70 });
        session.goToStep(8);
        let ours = INITIAL_AIRWAY_STATE;
        const taps = Array.from(
          { length: random.integer(1, 12) },
          () => random.pick(AIRWAY_DRUGS).id,
        );
        for (const drug of taps) {
          const card = findAll(
            session.render(),
            (element) =>
              element.type === '#DoseCard' &&
              (element.props.drug as { id: string }).id === ANY_DRUG_ID[drug],
          )[0];
          if (!card) throw new Error(`Cartão de ${drug} ausente no ANY`);
          // O toque no cartão chama o `onToggle` que a página passou ao DoseCard.
          session.invoke(card, 'onToggle');
          ours = airwayReducer(ours, { type: 'toggle-drug', drug });
        }
        const expected = AIRWAY_DRUGS.filter(({ id }) => session.state.meds[ANY_DRUG_ID[id]]).map(
          ({ id }) => id,
        );
        if (JSON.stringify(expected) !== JSON.stringify(ours.drugs)) {
          mismatches.push({ case: index, taps, expected, received: ours.drugs });
        }
      }
      expect(mismatches.slice(0, 5)).toEqual([]);
    });
  });

  describe('desfecho: "Intubou? Não" leva ao resgate e ao plano C', () => {
    const LABEL_TO_CHOICE = new Map<string, OutcomeChoice>(
      (Object.keys(OUTCOME_CHOICES) as OutcomeChoice[]).map((choice) => [
        OUTCOME_CHOICES[choice].label,
        choice,
      ]),
    );
    const NAVIGATION = new Set(['← Voltar', 'Finalizar →']);

    function anyOutcome(state: AnyState): AirwayOutcome {
      if (state.intubationSuccess === null) return { status: 'pendente' };
      if (state.intubationSuccess === false) return { status: 'falhou', planC: state.showPlanC };
      if (state.rescueMethod === null) return { status: 'intubado' };
      return {
        status: 'resgatado',
        method: state.rescueMethod === 'DEG' ? 'deg' : 'cricotireoidostomia',
      };
    }

    function visibleChoices(session: AnyAirwaySession, outcome: AirwayOutcome): string[] {
      return session
        .buttonLabels('@Button')
        .filter((label) => !NAVIGATION.has(label))
        .filter(
          // Com o plano C aberto, o "Falhou — Plano C" do ANY não faz nada: o porte tira o botão.
          (label) =>
            !(label === 'Falhou — Plano C' && outcome.status === 'falhou' && outcome.planC),
        );
    }

    it(`${DIFFERENTIAL_CASES} caminhos de cliques no passo 10: mesmos botões e mesmo desfecho`, () => {
      const random = seededRandom(SEED + 6);
      const mismatches: unknown[] = [];
      for (let index = 0; index < DIFFERENTIAL_CASES; index += 1) {
        const session = new AnyAirwaySession();
        session.goToStep(10);
        let ours = INITIAL_AIRWAY_STATE;
        const path: string[] = [];
        for (let click = 0; click < 6; click += 1) {
          const anyLabels = visibleChoices(session, anyOutcome(session.state));
          const ourLabels = outcomeChoices(ours.outcome).map(
            (choice) => OUTCOME_CHOICES[choice].label,
          );
          if (JSON.stringify(anyLabels) !== JSON.stringify(ourLabels)) {
            mismatches.push({ case: index, path, expected: anyLabels, received: ourLabels });
            break;
          }
          if (anyLabels.length === 0) break;
          const label = random.pick(anyLabels);
          path.push(label);
          session.click(label);
          const choice = LABEL_TO_CHOICE.get(label) as OutcomeChoice;
          ours = airwayReducer(ours, OUTCOME_CHOICES[choice].action);
          const expected = anyOutcome(session.state);
          if (JSON.stringify(expected) !== JSON.stringify(ours.outcome)) {
            mismatches.push({ case: index, path, expected, received: ours.outcome });
            break;
          }
        }
      }
      expect(mismatches.slice(0, 5)).toEqual([]);
    });

    it('Não → plano B → falhou → plano C → cricotireoidostomia', () => {
      const session = new AnyAirwaySession();
      session.goToStep(10);
      let ours = INITIAL_AIRWAY_STATE;
      for (const label of ['Não', 'Falhou — Plano C', 'Via aérea estabelecida']) {
        session.click(label);
        const choice = LABEL_TO_CHOICE.get(label) as OutcomeChoice;
        ours = airwayReducer(ours, OUTCOME_CHOICES[choice].action);
        expect(ours.outcome).toEqual(anyOutcome(session.state));
      }
      expect(ours.outcome).toEqual({ status: 'resgatado', method: 'cricotireoidostomia' });
    });
  });

  describe('resumo para o prontuário', () => {
    interface ReportFields {
      meds: string[];
      tube: string;
      cormack: string | null;
      crash: string;
      lemonRoman: string | null;
      shockIndex: string | null;
      weight: string;
      depth: string | null;
      cuff: string | null;
    }

    function field(text: string, pattern: RegExp): string | null {
      return text.match(pattern)?.[1] ?? null;
    }

    function anyReport(report: string): ReportFields {
      const meds = report.split('MEDICAÇÕES:\n')[1]?.split('\n\n')[0]?.split('\n') ?? [];
      return {
        meds: meds.filter((line) => line !== 'Nenhuma selecionada').map(withComma),
        tube: withComma(field(report, /Tubo: ([^\n]+)/) ?? ''),
        cormack: field(report, /Cormack-Lehane: (\w+)/),
        crash: field(report, /(CRASH: [^\n]+)/) ?? '',
        lemonRoman: field(report, /(LEMON: \d\/5 \| ROMAN: \d\/5)/),
        shockIndex: withComma(field(report, /Shock Index: ([\d.]+)/) ?? '') || null,
        weight: withComma(field(report, /Peso: ([^ ]+) kg/) ?? ''),
        depth: field(report, /Profundidade: (\d+) cm/),
        cuff: field(report, /Cuff: (\d+) cmH2O/),
      };
    }

    function ourReport(state: AirwayState, weightRaw: string): ReportFields {
      const sections = new Map(
        buildAirwaySummary(state, weightRaw).map((section) => [section.id, section.lines]),
      );
      const line = (id: Parameters<typeof sections.get>[0]): string =>
        (sections.get(id) ?? []).join(' ');
      return {
        meds: (sections.get('medicacoes') ?? [])
          .filter((item) => item !== 'Nenhuma selecionada')
          .map((item) => item.split(';')[0] ?? item),
        tube: field(line('procedimento'), /Tubo: ([^|]+?)(?: \||$)/) ?? '',
        cormack: field(line('procedimento'), /Cormack-Lehane: (\w+)/),
        crash: field(line('avaliacao'), /(CRASH: [^|]+?)(?: \||$)/) ?? '',
        lemonRoman: field(line('avaliacao'), /(LEMON: \d\/5 \| ROMAN: \d\/5)/),
        shockIndex: field(line('avaliacao'), /Índice de choque: ([\d,]+)/),
        weight: field(line('paciente'), /Peso: ([^ ]+) kg/) ?? '',
        depth: field(line('procedimento'), /Profundidade: (\d+) cm/),
        cuff: field(line('procedimento'), /Cuff: (\d+) cmH2O/),
      };
    }

    it('200 roteiros sorteados: mesmas doses, tubo, Cormack, CRASH, LEMON/ROMAN, índice e peso', () => {
      const random = seededRandom(SEED + 7);
      const mismatches: unknown[] = [];
      for (let index = 0; index < 200; index += 1) {
        const session = new AnyAirwaySession();
        let ours = INITIAL_AIRWAY_STATE;
        const both = (
          anyAction: Record<string, unknown> & { type: string },
          ourAction: AirwayAction,
        ) => {
          session.dispatch(anyAction);
          ours = airwayReducer(ours, ourAction);
        };

        for (const letter of subset<CrashLetter>(random, CRASH_LETTERS)) {
          both({ type: 'TOGGLE_CRASH', letter }, { type: 'toggle-crash', letter });
        }
        if (random.next() < 0.5) {
          const hr = random.integer(30, 250);
          const sbp = random.integer(40, 300);
          session.goToStep(2);
          session.type('FC (bpm)', String(hr));
          session.type('PAS (mmHg)', String(sbp));
          ours = apply(
            ours,
            { type: 'set-heart-rate', raw: String(hr) },
            { type: 'set-systolic', raw: String(sbp) },
          );
        }
        if (random.next() < 0.7) {
          both(
            { type: 'SET_VAD_OPTION', option: 'yes' },
            { type: 'set-vad-assessment', value: 'avaliar' },
          );
          LEMON_ITEMS.forEach(({ id }, position) => {
            if (random.next() < 0.3)
              both({ type: 'TOGGLE_LEMON', index: position }, { type: 'toggle-lemon', id });
          });
          ROMAN_ITEMS.forEach(({ id }, position) => {
            if (random.next() < 0.3)
              both({ type: 'TOGGLE_ROMAN', index: position }, { type: 'toggle-roman', id });
          });
        } else {
          both(
            { type: 'SET_VAD_OPTION', option: 'no' },
            { type: 'set-vad-assessment', value: 'sem-avaliar' },
          );
        }

        const weight = random.onGrid(40, 200, 0.1);
        session.dispatch({ type: 'SET_LOCAL_WEIGHT', value: weight });
        const sex = random.pick(['M', 'F'] as const);
        both({ type: 'SET_SEX', value: sex }, { type: 'set-sex', sex });
        const population = random.pick(POPULATIONS).id;
        both(
          { type: 'SET_POPULATION', value: ANY_POPULATION[population] },
          { type: 'set-population', population },
        );

        for (let tap = random.integer(0, 6); tap > 0; tap -= 1) {
          const drug = random.pick(AIRWAY_DRUGS).id;
          both({ type: 'TOGGLE_MED', med: ANY_DRUG_ID[drug] }, { type: 'toggle-drug', drug });
        }
        for (const drug of AIRWAY_DRUGS) {
          if (random.next() < 0.5) continue;
          const rate = random.onGrid(drug.rate.min, drug.rate.max, drug.rate.step);
          both(
            { type: 'SET_MED_SLIDER', med: ANY_DRUG_ID[drug.id], value: rate },
            { type: 'set-drug-rate', drug: drug.id, rate },
          );
        }

        if (random.next() < 0.7) {
          const grade = random.pick<CormackGrade>(['I', 'II', 'III', 'IV']);
          both({ type: 'SET_CORMACK', grade }, { type: 'set-cormack', grade });
        }
        if (random.next() < 0.6) {
          const depth = String(random.integer(18, 28));
          const cuff = String(random.integer(15, 40));
          both({ type: 'SET_DEPTH', value: depth }, { type: 'set-depth', raw: depth });
          both({ type: 'SET_CUFF', value: cuff }, { type: 'set-cuff', raw: cuff });
        }

        session.goToStep(11);
        session.click('Copiar relatório');
        const expected = anyReport(session.clipboard ?? '');
        const received = ourReport(ours, String(weight).replace('.', ','));
        if (JSON.stringify(expected) !== JSON.stringify(received)) {
          mismatches.push({ case: index, expected, received });
        }
      }
      expect(mismatches.slice(0, 5)).toEqual([]);
    });
  });

  describe('diferenças deliberadas (registradas na revisão clínica)', () => {
    it('sem peso, o ANY calcula as doses para 70 kg; o porte não calcula', () => {
      const session = new AnyAirwaySession();
      session.goToStep(8);
      const card = findAll(session.render(), (element) => element.type === '#DoseCard')[0];
      expect(card?.props.weight).toBe(70);

      const view = deriveAirway(INITIAL_AIRWAY_STATE, '');
      expect(view.drugs.every(({ dose }) => dose === null)).toBe(true);
    });

    it('o ANY registra o aviso do H num toast que a página nunca desenha; o porte mostra o aviso', () => {
      const source = readFileSync(
        join(process.cwd(), 'tests/any-reference/AirwayGuide.tsx'),
        'utf-8',
      );
      expect(source).not.toContain('ToastContainer');

      const session = new AnyAirwaySession();
      session.goToStep(2);
      session.type('FC (bpm)', '130');
      session.type('PAS (mmHg)', '100');
      expect(session.toasts.map(({ message }) => message)).toEqual([
        'H (Hipotensão) marcado automaticamente — Shock Index > 1.0',
      ]);

      const ours = apply(
        INITIAL_AIRWAY_STATE,
        { type: 'set-heart-rate', raw: '130' },
        { type: 'set-systolic', raw: '100' },
      );
      expect(deriveAirway(ours, '').hAutoNotice).toMatchObject({
        title: 'H (hipotensão) marcado automaticamente',
        lines: ['Índice de choque 1,30, acima de 1,0.'],
      });
    });

    it('apagar a FC deixa o índice velho no ANY; no porte o índice some com o campo', () => {
      const session = new AnyAirwaySession();
      session.goToStep(2);
      session.type('FC (bpm)', '80');
      session.type('PAS (mmHg)', '120');
      session.type('FC (bpm)', '');
      expect(session.state.shockIndex).toBe(0.67);

      const ours = apply(
        INITIAL_AIRWAY_STATE,
        { type: 'set-heart-rate', raw: '80' },
        { type: 'set-systolic', raw: '120' },
        { type: 'set-heart-rate', raw: '' },
      );
      expect(shockIndexOf(ours)).toBeNull();
    });

    it('sem sexo informado, o relatório do ANY diz "Feminino"; o porte diz "--"', () => {
      const session = new AnyAirwaySession();
      session.goToStep(11);
      session.click('Copiar relatório');
      expect(session.clipboard).toContain('Sexo: Feminino');

      const patient = buildAirwaySummary(INITIAL_AIRWAY_STATE, '').find(
        ({ id }) => id === 'paciente',
      );
      expect(patient?.lines[0]).toContain('Sexo: --');
    });

    it('o ANY escreve "Capnografia + Ausculta + POCUS" mesmo sem desfecho; o porte só o que foi marcado', () => {
      const session = new AnyAirwaySession();
      session.goToStep(11);
      session.click('Copiar relatório');
      expect(session.clipboard).toContain('Capnografia + Ausculta + POCUS');

      const summary = buildAirwaySummary(INITIAL_AIRWAY_STATE, '');
      expect(summary.find(({ id }) => id === 'desfecho')?.lines).toEqual(['Não registrado']);
      expect(summary.find(({ id }) => id === 'confirmacao')?.lines).toEqual(['Não registrada']);
    });

    it('a dose não muda com instabilidade ou idade, no ANY e no porte; o porte mostra a faixa reduzida', () => {
      const session = new AnyAirwaySession();
      session.dispatch({ type: 'SET_LOCAL_WEIGHT', value: 80 });
      session.dispatch({ type: 'SET_POPULATION', value: 'idoso' });
      session.goToStep(8);
      const etomidate = findAll(
        session.render(),
        (element) =>
          element.type === '#DoseCard' && (element.props.drug as { id: string }).id === 'etomidato',
      )[0];
      expect(etomidate && textOf(etomidate)).toContain('24 mg');

      const ours = apply(INITIAL_AIRWAY_STATE, { type: 'set-population', population: 'idoso' });
      const view = deriveAirway(ours, '80').drugs.find(({ drug }) => drug.id === 'etomidato');
      expect(view?.dose?.dose).toBe(24);
      expect(view?.reduced).toMatchObject({ from: { dose: 12 }, to: { dose: 16.8 } });
      expect(getAirwayDrug('etomidato').doseDecimals).toBe(1);
    });
  });
});
