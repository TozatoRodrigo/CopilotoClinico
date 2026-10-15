import { describe, expect, it } from 'vitest';
import {
  BLOCK_LIST,
  getRegionalBlock,
  LAST_PROTOCOL,
  LAST_STEPS,
  LAST_WARNING_SIGNS,
  MAX_DOSE_NOTICE,
  REGIONAL_BLOCK_IDS,
  TOPOGRAPHY,
  type RegionalBlockId,
} from '../../src/shared/clinical-tools/blocks/content';
import {
  EPINEPHRINE_OPTIONS,
  formatDoseMg,
  formatDoseMl,
  lipidEmulsionRows,
  LOCAL_ANESTHETICS,
  maxDose,
  type Epinephrine,
  type LipidEmulsionRowId,
} from '../../src/shared/clinical-tools/blocks/doses';
import {
  buildBlockEvolutionNote,
  EVOLUTION_ANESTHETICS,
  EVOLUTION_BLOCK_TYPES,
  EVOLUTION_COMPLICATIONS,
  EVOLUTION_EPINEPHRINE,
  EVOLUTION_INSERTIONS,
  EVOLUTION_NEEDLES,
  EVOLUTION_SIDES,
  EVOLUTION_TRANSDUCERS,
  type BlockEvolutionForm,
} from '../../src/shared/clinical-tools/blocks/evolution';
import { WEIGHT_RANGES } from '../../src/shared/clinical-tools/ranges';
import type { ResultTone } from '../../src/shared/clinical-tools/tone';
import {
  anyBlockPathInternals,
  AnyBlockPathSession,
  click,
  findAll,
  findOne,
  textOf,
  type AnyElement,
  type AnyEvoForm,
  type AnyNode,
} from './blocks-any-harness';
import { DIFFERENTIAL_CASES, seededRandom } from './seeded-random';

/**
 * CC-330 — os bloqueios regionais do Copiloto contra a tela do BlockPath do ANY
 * congelada (tests/any-reference/BlockPath.tsx), rodada sem React pelo harness:
 *
 * - dose máxima em mg e em mL de cada concentração, por anestésico × com/sem
 *   vasoconstritor, em 1.000 pesos de semente fixa cada (tolerância zero);
 * - emulsão lipídica do LAST em 1.000 pesos;
 * - os 14 caminhos da topografia, clicados até a ficha do bloqueio;
 * - a lista, a ficha de cada um dos 14 bloqueios e o protocolo de LAST;
 * - a nota de evolução gerada pelo botão do ANY em 1.000 formulários.
 *
 * O que muda de propósito está declarado aqui: `LANGUAGE_CHANGES` (texto) e as
 * notas nos testes (vírgula decimal, rótulos da emulsão, tom dos sinais).
 */

/** Texto do ANY → texto do Copiloto (ADR-017: sugestão em vez de ordem, "≤"). */
const LANGUAGE_CHANGES: Readonly<Record<string, string>> = {
  'Reduzir 20-30% em idosos, hepatopatas, cardiopatas. Em bloqueios múltiplos, considere dose total.':
    'Considere reduzir 20-30% em idosos, hepatopatas, cardiopatas. Em bloqueios múltiplos, considere dose total.',
  'Evitar vasopressina, reduzir epinefrina (<=1 mcg/kg)':
    'Evitar vasopressina, reduzir epinefrina (≤1 mcg/kg)',
};

const changed = (anyText: string): string => LANGUAGE_CHANGES[anyText] ?? anyText;

const ANY = anyBlockPathInternals();

function render(state: ConstructorParameters<typeof AnyBlockPathSession>[0]): AnyElement {
  return new AnyBlockPathSession(state).render();
}

function element(node: AnyNode | undefined): AnyElement {
  if (!node || typeof node === 'string') throw new Error('Esperava elemento na árvore do ANY');
  return node;
}

/** Pesos adultos como o médico digita (uma casa), mais bordas de faixa e de arredondamento. */
function weights(seed: number): number[] {
  const { min, max } = WEIGHT_RANGES.adulto;
  const random = seededRandom(seed);
  const edges = [40, 40.1, 41, 43, 45, 70, 99.9, 150, 150.1, 199.9, 200];
  return [
    ...edges,
    ...Array.from({ length: DIFFERENTIAL_CASES }, () => random.onGrid(min, max, 0.1)),
  ];
}

describe('dados do BlockPath', () => {
  it('anestésicos, mg/kg e concentrações iguais aos do ANY', () => {
    expect(
      LOCAL_ANESTHETICS.map(({ name, maxMgPerKg, concentrations }) => ({
        name,
        noEpi: maxMgPerKg.sem,
        withEpi: maxMgPerKg.com,
        concentrations: concentrations.map(({ label, mgPerMl }) => ({ label, factor: mgPerMl })),
      })),
    ).toEqual(ANY.anesthetics);
  });

  it('as mudanças de texto declaradas existem no ANY (a lista não apodrece)', () => {
    const anyTexts = [
      textOf(render({ screen: 'calculator' })),
      textOf(render({ screen: 'last' })),
    ].join('\n');
    for (const original of Object.keys(LANGUAGE_CHANGES)) {
      expect(anyTexts, original).toContain(original);
    }
  });
});

/** Card de um anestésico na calculadora do ANY: mg sem/com epi e a tabela de mL. */
function anyCalculatorCard(tree: AnyElement, name: string) {
  const card = findOne(
    tree,
    (el) =>
      el.type === 'div' &&
      typeof el.children[0] === 'object' &&
      textOf(el.children[0]) === name &&
      findAll(el, (inner) => inner.type === 'table').length === 1,
  );
  const boxes = element(card.children[1]).children.map((box) => {
    const [label, value] = element(box).children.map((child) => textOf(child));
    return { label: label ?? '', mg: value ?? '' };
  });
  const tbody = findOne(card, (el) => el.type === 'tbody');
  const rows = tbody.children.map((row) => element(row).children.map((cell) => textOf(cell)));
  // Colunas da tabela: concentração, sem epi, com epi.
  const column = (index: 0 | 1) => {
    const box = boxes[index];
    if (!box) throw new Error(`Card de ${name} sem a caixa ${index}`);
    return { ...box, ml: rows.map((cells) => [cells[0] ?? '', cells[index + 1] ?? '']) };
  };
  const columns: Record<Epinephrine, ReturnType<typeof column>> = {
    sem: column(0),
    com: column(1),
  };
  return columns;
}

describe('dose máxima × ANY (1.000 pesos por anestésico × vasoconstritor)', () => {
  const combos = LOCAL_ANESTHETICS.flatMap((anesthetic, a) =>
    EPINEPHRINE_OPTIONS.map((epinephrine, e) => ({
      anesthetic,
      epinephrine,
      seed: 3300 + a * 10 + e,
    })),
  );

  it.each(combos.map((combo) => [combo.anesthetic.name, combo.epinephrine, combo] as const))(
    '%s %s epinefrina',
    (_name, _epi, { anesthetic, epinephrine, seed }) => {
      const anyAnesthetic = ANY.anesthetics.find(({ name }) => name === anesthetic.name);
      if (!anyAnesthetic) throw new Error(anesthetic.name);
      const anyMgPerKg = epinephrine === 'sem' ? anyAnesthetic.noEpi : anyAnesthetic.withEpi;

      for (const [index, weight] of weights(seed).entries()) {
        const context = `caso ${index}, ${weight} kg`;
        const shown = anyCalculatorCard(
          render({ screen: 'calculator', calcWeight: weight }),
          anesthetic.name,
        )[epinephrine];
        const ours = maxDose(weight, anesthetic, epinephrine);

        // O rótulo do ANY mostra o mg/kg com ponto ("Sem epi (4.5 mg/kg)"); o valor é o mesmo.
        expect(shown.label, context).toBe(
          `${epinephrine === 'sem' ? 'Sem' : 'Com'} epi (${ours.mgPerKg} mg/kg)`,
        );
        expect(formatDoseMg(ours.mg), context).toBe(shown.mg);
        expect(ours.mg, context).toBe(weight * anyMgPerKg);
        expect(
          ours.volumes.map(({ concentration, ml }) => [concentration.label, formatDoseMl(ml)]),
          context,
        ).toEqual(shown.ml);
        ours.volumes.forEach(({ ml }, c) => {
          const factor = anyAnesthetic.concentrations[c]?.factor ?? Number.NaN;
          expect(ml, context).toBe((weight * anyMgPerKg) / factor);
        });
      }
    },
  );

  it('o aviso abaixo da calculadora é o do ANY, como sugestão', () => {
    const alert = findOne(
      render({ screen: 'calculator' }),
      (el) => el.type === '@AlertCard' && el.props.type === 'warning',
    );
    expect(alert.props.title).toBe(MAX_DOSE_NOTICE.title);
    expect(changed(textOf(alert))).toBe(MAX_DOSE_NOTICE.text);
  });
});

/** O ANY mostra os rótulos em caixa alta; o Copiloto usa caixa de frase. */
const ANY_LIPID_LABEL: Record<LipidEmulsionRowId, string> = {
  bolus: 'BOLUS (1,5 mL/kg)',
  infusao: 'INFUSÃO (0,25 mL/kg/min)',
  'dose-maxima': 'DOSE MÁX (12 mL/kg)',
};

describe('LAST × ANY', () => {
  it('emulsão lipídica 20% em 1.000 pesos', () => {
    for (const [index, weight] of weights(3390).entries()) {
      const tree = render({ screen: 'last', lipidWeight: weight });
      const shown = findAll(
        tree,
        (el) =>
          el.type === 'div' &&
          el.children.length === 2 &&
          el.children.every((child) => typeof child !== 'string' && child.type === 'span'),
      ).map((row) => row.children.map((cell) => textOf(cell)));
      const ours = lipidEmulsionRows(weight).map(({ id, text }) => [ANY_LIPID_LABEL[id], text]);
      expect(ours, `caso ${index}, ${weight} kg`).toEqual(shown);
    }
  });

  it('título, sinais de alerta e os cinco passos', () => {
    const tree = render({ screen: 'last' });
    expect(textOf(findOne(tree, (el) => el.type === 'h2'))).toBe(LAST_PROTOCOL.title);
    expect(
      textOf(findOne(tree, (el) => el.type === 'p' && textOf(el).startsWith('Toxicidade'))),
    ).toBe(LAST_PROTOCOL.subtitle);

    const signs = findOne(tree, (el) => el.type === '@Collapsible');
    expect(signs.props.title).toBe(LAST_PROTOCOL.warningSignsTitle);
    // O ANY usa o cartão azul (info) nos sinais neurológicos; aqui eles pedem reavaliação.
    const anyTone: Record<string, ResultTone> = { info: 'attention', danger: 'critical' };
    expect(
      findAll(signs, (el) => el.type === '@AlertCard').map((card) => ({
        title: card.props.title,
        text: textOf(card),
        tone: anyTone[String(card.props.type)],
      })),
    ).toEqual(LAST_WARNING_SIGNS);

    expect(findAll(tree, (el) => el.type === 'h4')).toHaveLength(LAST_STEPS.length);
    const shown = findAll(
      tree,
      (el) =>
        el.type === 'div' &&
        el.children.some((child) => typeof child !== 'string' && child.type === 'h4'),
    ).map((card) => ({
      title: textOf(findOne(card, (el) => el.type === 'h4')),
      detail: changed(textOf(findOne(card, (el) => el.type === 'p'))),
    }));
    expect(shown).toEqual(LAST_STEPS);

    expect(textOf(tree)).toContain(LAST_PROTOCOL.lipidTitle);
  });
});

describe('topografia × ANY (14 caminhos)', () => {
  it('cada lesão leva ao mesmo bloqueio, e a ficha aberta é a dele', () => {
    const session = new AnyBlockPathSession({ screen: 'topography' });
    const tree = session.render();
    const categories = findAll(tree, (el) => el.props.className === 'mb-4 last:mb-0');
    expect(categories.map((category) => textOf(element(category.children[0])))).toEqual(
      TOPOGRAPHY.map(({ title }) => title),
    );

    let paths = 0;
    categories.forEach((category, c) => {
      const buttons = findAll(category, (el) => el.type === 'button');
      const expected = TOPOGRAPHY[c]?.mappings ?? [];
      expect(buttons).toHaveLength(expected.length);
      buttons.forEach((button, b) => {
        const mapping = expected[b];
        if (!mapping) throw new Error(`caminho ${c}.${b}`);
        const [lesion, target] = button.children.map((child) => element(child));
        expect(button.props.disabled, mapping.lesion).toBe(false);
        expect(textOf(element(lesion))).toBe(mapping.lesion);
        expect(textOf(element(target))).toBe(`${mapping.blockName} →`);

        click(button);
        expect(session.state.screen).toBe(`block-${mapping.blockId}`);
        const detail = session.render();
        expect(textOf(findOne(detail, (el) => el.type === 'h2'))).toBe(
          getRegionalBlock(mapping.blockId).name,
        );
        session.state.screen = 'topography';
        paths += 1;
      });
    });
    expect(paths).toBe(14);
  });
});

describe('lista de bloqueios × ANY', () => {
  it('mesmas regiões, nomes, volumes e destino', () => {
    const session = new AnyBlockPathSession({ screen: 'blocklist' });
    const tree = session.render();
    expect(textOf(tree)).toContain('14 bloqueios disponíveis');
    const regions = findAll(tree, (el) => el.props.className === 'mb-5 last:mb-0');
    expect(regions.map((region) => textOf(element(region.children[0])))).toEqual(
      BLOCK_LIST.map(({ region }) => region),
    );

    regions.forEach((region, r) => {
      const ids = BLOCK_LIST[r]?.blockIds ?? [];
      const buttons = findAll(region, (el) => el.type === 'button');
      expect(buttons).toHaveLength(ids.length);
      buttons.forEach((button, b) => {
        const block = getRegionalBlock(ids[b] as RegionalBlockId);
        const [name, volume] = element(button.children[0]).children.map((child) => textOf(child));
        expect(name).toBe(block.listName);
        expect(volume).toBe(block.volume);
        click(button);
        expect(session.state.screen).toBe(`block-${block.id}`);
      });
    });
  });
});

/** Seção recolhível da ficha do ANY pelo título. */
function section(tree: AnyElement, title: string): AnyElement {
  return findOne(tree, (el) => el.type === '@Collapsible' && el.props.title === title);
}

const listItems = (container: AnyElement) =>
  findAll(container, (el) => el.type === 'li').map((li) => textOf(li).trim());

describe.each(REGIONAL_BLOCK_IDS.map((id) => [id] as const))('ficha do bloqueio %s × ANY', (id) => {
  it('nome, região, volume, tipo, indicações, contraindicações, material, técnica e anestésicos', () => {
    const block = getRegionalBlock(id);
    const tree = render({ screen: `block-${id}` });

    expect(textOf(findOne(tree, (el) => el.type === 'h2'))).toBe(block.name);
    const info = findOne(
      tree,
      (el) => el.props.className === 'flex flex-wrap gap-4 text-sm text-text-secondary',
    );
    expect(info.children.map((child) => textOf(child))).toEqual([
      block.region,
      block.volume,
      block.type,
    ]);

    const indications = section(tree, 'Indicações');
    expect(listItems(indications)).toEqual(block.indications.map((text) => `- ${text}`));
    const tip = findAll(indications, (el) => el.type === '@AlertCard')[0];
    expect(tip ? { title: tip.props.title, text: textOf(tip) } : undefined).toEqual(block.tip);

    expect(listItems(section(tree, 'Contraindicações'))).toEqual(
      block.contraindications.map((text) => `- ${text}`),
    );
    expect(listItems(section(tree, 'Material'))).toEqual(block.material);

    const steps = findAll(
      section(tree, 'Técnica'),
      (el) => el.props.className === 'flex items-start gap-3 my-2',
    );
    expect(steps.map((step) => textOf(element(step.children[0])))).toEqual(
      block.technique.map((_step, index) => String(index + 1)),
    );
    expect(steps.map((step) => textOf(element(step.children[1])))).toEqual(block.technique);

    const rows = findOne(section(tree, 'Anestésico local'), (el) => el.type === 'tbody').children;
    expect(rows.map((row) => element(row).children.map((cell) => textOf(cell)))).toEqual(
      block.anesthetics.map(({ drug, concentration, volume }) => [drug, concentration, volume]),
    );
  });
});

/** Opções de um `<select>` do formulário do ANY, sem o "Selecione...". */
function selectOptions(select: AnyElement): string[] {
  return findAll(select, (el) => el.type === 'option')
    .map((option) => (typeof option.props.value === 'string' ? option.props.value : textOf(option)))
    .filter((value) => value !== '');
}

/** Valor que o ANY grava ao tocar no botão (lado, técnica, epinefrina). */
function buttonValues(labels: readonly string[], field: keyof AnyEvoForm): string[] {
  return labels.map((label) => {
    const session = new AnyBlockPathSession({ screen: 'evolution' });
    const button = findOne(session.render(), (el) => el.type === 'button' && textOf(el) === label);
    click(button);
    return String(session.state.evoForm?.[field]);
  });
}

const ANY_EMPTY_FORM: AnyEvoForm = {
  indicação: '',
  tipo: '',
  lado: '',
  transdutor: '',
  agulha: '',
  técnica: '',
  droga: '',
  volume: '',
  dose: '',
  epi: '',
  interc: 'Nenhuma',
  intercDesc: '',
  sensitivo: true,
  motor: false,
  last: true,
  resp: '',
  crm: '',
};

/** Gera a nota no ANY: preenche o formulário e toca em "Gerar texto da evolução". */
function anyEvolutionNote(form: AnyEvoForm): string {
  const session = new AnyBlockPathSession({ screen: 'evolution', evoForm: form });
  const generate = findOne(
    session.render(),
    (el) => el.type === '@Button' && textOf(el) === 'Gerar texto da evolução',
  );
  click(generate);
  expect(session.state.showEvoResult).toBe(true);
  return session.state.evoText ?? '';
}

function toCopilotoForm(form: AnyEvoForm): BlockEvolutionForm {
  const number = (raw: string) => (raw === '' ? null : Number(raw));
  return {
    indication: form.indicação,
    blockType: form.tipo,
    side: form.lado as BlockEvolutionForm['side'],
    transducer: form.transdutor as BlockEvolutionForm['transducer'],
    needle: form.agulha as BlockEvolutionForm['needle'],
    insertion: form.técnica as BlockEvolutionForm['insertion'],
    anesthetic: form.droga,
    volumeMl: number(form.volume),
    doseMg: number(form.dose),
    epinephrine: form.epi as BlockEvolutionForm['epinephrine'],
    complication: form.interc as BlockEvolutionForm['complication'],
    complicationDescription: form.intercDesc,
    sensoryBlock: form.sensitivo,
    motorBlock: form.motor,
    lastSignsAbsent: form.last,
    responsible: form.resp,
    crm: form.crm,
  };
}

/** O Copiloto escreve volume e dose com vírgula decimal; o ANY repete o que o campo numérico deu. */
function withDecimalComma(anyNote: string): string {
  return anyNote.replace(
    /^Volume: (.*) mL \| Dose: (.*) mg$/m,
    (_line, volume: string, dose: string) =>
      `Volume: ${volume.replace('.', ',')} mL | Dose: ${dose.replace('.', ',')} mg`,
  );
}

describe('nota de evolução × ANY', () => {
  it('mesmas opções no formulário', () => {
    const tree = render({ screen: 'evolution' });
    const [types, transducers, needles, drugs] = findAll(tree, (el) => el.type === 'select').map(
      selectOptions,
    );
    expect(types).toEqual(EVOLUTION_BLOCK_TYPES);
    expect(transducers).toEqual(EVOLUTION_TRANSDUCERS);
    expect(needles).toEqual(EVOLUTION_NEEDLES);
    expect(drugs).toEqual(EVOLUTION_ANESTHETICS);

    expect(
      buttonValues(
        EVOLUTION_SIDES.map(({ label }) => label),
        'lado',
      ),
    ).toEqual(EVOLUTION_SIDES.map(({ value }) => value));
    expect(buttonValues(EVOLUTION_INSERTIONS, 'técnica')).toEqual(EVOLUTION_INSERTIONS);
    expect(buttonValues(EVOLUTION_EPINEPHRINE, 'epi')).toEqual(EVOLUTION_EPINEPHRINE);
  });

  it('o formulário em branco do ANY é o do Copiloto', () => {
    const session = new AnyBlockPathSession({ screen: 'evolution' });
    session.render();
    expect(session.state.evoForm).toEqual(ANY_EMPTY_FORM);
  });

  it('mesmo texto em 1.000 formulários aleatórios', () => {
    const random = seededRandom(3399);
    const maybe = <T>(values: readonly T[], empty: T): T =>
      random.next() < 0.2 ? empty : random.pick(values);
    const text = (values: readonly string[]) => maybe(values, '');
    for (let index = 0; index < DIFFERENTIAL_CASES; index += 1) {
      const form: AnyEvoForm = {
        indicação: text([
          'Fratura de colo femoral D',
          'Fratura de costelas 4-7 E',
          'Luxação de ombro',
        ]),
        tipo: text(EVOLUTION_BLOCK_TYPES),
        lado: text(EVOLUTION_SIDES.map(({ value }) => value)),
        transdutor: text(EVOLUTION_TRANSDUCERS),
        agulha: text(EVOLUTION_NEEDLES),
        técnica: text(EVOLUTION_INSERTIONS),
        droga: text(EVOLUTION_ANESTHETICS),
        volume: random.next() < 0.2 ? '' : String(random.onGrid(0.5, 100, 0.5)),
        dose: random.next() < 0.2 ? '' : String(random.onGrid(1, 1500, 0.5)),
        epi: text(EVOLUTION_EPINEPHRINE),
        interc: random.pick(EVOLUTION_COMPLICATIONS),
        intercDesc: text(['Parestesia transitória', 'Punção vascular, aspirado']),
        sensitivo: random.next() < 0.5,
        motor: random.next() < 0.5,
        last: random.next() < 0.5,
        resp: text(['Dra. Ana Souza', 'Dr. João']),
        crm: text(['12345-GO', '000000-SP']),
      };
      expect(buildBlockEvolutionNote(toCopilotoForm(form)), `caso ${index}`).toBe(
        withDecimalComma(anyEvolutionNote(form)),
      );
    }
  });
});
