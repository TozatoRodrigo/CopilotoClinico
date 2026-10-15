import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import * as anyTox from '../any-reference/toxData';
import { formatDecimal } from '../../src/shared/clinical-tools/numbers';
import {
  assessToxicDose,
  formatIngestedDose,
  searchToxicDoses,
  toxicDoseBandText,
  toxicDosePercentText,
  type ToxicDoseAssessment,
} from '../../src/shared/clinical-tools/toxicology/toxic-dose';
import {
  TOXIC_DOSES,
  type ToxicDoseEntry,
} from '../../src/shared/clinical-tools/toxicology/toxic-doses';
import {
  createHeadlessReact,
  findAll,
  loadFrozenModule,
  textOf,
  valueNextTo,
  type HeadlessNode,
} from './any-component-harness';
import { DIFFERENTIAL_CASES, seededRandom, type SeededRandom } from './seeded-random';

/**
 * CC-324 — tabela de doses tóxicas contra o ANY congelado:
 *
 * - as 242 entradas e a conta (`calculateDose`) do Tox Path legado
 *   (tests/any-reference/tox-path-legacy.html), cujo script roda aqui com um
 *   `document` de mentira;
 * - as 74 entradas do v2 (`toxData.ts`) e a aba "Doses tóxicas" do
 *   `ToxPath.tsx`, rodada sem React, para a conta e a busca.
 *
 * Diferença deliberada: a busca do Copiloto ignora acento e põe primeiro o
 * nome que começa com o texto; o teste exige que ela ache tudo o que o ANY
 * achava.
 */

const SEED = 20261024;
const MARKER = '// ---- início do arquivo original ----\n';

interface LegacyDrug {
  nome: string;
  alias?: string[];
  dose: number;
  unidade: string;
  meiaVida: string;
  retardada?: boolean;
}

function legacySource(): string {
  const content = readFileSync(
    join(process.cwd(), 'tests/any-reference/tox-path-legacy.html'),
    'utf-8',
  );
  const original = content.split(MARKER)[1];
  if (!original) throw new Error('tox-path-legacy.html sem o marcador do original');
  return original;
}

function slice(source: string, from: string, to: string): string {
  const start = source.indexOf(from);
  const end = source.indexOf(to, start + from.length);
  if (start < 0 || end < 0) throw new Error(`trecho do legado não encontrado: ${from} … ${to}`);
  return source.slice(start, end);
}

const LEGACY = legacySource();
const LEGACY_DRUGS = new Function(
  `return ${slice(LEGACY, 'var medicamentos = ', '];').replace('var medicamentos = ', '')}];`,
)() as LegacyDrug[];

/** Elemento de mentira com o que o `calculateDose` do legado lê e escreve. */
function fakeElement() {
  const classes = new Set<string>();
  return {
    value: '',
    textContent: '',
    style: { display: '' },
    classList: {
      add: (name: string) => classes.add(name),
      remove: (...names: string[]) => names.forEach((name) => classes.delete(name)),
      has: (name: string) => classes.has(name),
    },
  };
}

type FakeElement = ReturnType<typeof fakeElement>;

/** O `calculateDose` do legado, como está, sobre um `document` de mentira. */
function legacyCalculator() {
  const elements = new Map<string, FakeElement>();
  const document = {
    getElementById(id: string) {
      if (!elements.has(id)) elements.set(id, fakeElement());
      return elements.get(id)!;
    },
  };
  const source = slice(LEGACY, 'function calculateDose()', '// Inicializar ao carregar');
  const api = new Function(
    'document',
    `var selectedDrug = null;\n${source}\nreturn { select: function (drug) { selectedDrug = drug; }, calculateDose: calculateDose };`,
  )(document) as { select(drug: LegacyDrug): void; calculateDose(): void };
  return (drug: LegacyDrug, weight: string, amount: string) => {
    api.select(drug);
    document.getElementById('patientWeight').value = weight;
    document.getElementById('amountIngested').value = amount;
    api.calculateDose();
    const status = document.getElementById('resultStatus').classList;
    return {
      shown: document.getElementById('calcResult').style.display === 'block',
      dose: document.getElementById('resultDose').textContent,
      status: ['safe', 'warning', 'danger'].find((name) => status.has(name)),
      text: document.getElementById('statusText').textContent,
      ratio: document.getElementById('resultRatio').textContent,
    };
  };
}

const TONE_OF_STATUS: Record<string, string> = {
  safe: 'neutral',
  warning: 'attention',
  danger: 'critical',
};

function norm(text: string | null | undefined): string {
  return (text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\./g, ',');
}

/** Peso e quantidade com casos colados nos limites de 50% e 100% da dose tóxica. */
function randomCase(random: SeededRandom, entry: { toxicDose: number }) {
  const weight = random.onGrid(0.5, 300, 0.1);
  const factor =
    random.next() < 0.3
      ? random.pick([0.5, 1, 0.4999, 0.9999, 1.0001])
      : random.onGrid(0.01, 5, 0.01);
  const amount = Math.max(0.0001, Number((weight * entry.toxicDose * factor).toFixed(4)));
  return { weight, amount };
}

describe('tabela × Tox Path legado', () => {
  it('as 242 entradas, iguais campo a campo e na mesma ordem', () => {
    expect(LEGACY_DRUGS).toHaveLength(242);
    expect(
      TOXIC_DOSES.map(({ name, aliases, toxicDose, unit, halfLife, delayedRelease }) => ({
        nome: name,
        alias: aliases,
        dose: toxicDose,
        unidade: unit,
        meiaVida: halfLife,
        retardada: delayedRelease ?? false,
      })),
    ).toEqual(
      LEGACY_DRUGS.map((drug) => ({
        nome: drug.nome,
        alias: drug.alias ?? [],
        dose: drug.dose,
        unidade: drug.unidade,
        meiaVida: drug.meiaVida,
        retardada: drug.retardada ?? false,
      })),
    );
  });

  it('as 74 do v2 estão todas na tabela, com a mesma dose, meia-vida e sinônimos', () => {
    expect(anyTox.toxicDrugs).toHaveLength(74);
    for (const drug of anyTox.toxicDrugs) {
      const ported = TOXIC_DOSES.find((entry) => norm(entry.name) === norm(drug.nome));
      expect(ported, drug.nome).toBeDefined();
      expect(ported).toMatchObject({
        toxicDose: drug.dose,
        unit: drug.unidade,
        halfLife: drug.meiaVida,
        aliases: drug.alias ?? [],
      });
      expect(ported?.delayedRelease ?? false).toBe(drug.retardada ?? false);
    }
  });

  it(`conta em ${DIFFERENTIAL_CASES} casos = calculateDose do legado`, () => {
    const calculate = legacyCalculator();
    const random = seededRandom(SEED);
    for (let index = 0; index < DIFFERENTIAL_CASES; index += 1) {
      const position = random.integer(0, TOXIC_DOSES.length - 1);
      const entry = TOXIC_DOSES[position]!;
      const { weight, amount } = randomCase(random, entry);
      const reference = calculate(LEGACY_DRUGS[position]!, String(weight), String(amount));
      const ours = assessToxicDose(entry, weight, amount);
      const label = `caso ${index}: ${entry.name}, ${weight} kg, ${amount} mg`;
      expect(reference.shown, label).toBe(true);
      expect(norm(reference.dose), label).toBe(norm(formatIngestedDose(ours)));
      expect(TONE_OF_STATUS[reference.status ?? ''], label).toBe(ours.band.tone);
      expect(norm(reference.text), label).toBe(norm(toxicDoseBandText(ours)));
      expect(norm(reference.ratio), label).toBe(
        ours.band.id === 'acima'
          ? norm(
              `Dose ingerida é ${formatDecimal(ours.ratio, 1)} vezes a dose tóxica de referência`,
            )
          : norm(toxicDosePercentText(ours)),
      );
    }
  });

  it('sem peso ou com quantidade zero o legado não mostra nada (o Copiloto recusa na faixa)', () => {
    const calculate = legacyCalculator();
    const drug = LEGACY_DRUGS[0]!;
    expect(calculate(drug, '', '100').shown).toBe(false);
    expect(calculate(drug, '70', '0').shown).toBe(false);
  });
});

// ---- Aba "Doses tóxicas" do ToxPath v2 -----------------------------------------------------

const react = createHeadlessReact();
const h = react.module.createElement;
const passthrough =
  (tag: string) =>
  ({ children, ...props }: Record<string, unknown> & { children?: HeadlessNode }) =>
    h(tag, props, children);

const ToxPath = loadFrozenModule('ToxPath.tsx', react, {
  '../components/layout/Disclaimer': { Disclaimer: () => null },
  '../components/layout/Header': { Header: passthrough('header') },
  '../components/layout/Footer': { Footer: () => null },
  '../components/layout/Container': { Container: passthrough('container') },
  '../components/layout/FABMenu': { FABMenu: () => null },
  '../components/common/Card': { Card: passthrough('card') },
  '../components/common/Collapsible': { Collapsible: passthrough('collapsible') },
  '../components/common/AlertCard': { AlertCard: passthrough('alertcard') },
  '../contexts/ToastContext': { useToast: () => ({}) },
  '../contexts/WeightContext': { useWeight: () => ({ weight: null, setWeight: () => {} }) },
  '../data/toxData': anyTox,
}).default as (props: Record<string, never>) => HeadlessNode;

/** Estado da aba: [tela, aba, busca, droga escolhida, peso, quantidade]. */
function dosesTab(search: string, drug: unknown, weight = '', amount = ''): HeadlessNode {
  return react.render(ToxPath, {}, ['tabelas', 'doses', search, drug, weight, amount]);
}

describe('aba Doses tóxicas × ToxPath v2', () => {
  const v2Entries = anyTox.toxicDrugs.map((drug) => ({
    drug,
    entry: TOXIC_DOSES.find(
      (candidate) => norm(candidate.name) === norm(drug.nome),
    ) as ToxicDoseEntry,
  }));

  function v2Result(tree: HeadlessNode) {
    const band = findAll(
      tree,
      (element) => element.type === 'p' && /DOSE TÓXICA/.test(textOf(element)),
    )[0];
    const percent = findAll(
      tree,
      (element) => element.type === 'p' && /% da dose tóxica$/.test(textOf(element)),
    )[0];
    return {
      dose: valueNextTo(tree, 'Dose ingerida'),
      band: band ? textOf(band) : null,
      percent: percent ? textOf(percent) : null,
    };
  }

  function expected(ours: ToxicDoseAssessment) {
    return {
      dose: norm(formatIngestedDose(ours)),
      band: norm(toxicDoseBandText(ours)),
      percent: norm(toxicDosePercentText(ours)),
    };
  }

  it(`conta em ${DIFFERENTIAL_CASES} casos = aba Doses tóxicas`, () => {
    const random = seededRandom(SEED + 1);
    for (let index = 0; index < DIFFERENTIAL_CASES; index += 1) {
      const { drug, entry } = random.pick(v2Entries);
      const { weight, amount } = randomCase(random, entry);
      const reference = v2Result(dosesTab(drug.nome, drug, String(weight), String(amount)));
      const ours = assessToxicDose(entry, weight, amount);
      expect(
        {
          dose: norm(reference.dose),
          band: norm(reference.band),
          percent: norm(reference.percent),
        },
        `caso ${index}: ${entry.name}, ${weight} kg, ${amount} mg`,
      ).toEqual(expected(ours));
    }
  });

  it('busca: tudo o que a aba achava o Copiloto acha', () => {
    const queries = new Set<string>();
    for (const drug of anyTox.toxicDrugs) {
      for (const word of [drug.nome, ...(drug.alias ?? [])]) {
        const lower = word.toLowerCase();
        for (let length = 2; length <= Math.min(5, lower.length); length += 1) {
          queries.add(lower.slice(0, length));
          queries.add(lower.slice(1, 1 + length));
        }
      }
    }
    for (const query of queries) {
      // O ANY não apara espaço; o Copiloto apara. Só compara busca sem espaço na ponta.
      if (query !== query.trim() || query.length < 2) continue;
      const shown = findAll(dosesTab(query, null), (element) => element.type === 'button')
        .map((button) => textOf(findAll(button, (child) => child.type === 'span')[0]))
        .filter((name) => anyTox.toxicDrugs.some(({ nome }) => nome === name));
      const ours = new Set(searchToxicDoses(query).map(({ name }) => norm(name)));
      for (const name of shown) expect(ours.has(norm(name)), `"${query}" → ${name}`).toBe(true);
    }
  });
});
