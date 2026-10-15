import { describe, expect, it } from 'vitest';
import * as anyData from '../any-reference/paliaData';
import { evaluateCalculator } from '../../src/shared/clinical-tools/calculator';
import { normalizeSearchText } from '../../src/shared/clinical-tools/catalog';
import { formatCompact, formatDecimal } from '../../src/shared/clinical-tools/numbers';
import * as content from '../../src/shared/clinical-tools/palliative/content';
import * as hypodermoclysis from '../../src/shared/clinical-tools/palliative/hypodermoclysis';
import * as opioids from '../../src/shared/clinical-tools/palliative/opioids';
import * as scales from '../../src/shared/clinical-tools/palliative/scales';
import type { ResultTone } from '../../src/shared/clinical-tools/tone';
import {
  className,
  mountPaliaPath,
  textContent,
  textLeaves,
  walk,
  type PaliaPathHarness,
  type RenderedElement,
} from './palia-path-harness';
import { DIFFERENTIAL_CASES, seededRandom } from './seeded-random';

/**
 * CC-329 — o roteiro de cuidados paliativos do Copiloto contra o PaliaPath
 * congelado do ANY (tests/any-reference/PaliaPath.tsx e paliaData.ts).
 *
 * - Conversor de opioides: a própria tela do ANY roda (palia-path-harness) e
 *   cada par de opioides (36) é conferido em 1.000 doses aleatórias com
 *   semente fixa, mais os limites da faixa: mesmo número na tela, com uma
 *   casa decimal.
 * - ECOG (6 níveis), PPS (11 níveis) e PPI (as 72 combinações, clicando nas
 *   opções da tela do ANY): mesmo nível, mesmo escore, mesma faixa e tom.
 * - Matriz de compatibilidade: célula a célula como a tela do ANY mostra.
 * - Conteúdo: todo dado do `paliaData` campo a campo e todo texto que as telas
 *   do ANY mostram, com as trocas de texto declaradas abaixo.
 *
 * Nenhum teste do branch antigo do ANY (claude/update-test-database-M10pD)
 * cobre o PaliaPath; não houve teste antigo a portar.
 */

const SEED = 20261015;

// ---------------------------------------------------------------------------
// Trocas de texto declaradas
// ---------------------------------------------------------------------------

type Edit = readonly [any: string, copiloto: string];

/** Ortografia evidente (lista também na revisão clínica, seção 9). */
const SPELLING: readonly Edit[] = [
  ['DRC estagio', 'DRC estágio'],
  ['avancada', 'avançada'],
  ['Multiplas', 'Múltiplas'],
  ['declinio', 'declínio'],
  ['Auxilio', 'Auxílio'],
  ['Presenca', 'Presença'],
  ['Codeina', 'Codeína'],
  ['(usuario)', '(usuário)'],
  ['1a linha', '1ª linha'],
  ['refratario(s)', 'refratário(s)'],
  ['Mudanca', 'Mudança'],
  ['periodos', 'períodos'],
  ['horario', 'horário'],
  ['regiao escapular ou infraclavícular', 'região escapular ou infraclavicular'],
  ['Swab de alcool', 'Swab de álcool'],
  ['prega cutanea', 'prega cutânea'],
  ['Escopolâmina', 'Escopolamina'],
  ['pulmao', 'pulmão'],
  ['dependencia', 'dependência'],
  ['analgesico', 'analgésico'],
  ['Familia', 'Família'],
  ['comecar apos', 'começar após'],
  ['Support Care Câncer', 'Support Care Cancer'],
  ['CA Câncer J Clin', 'CA Cancer J Clin'],
  ['Ortotanasia', 'Ortotanásia'],
  ['Max 62,5', 'Máx. 62,5'],
  ['Dose Max', 'Dose máx.'],
  ['Equianalgesica', 'Equianalgésica'],
  // "e" que é verbo ("é") nos mitos
  ['tolerância) e diferente', 'tolerância) é diferente'],
  ['da dor e muito mais', 'da dor é muito mais'],
  ['duplo efeito e eticamente', 'duplo efeito é eticamente'],
  ['AGORA e o correto', 'AGORA é o correto'],
  ['da dor e responsabilidade', 'da dor é responsabilidade'],
  ['A UTI e um dos', 'A UTI é um dos'],
  ['frequentemente e o primeiro', 'frequentemente é o primeiro'],
  ['ao DE, e porque', 'ao DE, é porque'],
];

/** Ordem trocada por sugestão (ADR-017; revisão clínica, seção 8). */
const LANGUAGE: readonly Edit[] = [
  ['considerar abordagem paliativa', 'considere abordagem paliativa'],
  ['considerar cuidados paliativos', 'considere cuidados paliativos'],
  ['Considerar midazolam', 'Considere midazolam'],
  ['Considerar octreotide', 'Considere octreotide'],
  ['Iniciar 1mg SC/EV', 'Considere iniciar 1mg SC/EV'],
  [
    'Sempre iniciar com 75% da dose calculada ao trocar.',
    'Ao trocar, considere iniciar com 75% da dose calculada.',
  ],
  ['SUSPENDER:', 'Considere suspender:'],
  ['MANTER:', 'Considere manter:'],
];

/** Defeitos de exibição do ANY que não foram portados (revisão clínica, seção 9). */
const DISPLAY: readonly Edit[] = [
  // Entidade HTML num texto do React: o ANY mostrava "&quot;" literalmente.
  ['&quot;', '"'],
  ['>=60%', '≥60%'],
  ['Levomeprom.', 'Levomepromazina'],
];

const EDITS: readonly Edit[] = [...SPELLING, ...LANGUAGE, ...DISPLAY];
const usedEdits = new Set<Edit>();

/** Texto do ANY com as trocas declaradas aplicadas. */
function fromAny(text: string): string {
  let result = text;
  for (const edit of EDITS) {
    if (result.includes(edit[0])) {
      result = result.split(edit[0]).join(edit[1]);
      usedEdits.add(edit);
    }
  }
  return result;
}

function blocksOf(tab: content.SymptomTab): content.ContentBlock[] {
  const flatten = (blocks: readonly content.ContentBlock[]): content.ContentBlock[] =>
    blocks.flatMap((block) =>
      block.kind === 'group' ? [block, ...flatten(block.blocks)] : [block],
    );
  return flatten(content.SYMPTOM_PAGES[tab]);
}

function medicationTables(tab: content.SymptomTab): (readonly content.MedicationRow[])[] {
  return blocksOf(tab).flatMap((block) => (block.kind === 'medications' ? [block.rows] : []));
}

function lists(tab: content.SymptomTab): (readonly string[])[] {
  return blocksOf(tab).flatMap((block) => (block.kind === 'list' ? [block.items] : []));
}

interface AnyMedRow {
  med: string;
  dose: string;
  obs?: string;
  via?: string;
}

function anyRows(
  rows: readonly AnyMedRow[],
  detail: 'obs' | 'via' | null,
): content.MedicationRow[] {
  return rows.map((row) => {
    const value = detail ? row[detail] : undefined;
    return {
      name: fromAny(row.med),
      dose: fromAny(row.dose),
      ...(value ? { detail: fromAny(value) } : {}),
    };
  });
}

// ---------------------------------------------------------------------------
// Navegação na tela do ANY
// ---------------------------------------------------------------------------

function openModule(any: PaliaPathHarness, title: string): void {
  any.click(
    any.find(
      (element) => element.type === 'Card' && textContent(element).startsWith(title),
      `cartão ${title}`,
    ),
  );
}

function within(root: RenderedElement, predicate: (element: RenderedElement) => boolean) {
  return [...walk(root)].filter(predicate);
}

/** Toca na aba (TabBar) ou na pílula (PillTabs) com o rótulo dado. */
function selectTab(any: PaliaPathHarness, bar: 'TabBar' | 'PillTabs', label: string): void {
  const container = any.find((element) => element.type === bar, bar);
  const [button] = within(
    container,
    (element) => element.type === 'button' && textContent(element) === label,
  );
  if (!button) throw new Error(`Aba "${label}" não encontrada no ${bar}`);
  any.click(button);
}

function backToHome(any: PaliaPathHarness): void {
  any.click(
    any.find(
      (element) => element.type === 'button' && textContent(element).includes('Voltar'),
      'Voltar',
    ),
  );
}

/** Cor da caixa de resultado do PPI no ANY → tom (ADR-017). */
const PPI_COLOR_TONE: Record<string, ResultTone> = {
  emerald: 'neutral',
  yellow: 'attention',
  orange: 'attention',
  red: 'critical',
};

function anyTone(classes: string): ResultTone {
  const color = Object.keys(PPI_COLOR_TONE).find((name) => classes.includes(`bg-${name}-500`));
  const tone = color ? PPI_COLOR_TONE[color] : undefined;
  if (!tone) throw new Error(`Cor do ANY sem tom declarado: ${classes}`);
  return tone;
}

// ---------------------------------------------------------------------------
// Conversor de opioides
// ---------------------------------------------------------------------------

interface AnyOpioidScreen {
  set(from: opioids.OpioidId, to: opioids.OpioidId, dose: string): void;
  read(): { kind: 'metadona'; text: string } | { kind: 'valor'; value: string; caption: string };
}

function openOpioidConverter(): AnyOpioidScreen {
  const any = mountPaliaPath();
  openModule(any, 'Ferramentas e Escalas');
  selectTab(any, 'TabBar', 'Opioides');
  return {
    set(from, to, dose) {
      const [fromSelect, toSelect] = any.findAll((element) => element.type === 'select');
      const doseInput = any.find(
        (element) => element.type === 'input' && element.props.inputMode === 'decimal',
        'campo de dose',
      );
      if (!fromSelect || !toSelect) throw new Error('Seletores de opioide não encontrados');
      any.change(fromSelect, from);
      any.change(toSelect, to);
      any.change(doseInput, dose);
    },
    read() {
      const [warning] = any.findAll(
        (element) => element.type === 'div' && className(element).includes('text-warning'),
      );
      if (warning) return { kind: 'metadona', text: textContent(warning) };
      const value = any.find(
        (element) => element.type === 'div' && className(element).includes('text-3xl'),
        'resultado da conversão',
      );
      const caption = any.find(
        (element) => element.type === 'div' && className(element).includes('text-text-muted mt-1'),
        'legenda da conversão',
      );
      return { kind: 'valor', value: textContent(value), caption: textContent(caption) };
    },
  };
}

const PAIRS = opioids.OPIOID_IDS.flatMap((from) =>
  opioids.OPIOID_IDS.map((to) => [from, to] as const),
);

describe('conversor de opioides — a tela do ANY', () => {
  const screen = openOpioidConverter();

  it('lista os mesmos opioides, na mesma ordem, com os mesmos fatores', () => {
    expect(opioids.OPIOIDS.map(({ id, label }) => ({ value: id, label }))).toEqual(
      anyData.opioidOptions.map(({ value, label }) => ({ value, label: fromAny(label) })),
    );
    for (const definition of opioids.OPIOIDS) {
      const anyFactor = anyData.opioidFactors[definition.id];
      if (definition.rule.kind === 'linear') {
        expect(definition.rule.factor, definition.id).toBe(anyFactor);
      } else {
        // Diferença declarada: o ANY ainda guarda o fator 4 da metadona, mas
        // não mostra a conta (mostra a orientação); aqui o fator não existe.
        expect(definition.id).toBe('metadona');
        expect(anyFactor).toBe(4);
      }
    }
  });

  it.each(PAIRS.map(([from, to], index) => [from, to, index] as const))(
    '%s → %s: 1.000 doses aleatórias e os limites da faixa dão o mesmo número',
    (from, to, index) => {
      const source = opioids.opioid(from);
      const random = seededRandom(SEED + index);
      const doses = [
        source.range.min,
        source.range.max,
        ...Array.from({ length: DIFFERENTIAL_CASES }, () =>
          random.onGrid(source.range.min, source.range.max, 0.1),
        ),
      ];
      for (const dose of doses) {
        screen.set(from, to, String(dose));
        const reference = screen.read();
        const ours = opioids.convertOpioid({ from, to, dose: formatCompact(dose, 1) });
        if (reference.kind === 'metadona') {
          expect(ours.status, `${from}→${to} ${dose}`).toBe('nao-linear');
          expect(reference.text).toBe(opioids.METHADONE_WARNING);
          continue;
        }
        if (ours.status !== 'complete') {
          throw new Error(`${from}→${to} ${dose}: o ANY deu ${reference.value} e o Copiloto não`);
        }
        expect(
          opioids.formatOpioidDose(ours.value).replace(',', '.'),
          `${from}→${to} ${dose}`,
        ).toBe(reference.value);
        expect(reference.caption).toBe('Dose equivalente em 24h (75% da dose calculada)');
      }
    },
  );

  it('sem dose, dose zero, negativa ou ilegível: nenhum dos dois mostra número', () => {
    for (const raw of ['', '0', '-5', 'abc']) {
      screen.set('morfina-vo', 'tramadol', raw);
      expect(screen.read()).toEqual({
        kind: 'valor',
        value: '-',
        caption: 'Dose equivalente em 24h',
      });
      expect(opioids.convertOpioid({ from: 'morfina-vo', to: 'tramadol', dose: raw }).status).toBe(
        'pending',
      );
    }
  });

  it('acima da faixa do porte o ANY ainda calcula; o Copiloto recusa (diferença declarada)', () => {
    for (const definition of opioids.OPIOIDS) {
      if (definition.rule.kind !== 'linear') continue;
      const above = definition.range.max + 1;
      screen.set(definition.id, 'morfina-vo', String(above));
      expect(screen.read().kind).toBe('valor');
      const ours = opioids.convertOpioid({
        from: definition.id,
        to: 'morfina-vo',
        dose: String(above),
      });
      expect(ours).toMatchObject({ status: 'pending', error: { kind: 'out-of-range' } });
    }
  });

  it('tem a mesma tabela de equivalência, a mesma nota e a mesma orientação da metadona', () => {
    expect(
      opioids.OPIOID_EQUIVALENCE_TABLE.map(({ label, dose, factor }) => ({
        drug: label,
        dose,
        factor,
      })),
    ).toEqual(
      anyData.opioidEquivalenceTable.map(({ drug, dose, factor }) => ({
        drug: fromAny(drug),
        dose,
        factor,
      })),
    );
  });
});

// ---------------------------------------------------------------------------
// ECOG, PPS e PPI
// ---------------------------------------------------------------------------

describe('escalas — a tela do ANY', () => {
  it('ECOG: tocar em cada nível destaca o mesmo nível e rótulo, e a tabela é a mesma', () => {
    const any = mountPaliaPath();
    openModule(any, 'Ferramentas e Escalas');
    selectTab(any, 'TabBar', 'ECOG');
    const levelButtons = () =>
      any.findAll(
        (element) => element.type === 'button' && className(element).includes('text-center p-3'),
      );
    expect(levelButtons()).toHaveLength(scales.ECOG_LEVELS.length);
    scales.ECOG_LEVELS.forEach((level, index) => {
      const button = levelButtons()[index];
      if (!button) throw new Error(`ECOG ${level.grade} sem botão`);
      any.click(button);
      const selected = levelButtons().filter((candidate) =>
        className(candidate).includes('bg-accent text-white'),
      );
      expect(selected).toHaveLength(1);
      const [grade, label] = (selected[0]?.children ?? []).map(textContent);
      expect({ grade, label }).toEqual({ grade: String(level.grade), label: level.label });
    });

    const rows = any
      .findAll((element) => element.type === 'tr')
      .map((row) =>
        row.children
          .filter(
            (cell): cell is RenderedElement =>
              typeof cell === 'object' && cell !== null && cell.type === 'td',
          )
          .map(textContent),
      )
      .filter((cells) => cells.length === 2);
    expect(rows).toEqual(
      scales.ECOG_LEVELS.filter(({ description }) => description).map(({ grade, description }) => [
        String(grade),
        description,
      ]),
    );
  });

  it('ECOG: dado igual ao do ANY', () => {
    expect(scales.ECOG_LEVELS).toEqual(
      anyData.ecogLevels.map(({ level, label, description }) => ({
        grade: level,
        label,
        description,
      })),
    );
  });

  it('PPS: os 11 níveis da tabela, coluna a coluna', () => {
    const any = mountPaliaPath();
    openModule(any, 'Ferramentas e Escalas');
    selectTab(any, 'TabBar', 'PPS');
    const rows = any
      .findAll((element) => element.type === 'tr')
      .map((row) =>
        row.children
          .filter(
            (cell): cell is RenderedElement =>
              typeof cell === 'object' && cell !== null && cell.type === 'td',
          )
          .map(textContent),
      )
      .filter((cells) => cells.length === 6);
    expect(rows).toEqual(
      scales.PPS_LEVELS.map((level) => [
        `${level.percent}%`,
        ...scales.PPS_COLUMNS.map(({ key }) => level[key]),
      ]),
    );
    expect(scales.PPS_COLUMNS.map(({ label }) => label)).toEqual([
      'Deambulação',
      'Atividade',
      'Autocuidado',
      'Ingesta',
      'Consciência',
    ]);
  });

  it('PPI: itens, opções e pontos iguais aos do ANY', () => {
    expect(
      scales.PPI_CALCULATOR.items.map(({ id, label, options }) => ({
        name: id,
        label,
        options: options.map(({ label: text, points }) => ({
          text,
          value: points,
          score: `+${formatCompact(points)}`,
        })),
      })),
    ).toEqual(
      anyData.ppiOptions.map(({ name, label, options }) => ({
        name,
        label,
        options: options.map(({ text, value, score }) => ({ text: fromAny(text), value, score })),
      })),
    );
  });

  it('PPI: as 72 combinações, clicando na tela do ANY, dão o mesmo escore, faixa e tom', () => {
    const any = mountPaliaPath();
    openModule(any, 'Ferramentas e Escalas');
    selectTab(any, 'TabBar', 'PPI');

    const groupButtons = (label: string) => {
      const group = any.find(
        (element) =>
          element.type === 'div' &&
          element.children.some(
            (child) =>
              typeof child === 'object' &&
              child !== null &&
              child.type === 'label' &&
              textContent(child) === label,
          ),
        `grupo ${label}`,
      );
      return group.children.filter(
        (child): child is RenderedElement =>
          typeof child === 'object' && child !== null && child.type === 'button',
      );
    };

    const items = scales.PPI_CALCULATOR.items;
    const combinations = items.reduce<number[][]>(
      (acc, item) => acc.flatMap((prefix) => item.options.map((_, index) => [...prefix, index])),
      [[]],
    );
    expect(combinations).toHaveLength(72);

    for (const combination of combinations) {
      const answers: Record<string, string> = {};
      items.forEach((item, itemIndex) => {
        const optionIndex = combination[itemIndex] ?? 0;
        const button = groupButtons(item.label)[optionIndex];
        const option = item.options[optionIndex];
        if (!button || !option) throw new Error(`PPI ${item.id}: opção ${optionIndex} sem botão`);
        any.click(button);
        answers[item.id] = option.id;
      });

      const score = textContent(
        any.find(
          (element) => element.type === 'div' && className(element).includes('text-4xl'),
          'escore PPI',
        ),
      );
      const result = any.find(
        (element) =>
          element.type === 'div' &&
          className(element).includes('rounded-lg p-3 text-xs font-semibold'),
        'resultado PPI',
      );

      const ours = evaluateCalculator(scales.PPI_CALCULATOR, { items: answers });
      if (ours.status !== 'complete') throw new Error('PPI incompleto com todos os itens');
      const band = scales.PPI_BANDS.find(({ id }) => id === ours.band.id);
      if (!band) throw new Error(`Faixa ${ours.band.id} sem conteúdo`);
      const label = combination.join('');
      expect(formatDecimal(ours.value, 1).replace(',', '.'), label).toBe(score);
      expect(textContent(result), label).toBe(
        `Sobrevida mediana: ${band.medianSurvival} — ${band.label}${band.accuracy ? ` (${band.accuracy})` : ''}`,
      );
      expect(ours.band.tone, label).toBe(anyTone(className(result)));
    }
  });

  it('PPI: o interpretPPI do ANY e as faixas do Copiloto concordam em todo escore possível', () => {
    for (let score = 0; score <= 15; score += 0.5) {
      const reference = anyData.interpretPPI(score);
      const band = scales.PPI_BANDS.find(
        ({ upTo }, index) =>
          (upTo !== undefined && score <= upTo) || index === scales.PPI_BANDS.length - 1,
      );
      if (!band) throw new Error(`Sem faixa para ${score}`);
      expect(reference.text).toBe(
        `Sobrevida mediana: ${band.medianSurvival} — ${band.label}${band.accuracy ? ` (${band.accuracy})` : ''}`,
      );
      expect(anyTone(reference.className)).toBe(band.tone);
    }
  });

  it('PPI: o ANY abre com escore 0 e "~155 dias"; o Copiloto abre sem resposta (diferença declarada)', () => {
    const any = mountPaliaPath();
    openModule(any, 'Ferramentas e Escalas');
    selectTab(any, 'TabBar', 'PPI');
    expect(
      textContent(
        any.find(
          (element) => element.type === 'div' && className(element).includes('text-4xl'),
          'escore PPI',
        ),
      ),
    ).toBe('0.0');
    expect(evaluateCalculator(scales.PPI_CALCULATOR, { items: {} })).toMatchObject({
      status: 'pending',
      missing: scales.PPI_CALCULATOR.items.map(({ label }) => label),
    });
  });
});

// ---------------------------------------------------------------------------
// Hipodermóclise
// ---------------------------------------------------------------------------

describe('hipodermóclise — a tela do ANY', () => {
  it('matriz de compatibilidade: cabeçalho, linhas e cada célula como o ANY mostra', () => {
    const any = mountPaliaPath();
    openModule(any, 'Ferramentas e Escalas');
    selectTab(any, 'TabBar', 'Hipodermóclise');
    selectTab(any, 'PillTabs', 'Compatibilidade');

    const headers = any
      .findAll((element) => element.type === 'th')
      .map(textContent)
      .filter((text) => text !== '');
    expect(headers).toEqual(
      hypodermoclysis.COMPATIBILITY_DRUGS.map(({ abbreviation }) => abbreviation),
    );

    const rows = any
      .findAll((element) => element.type === 'tr')
      .map((row) =>
        row.children
          .filter(
            (cell): cell is RenderedElement =>
              typeof cell === 'object' && cell !== null && cell.type === 'td',
          )
          .map(textContent),
      )
      .filter((cells) => cells.length > 0);
    expect(rows).toHaveLength(15);

    hypodermoclysis.COMPATIBILITY_DRUGS.forEach((drug, index) => {
      const [name, ...cells] = rows[index] ?? [];
      expect(fromAny(name ?? '')).toBe(drug.name);
      // O ANY tem 14 valores por linha para 15 colunas: a 15ª (DEX) fica vazia
      // na tela. O porte marca essa célula "sem dado" e não inventa valor.
      expect(cells, drug.name).toHaveLength(14);
      const shown = hypodermoclysis.COMPATIBILITY_DRUGS.map(
        (_, column) => cells[column] ?? 'sem-dado',
      );
      expect(hypodermoclysis.COMPATIBILITY_MATRIX[drug.id], drug.name).toEqual(shown);
    });
  });

  it('matriz de compatibilidade: dado igual ao do ANY, com a lacuna e as discordâncias registradas', () => {
    expect(hypodermoclysis.COMPATIBILITY_DRUGS.map(({ abbreviation }) => abbreviation)).toEqual(
      anyData.compatHeaders,
    );
    hypodermoclysis.COMPATIBILITY_DRUGS.forEach((drug, index) => {
      const reference = anyData.compatRows[index];
      expect(fromAny(reference?.drug ?? '')).toBe(drug.name);
      expect(hypodermoclysis.COMPATIBILITY_MATRIX[drug.id].slice(0, 14)).toEqual(reference?.compat);
    });
    // Revisão clínica, seção 4: 15 células sem dado (coluna DEX) e 37 pares
    // em que linha × coluna e coluna × linha discordam. Quando a revisão
    // corrigir a matriz, estes números mudam junto com o documento.
    expect(hypodermoclysis.compatibilityGaps()).toEqual(
      hypodermoclysis.COMPATIBILITY_DRUGS.map(({ id }) => ({ row: id, column: 'dexametasona' })),
    );
    expect(hypodermoclysis.compatibilityDisagreements()).toHaveLength(37);
  });

  it('medicações: as 19 drogas, a mesma lista e a mesma busca em 1.000 buscas aleatórias', () => {
    const any = mountPaliaPath();
    openModule(any, 'Ferramentas e Escalas');
    selectTab(any, 'TabBar', 'Hipodermóclise');
    selectTab(any, 'PillTabs', 'Medicações');

    const search = any.find(
      (element) => element.type === 'input' && element.props.type === 'text',
      'busca de medicamento',
    );
    const shown = () =>
      any
        .findAll((element) => element.type === 'h5' && className(element).includes('text-accent'))
        .map((element) => fromAny(textContent(element)));

    expect(hypodermoclysis.SUBCUTANEOUS_MEDICATIONS).toHaveLength(19);
    expect(shown()).toEqual(hypodermoclysis.SUBCUTANEOUS_MEDICATIONS.map(({ name }) => name));

    const random = seededRandom(SEED);
    for (let index = 0; index < DIFFERENTIAL_CASES; index += 1) {
      const name = random.pick(anyData.hipoMedicações).name.toLowerCase();
      const start = random.integer(0, name.length - 1);
      const query = name.slice(start, start + random.integer(1, 5));
      any.change(search, query);
      const reference = shown();
      const ours = hypodermoclysis.searchSubcutaneousMedications(query).map(({ name: med }) => med);
      // Tudo o que o ANY acha, o Copiloto acha.
      expect(ours, query).toEqual(expect.arrayContaining(reference));
      // Diferença declarada: a busca do Copiloto ignora acento. Sem acento na
      // busca, o resultado é o mesmo, exceto a Escopolamina ("lam" não achava
      // "Escopolâmina" no ANY); com acento ("lâm"), acha também o que não tem.
      if (normalizeSearchText(query) === query) {
        expect(
          ours.filter((med) => med !== 'Escopolamina'),
          query,
        ).toEqual(reference.filter((med) => med !== 'Escopolamina'));
      }
      if (reference.length === 0 && ours.length === 0) {
        expect(textContent(any.tree())).toContain(hypodermoclysis.NO_MEDICATION_FOUND);
      }
    }
  });

  it('indicações, técnica, medicações, soluções e complicações: dado igual ao do ANY', () => {
    expect(hypodermoclysis.HYPODERMOCLYSIS_INDICATIONS).toEqual(
      anyData.hipoIndicações.map(fromAny),
    );
    expect(hypodermoclysis.HYPODERMOCLYSIS_CONTRAINDICATIONS).toEqual(
      anyData.hipoContraindicações.map(fromAny),
    );
    expect(hypodermoclysis.PUNCTURE_SITES).toEqual(
      anyData.volumesPorLocal.map(({ region, volume }) => ({ region, volume })),
    );
    expect(hypodermoclysis.PUNCTURE_DEVICES).toEqual(
      anyData.dispositivos.map(({ device, calibre, permanence }) => ({
        device,
        gauge: calibre,
        dwell: permanence,
      })),
    );
    expect(hypodermoclysis.HYPODERMOCLYSIS_PROCEDURE).toEqual(
      anyData.hipoProcedimento.map(({ title, description }) => ({
        title,
        description: fromAny(description),
      })),
    );
    expect(hypodermoclysis.SUBCUTANEOUS_MEDICATIONS).toEqual(
      anyData.hipoMedicações.map(({ name, dose, dilution, obs }) => ({
        name: fromAny(name),
        dose,
        dilution,
        ...(obs ? { note: obs } : {}),
      })),
    );
    expect(hypodermoclysis.SUBCUTANEOUS_SOLUTIONS).toEqual(
      anyData.hipoSolucoes.map((row) => ({
        solution: row.solução,
        maxDose: row.doseMax,
        guidance: fromAny(row.orientações),
      })),
    );
  });
});

// ---------------------------------------------------------------------------
// Conteúdo do paliaData, campo a campo
// ---------------------------------------------------------------------------

describe('conteúdo — dado do paliaData', () => {
  it('SPICT-BR', () => {
    expect(content.SPICT_GENERAL_INDICATORS.items).toEqual(
      anyData.spictIndicadoresGerais.map(fromAny),
    );
    expect(content.SPICT_CATEGORIES.map(({ title, items }) => ({ title, items }))).toEqual(
      anyData.spictCategorias.map(({ title, items }) => ({ title, items: items.map(fromAny) })),
    );
  });

  it('SAVED', () => {
    expect(
      content.SAVED_STEPS.map((step) => ({
        letter: step.letter,
        title: step.title,
        subtitle: step.subtitle,
        infoTitle: step.prompt,
        items: step.items,
        note: step.note,
        capacityGrid: step.capacity?.map(({ letter, title, description }) => ({
          letter,
          title,
          desc: description,
        })),
        importantNote: step.important,
        // O dado do ANY já trazia o rótulo que a tela repetia.
        incapazNote: step.ifIncapable ? `Se incapaz: ${step.ifIncapable}` : undefined,
      })),
    ).toEqual(
      anyData.savedCards.map((card) => ({
        letter: card.letter,
        title: fromAny(card.title),
        subtitle: card.subtitle,
        infoTitle: card.content.infoTitle,
        items: card.content.items,
        note: card.content.note,
        capacityGrid: card.content.capacityGrid,
        importantNote: card.content.importantNote,
        incapazNote: card.content.incapazNote,
      })),
    );
  });

  it('REDMAP, NURSE, frases e situações de alerta', () => {
    expect(content.REDMAP_STEPS).toEqual(anyData.redmapSteps);
    expect(content.NURSE_STEPS).toEqual(anyData.nurseSteps);
    expect(content.PHRASES_TO_USE).toEqual(anyData.frasesUteis);
    expect(content.PHRASES_TO_AVOID).toEqual(anyData.frasesEvitar.map(fromAny));
    expect(content.ALERT_SITUATIONS).toEqual(anyData.situacoesAlerta);
  });

  it('manejo de sintomas: tabelas de medicação e listas', () => {
    expect(medicationTables('dor')).toEqual([
      anyRows(anyData.dorLeve, null),
      anyRows(anyData.dorModerada, null),
      anyRows(anyData.dorIntensa, null),
    ]);
    expect(medicationTables('dispneia')).toEqual([anyRows(anyData.dispneiaFarma, 'obs')]);
    expect(lists('dispneia')).toEqual([anyData.dispneiaNaoFarma.map(fromAny)]);
    expect(medicationTables('nausea')).toEqual([anyRows(anyData.náuseaFarma, 'obs')]);
    expect(medicationTables('delirium')).toEqual([anyRows(anyData.deliriumFarma, 'via')]);
    expect(lists('delirium')).toEqual([anyData.deliriumNaoFarma.map(fromAny)]);
    expect(lists('sedacao')).toEqual([anyData.sedaçãoPreReq.map(fromAny)]);
    expect(medicationTables('sedacao')).toEqual([
      anyRows(anyData.sedaçãoProtocolo, null),
      anyRows(anyData.sedaçãoAlternativas, null),
    ]);
    const signs = blocksOf('fase-final').flatMap((block) =>
      block.kind === 'signs' ? block.rows : [],
    );
    expect(signs).toEqual(anyData.sinaisMorteIminente.map(({ sign, time }) => ({ sign, time })));
    expect(lists('fase-final')).toEqual([anyData.cuidadosFaseFinNaoFarma.map(fromAny)]);
  });

  it('PPS', () => {
    expect(scales.PPS_LEVELS).toEqual(
      anyData.ppsLevels.map((level) => ({
        percent: Number(level.pps.replace('%', '')),
        ambulation: level.deambulacao,
        activity: level.atividade,
        selfCare: level.autocuidado,
        intake: level.ingesta,
        consciousness: level.consciência,
      })),
    );
  });

  it('24 mitos', () => {
    const category: Record<string, content.MythCategory> = {
      conceito: 'conceito',
      medicações: 'medicacoes',
      comunicação: 'comunicacao',
      prognóstico: 'prognostico',
    };
    expect(content.MYTHS).toHaveLength(24);
    expect(content.MYTHS).toEqual(
      anyData.mythsData.map((myth) => ({
        id: myth.id,
        category: category[myth.category],
        title: fromAny(myth.title),
        isMyth: myth.isMito,
        statement: fromAny(myth.statement),
        explanation: fromAny(myth.explanation),
      })),
    );
  });

  it('referências', () => {
    expect(content.PALLIATIVE_REFERENCES).toEqual(
      anyData.referências.map(({ title, items }) => ({ title, items: items.map(fromAny) })),
    );
  });
});

// ---------------------------------------------------------------------------
// Todo texto das telas do ANY
// ---------------------------------------------------------------------------

/**
 * Rótulos de tela do ANY que no Copiloto são da interface (web), não do
 * conteúdo clínico do motor, com o equivalente na tela nova.
 */
const SCREEN_LABELS: Readonly<Record<string, string>> = {
  Voltar: 'trilha e botão "Início do roteiro"',
  'Calculadora PPI': 'título da seção do PPI',
  'Score PPI': 'caixa de resultado do motor ("N pontos")',
  'Calculadora de Conversão': 'título da seção do conversor',
  'Opioide Atual': 'OPIOID_FIELD_LABELS.from',
  'Dose em 24h': 'OPIOID_FIELD_LABELS.dose, com a unidade do opioide ao lado',
  'Ex: 30': 'sem exemplo: a faixa aceita aparece abaixo do campo',
  'Converter para': 'OPIOID_FIELD_LABELS.to',
  'Dose equivalente em 24h': 'OPIOID_RESULT_CAPTION',
  'Buscar medicamento...': 'rótulo da busca de medicamento',
  'Dose:': 'MEDICATION_FIELDS.dose',
  'Diluição:': 'MEDICATION_FIELDS.dilution',
  'Deslize horizontalmente para ver a tabela completa': 'tabela com rolagem e primeira coluna fixa',
  'Clique em um card para ver a explicação': 'lista de mitos com botão por mito',
  'Causa/Medicação': 'colunas Medicação e Causa (a causa saiu do nome)',
  Fator: 'OPIOID_TABLE_COLUMNS.factor',
  'Se incapaz:': 'rótulo antes de SAVED_STEPS[4].ifIncapable',
};

/** Texto que mudou de forma (não só de grafia): o que o substitui no motor. */
const RESHAPED: Readonly<Record<string, readonly string[]>> = {
  // O dado do ANY repetia o rótulo que a tela já põe.
  'Se incapaz: Identificar representante legal (cônjuge -> filhos -> pais -> irmãos). O representante decide baseado nos VALORES DO PACIENTE, não nos próprios.':
    [content.SAVED_STEPS[4]?.ifIncapable ?? 'ifIncapable ausente'],
  // A causa da náusea era prefixo do nome; virou coluna.
  'Geral / QT — Ondansetrona': ['Geral / QT', 'Ondansetrona'],
  'Gastroparesia — Metoclopramida': ['Gastroparesia', 'Metoclopramida'],
  'Obstrução — Haloperidol': ['Obstrução', 'Haloperidol'],
  'HIC — Dexametasona': ['HIC', 'Dexametasona'],
  'Vestibular — Dimenidrinato': ['Vestibular', 'Dimenidrinato'],
  // Os pedaços do resumo do PPI ("PPI {'<'}=2: …") viram PPI_INTERPRETATION_SUMMARY.
  '=2: ~155 dias | PPI': [scales.PPI_INTERPRETATION_SUMMARY],
  '2 a': [scales.PPI_INTERPRETATION_SUMMARY],
  '=4: ~89 dias | PPI': [scales.PPI_INTERPRETATION_SUMMARY],
  '4 a': [scales.PPI_INTERPRETATION_SUMMARY],
  '=6: ~18-21 dias | PPI': [scales.PPI_INTERPRETATION_SUMMARY],
  '6: ~5 dias': [scales.PPI_INTERPRETATION_SUMMARY],
};

/** Valores que a tela calcula; conferidos nos testes de conta acima. */
const COMPUTED = [/^-$/, /^\d+\.\d$/, /^\+[\d,]+$/, /^\d+%$/, /^Sobrevida mediana: /];

function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => strings(item, out));
  else if (value && typeof value === 'object')
    Object.values(value).forEach((item) => strings(item, out));
  return out;
}

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Todas as telas, abas, passos do SAVED e mitos do ANY, com os textos que cada uma mostra. */
function anyScreenTexts(): Set<string> {
  const any = mountPaliaPath();
  const seen = new Set<string>();
  const collect = () => {
    for (const leaf of textLeaves(any.tree())) {
      const text = leaf.replace(/\s+/g, ' ').trim();
      if (text.length > 1) seen.add(text);
    }
  };
  const clickAll = (predicate: (element: RenderedElement) => boolean, after?: () => void) => {
    const count = any.findAll(predicate).length;
    for (let index = 0; index < count; index += 1) {
      const target = any.findAll(predicate)[index];
      if (!target) continue;
      any.click(target);
      collect();
      after?.();
    }
  };

  collect();
  const modules = any
    .findAll((element) => element.type === 'Card' && typeof element.props.onClick === 'function')
    .map((card) => textContent(card));
  for (const module of modules) {
    openModule(any, module);
    collect();
    const tabs = (bar: string) =>
      any
        .findAll((element) => element.type === bar)
        .flatMap((container) => within(container, (element) => element.type === 'button'))
        .map(textContent);
    for (const tab of tabs('TabBar')) {
      selectTab(any, 'TabBar', tab);
      collect();
      for (const pill of tabs('PillTabs')) {
        selectTab(any, 'PillTabs', pill);
        collect();
      }
    }
    // Passos do SAVED (abre um por vez) e mitos (abre o modal e fecha).
    clickAll(
      (element) =>
        element.type === 'Card' &&
        typeof element.props.onClick === 'function' &&
        /^[SAVED]/.test(textContent(element)),
    );
    clickAll(
      (element) => element.type === 'button' && className(element).includes('min-h-[80px]'),
      () => {
        const modal = any.findAll((element) => element.type === 'Modal')[0];
        const onClose = modal?.props.onClose;
        if (typeof onClose === 'function') onClose();
      },
    );
    backToHome(any);
  }
  return seen;
}

describe('conteúdo — todo texto das telas do ANY', () => {
  // Cada string do motor numa linha: um texto do ANY precisa caber numa delas.
  const corpus = normalize(strings([content, hypodermoclysis, opioids, scales]).join(' ¶ '));
  const texts = anyScreenTexts();

  it('cada texto mostrado pelo ANY está no motor (com as trocas declaradas) ou é rótulo de tela', () => {
    const missing: string[] = [];
    for (const text of texts) {
      if (text in SCREEN_LABELS) continue;
      if (COMPUTED.some((pattern) => pattern.test(text))) continue;
      const reshaped = RESHAPED[text];
      if (reshaped) {
        for (const replacement of reshaped) {
          if (!corpus.includes(normalize(replacement))) missing.push(`${text} → ${replacement}`);
        }
        continue;
      }
      const ours = normalize(fromAny(text)).replace(/:$/, '');
      if (!corpus.includes(ours)) missing.push(text);
    }
    expect(missing).toEqual([]);
  });

  it('toda declaração de rótulo e de texto reformulado ainda aparece no ANY', () => {
    for (const label of [...Object.keys(SCREEN_LABELS), ...Object.keys(RESHAPED)]) {
      expect(texts.has(label), label).toBe(true);
    }
  });

  it('toda troca de texto declarada foi usada', () => {
    // Roda depois dos outros: o conteúdo inteiro já passou por fromAny.
    for (const text of texts) fromAny(text);
    const unused = EDITS.filter((edit) => !usedEdits.has(edit)).map(([from]) => from);
    expect(unused).toEqual([]);
  });
});
