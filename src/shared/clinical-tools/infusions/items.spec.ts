import { describe, expect, it } from 'vitest';
import { buildInfusionNote } from './chart-note';
import { doseSettings, describeDoseStatus } from './dose';
import { getInfusionDrug, INFUSION_CATEGORIES, INFUSION_DRUGS } from './drugs';
import {
  findInfusionItem,
  infusionHref,
  INFUSION_ITEMS,
  readInfusionParam,
  searchInfusionItems,
} from './items';

function params(query: string) {
  return new URLSearchParams(query);
}

describe('drogas', () => {
  it('são 16, em quatro grupos, com id de URL único', () => {
    expect(INFUSION_DRUGS).toHaveLength(16);
    const ids = INFUSION_DRUGS.map(({ id }) => id);
    expect(new Set(ids).size).toBe(16);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
    expect(new Set(INFUSION_DRUGS.map(({ category }) => category))).toEqual(
      new Set(INFUSION_CATEGORIES.map(({ id }) => id)),
    );
  });

  it('trazem procedência e revisão clínica', () => {
    for (const drug of INFUSION_DRUGS) {
      expect(drug.provenance.source).not.toBe('');
      expect(drug.provenance.version).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it('têm a dose padrão de cada modo dentro da faixa do modo', () => {
    for (const drug of INFUSION_DRUGS) {
      for (const mode of drug.modes ?? []) {
        expect(mode.doseDefault, `${drug.id}/${mode.id}`).toBeGreaterThanOrEqual(mode.doseMin);
        expect(mode.doseDefault, `${drug.id}/${mode.id}`).toBeLessThanOrEqual(mode.doseMax);
      }
    }
  });

  it('marcam como padrão a diluição igual à concentração da droga', () => {
    for (const drug of INFUSION_DRUGS) {
      const standard = drug.dilutions?.filter(({ isDefault }) => isDefault) ?? [];
      if (drug.dilutions)
        expect(standard.map(({ concentration }) => concentration)).toEqual([drug.concentration]);
    }
  });
});

describe('searchInfusionItems', () => {
  it('acha por nome, sinônimo e id, sem acento', () => {
    expect(searchInfusionItems('nora').map(({ id }) => id)).toEqual(['noradrenalina']);
    expect(searchInfusionItems('CISATRACURIO').map(({ id }) => id)).toEqual(['cisatracurio']);
    expect(searchInfusionItems('precedex').map(({ id }) => id)).toEqual(['dexmedetomidina']);
  });

  it('acha os protocolos de heparina e insulina (CC-312)', () => {
    expect(searchInfusionItems('ttpa').map(({ id }) => id)).toEqual(['heparina']);
    expect(searchInfusionItems('glicemia').map(({ id }) => id)).toEqual(['insulina']);
    expect(readInfusionParam(params('drug=heparina')).item?.kind).toBe('heparina');
  });

  it('busca vazia não filtra nada', () => {
    expect(searchInfusionItems('  ')).toEqual([]);
  });
});

describe('readInfusionParam', () => {
  it('lê ?droga=<id>', () => {
    expect(readInfusionParam(params('droga=noradrenalina'))).toMatchObject({
      requested: 'noradrenalina',
      item: { id: 'noradrenalina' },
      legacy: false,
    });
  });

  it('lê o ?drug= dos links do ANY e marca como legado', () => {
    expect(readInfusionParam(params('drug=dobutamina'))).toMatchObject({
      item: { id: 'dobutamina' },
      legacy: true,
    });
    // Com os dois, vale o novo.
    expect(readInfusionParam(params('droga=dopamina&drug=dobutamina'))).toMatchObject({
      item: { id: 'dopamina' },
      legacy: false,
    });
  });

  it('aceita caixa, acento e sinônimo exato', () => {
    expect(readInfusionParam(params('droga=Cisatrac%C3%BArio')).item?.id).toBe('cisatracurio');
    expect(readInfusionParam(params('droga=nora')).item?.id).toBe('noradrenalina');
  });

  it('devolve o pedido sem item quando a droga não existe, e nada sem parâmetro', () => {
    expect(readInfusionParam(params('droga=xpto'))).toEqual({
      requested: 'xpto',
      item: null,
      legacy: false,
      indication: null,
      group: null,
    });
    expect(readInfusionParam(params(''))).toEqual({
      requested: null,
      item: null,
      legacy: false,
      indication: null,
      group: null,
    });
  });
});

describe('infusionHref / findInfusionItem', () => {
  it('monta o endereço da tela com o item aberto', () => {
    expect(infusionHref('noradrenalina')).toBe('/ferramentas/infusoes?droga=noradrenalina');
    expect(infusionHref(null)).toBe('/ferramentas/infusoes');
  });

  it('acha cada item pelo id', () => {
    for (const item of INFUSION_ITEMS) expect(findInfusionItem(item.id)).toBe(item);
    expect(findInfusionItem(undefined)).toBeUndefined();
  });
});

describe('buildInfusionNote', () => {
  it('monta o texto do prontuário com dose, mL/h, situação, peso, diluição e faixa', () => {
    const drug = getInfusionDrug('midazolam');
    if (!drug) throw new Error('sem midazolam');
    const settings = doseSettings(drug, 'status');
    expect(
      buildInfusionNote({
        drug,
        settings,
        dose: 0.5,
        mlh: 35,
        detail: describeDoseStatus(0.5, settings),
        weightKg: 70,
        dilution: drug.presentation,
        concentration: 1,
        patientBolus: '14 mg',
      }),
    ).toBe(
      [
        'Midazolam: 0,50 mg/kg/h = 35,0 mL/h — Na faixa.',
        '- Peso: 70 kg',
        '- Modo: Status epilepticus',
        '- Diluição: 250 mg (5 amp 10mL — 5mg/mL) + SF 0,9% 200 mL = 250 mL (1 mg/mL)',
        '- Faixa terapêutica: 0,05 - 2,0 mg/kg/h',
        '- Bolus para este peso: 14 mg',
      ].join('\n'),
    );
  });
});
