import { describe, expect, it } from 'vitest';
import {
  ANY_CARD_TOOL_IDS,
  type KnowledgeCardContent,
} from '../../../shared/contracts/knowledge-cards';
import { ACLS_MEDICATIONS } from '../../../shared/clinical-tools/acls/content';
import { AIRWAY_DRUGS } from '../../../shared/clinical-tools/airway/drugs';
import { LOCAL_ANESTHETICS } from '../../../shared/clinical-tools/blocks/doses';
import { INFUSION_DRUGS } from '../../../shared/clinical-tools/infusions/drugs';
import { BOLUS_DRUGS } from '../../../shared/clinical-tools/pediatrics/bolus-drugs';
import { PEDIATRIC_INFUSIONS } from '../../../shared/clinical-tools/pediatrics/infusions';
import { SUBCUTANEOUS_MEDICATIONS } from '../../../shared/clinical-tools/palliative/hypodermoclysis';
import { REGIMENS } from '../../../shared/clinical-tools/sedation/doses';
import { ANTIDOTES } from '../../../shared/clinical-tools/toxicology/antidotes';
import { prepareCardContent } from '../card-sources';
import { anyCardDrafts, resolveToolSource } from './any-card-catalog';
import {
  anyCardContentInput,
  anyCardSourceText,
  anySourceKey,
  parseAnyProvenance,
  type AnyCardDraft,
} from './any-card-draft';
import { prepareAnyCards } from './any-card-import';
import { parseAclsMedication } from './mappers/palliative-acls';
import { EMPTY_FINDINGS } from './review-findings';

/**
 * CC-405 — o mapeamento do motor para cartão: toda dose de cada ferramenta
 * vira cartão com a fonte do ANY e a dose estruturada certa, e todo cartão
 * passa na mesma checagem de citação do rascunho da IA.
 */

function prepared(draft: AnyCardDraft): KnowledgeCardContent {
  const result = prepareCardContent(anyCardContentInput(draft), new Map(), { institutionId: null });
  if (!result.ok) throw new Error(`${draft.itemId}: ${JSON.stringify(result.issues)}`);
  return result.content;
}

function draftOf(itemId: string): AnyCardDraft {
  const draft = anyCardDrafts().find((candidate) => candidate.itemId === itemId);
  if (!draft) throw new Error(`sem rascunho ${itemId}`);
  return draft;
}

function doses(draft: AnyCardDraft) {
  return prepared(draft).claims.flatMap((claim) => (claim.dose ? [claim.dose] : []));
}

describe('catálogo do ANY (CC-405)', () => {
  it('gera ao menos 100 cartões, todos aceitos pela checagem de citação', () => {
    const { cards, rejections } = prepareAnyCards(null, EMPTY_FINDINGS);
    expect(rejections).toEqual([]);
    expect(cards.length).toBeGreaterThanOrEqual(100);
    expect(new Set(cards.map((card) => card.sourceKey)).size).toBe(cards.length);
  });

  it('cobre as dez ferramentas pedidas, cada uma com dose estruturada', () => {
    for (const toolId of ANY_CARD_TOOL_IDS) {
      const drafts = anyCardDrafts(toolId);
      expect(drafts.length, toolId).toBeGreaterThan(0);
      expect(
        drafts.some((draft) => draft.facts.some((fact) => fact.dose)),
        toolId,
      ).toBe(true);
    }
  });

  it('é determinístico: o mesmo motor dá o mesmo conteúdo e o mesmo hash', () => {
    const first = prepareAnyCards('infusoes', EMPTY_FINDINGS).cards.map(
      (card) => card.contentSha256,
    );
    const second = prepareAnyCards('infusoes', EMPTY_FINDINGS).cards.map(
      (card) => card.contentSha256,
    );
    expect(second).toEqual(first);
  });

  it('a fonte é o item do motor com a referência e a procedência do ANY (versão e commit)', () => {
    const content = prepared(draftOf('acls/epinefrina'));
    expect(content.sources).toHaveLength(1);
    const [source] = content.sources;
    expect(source).toMatchObject({
      kind: 'clinical_tool',
      key: 'S1',
      toolItemId: 'acls/epinefrina',
      reference: expect.stringContaining('AHA 2025'),
      title: expect.stringContaining('AHA 2025'),
      origin: expect.stringContaining('AclsGuide.tsx'),
      contentVersion: '1.0.0',
      anyVersion: 'v4',
      anyCommit: '95c8fba',
      sourceVersion: 'ANY App v4 (95c8fba), conteúdo 1.0.0',
    });
  });

  it('sem referência no ANY, a fonte diz que não há (achado 1.9 das infusões)', () => {
    const [source] = prepared(draftOf('infusoes/noradrenalina')).sources;
    expect(source).toMatchObject({
      reference: null,
      title: expect.stringContaining('sem referência'),
    });
    expect(anyCardSourceText(draftOf('infusoes/noradrenalina'))).toContain(
      'o ANY não cita referência bibliográfica',
    );
  });

  it('a chave do cartão é estável e o servidor resolve a fonte pelo id do item', () => {
    expect(anySourceKey('infusoes/noradrenalina')).toBe('any:infusoes/noradrenalina');
    const resolved = resolveToolSource('infusoes/noradrenalina');
    expect(resolved?.text).toContain('0,01 - 3 mcg/kg/min');
    expect(resolveToolSource('infusoes/nao-existe')).toBeUndefined();
  });

  it('lê versão e commit da procedência do motor', () => {
    expect(parseAnyProvenance('ANY App v4 · PedGuide.tsx (95c8fba)')).toEqual({
      anyVersion: 'v4',
      anyCommit: '95c8fba',
    });
    expect(
      parseAnyProvenance('ANY App v4 · KetoPath (ketoData.ts, ketoCalc.ts e telas, 95c8fba), spec'),
    ).toEqual({ anyVersion: 'v4', anyCommit: '95c8fba' });
    expect(parseAnyProvenance('outra origem')).toEqual({ anyVersion: null, anyCommit: null });
  });
});

describe('Infusões', () => {
  it('cada droga e cada modo vira cartão com a faixa da tela como dose', () => {
    for (const drug of INFUSION_DRUGS) {
      for (const mode of drug.modes ?? [null]) {
        const itemId = mode ? `infusoes/${drug.id}-${mode.id}` : `infusoes/${drug.id}`;
        const [dose] = doses(draftOf(itemId));
        expect(dose?.drug, itemId).toBe(drug.name);
        if (mode) expect(dose?.amount).toBe(mode.rangeLabel);
      }
    }
    expect(doses(draftOf('infusoes/noradrenalina'))[0]?.amount).toBe('0,01 - 3 mcg/kg/min');
  });

  it('o bolus do modo traz via, repetição e teto do texto do ANY', () => {
    const bolus = doses(draftOf('infusoes/midazolam-status')).find((dose) => dose.route);
    expect(bolus).toMatchObject({
      drug: 'Midazolam',
      amount: '0,2 mg/kg',
      route: 'IV',
      frequency: '5/5 min',
      maxDose: '20 mg',
    });
  });

  it('heparina por indicação, com o teto do bolus e da infusão', () => {
    expect(doses(draftOf('infusoes/heparina-sca')).slice(0, 2)).toMatchObject([
      { drug: 'Heparina não fracionada', amount: '60 UI/kg', maxDose: '4.000 UI' },
      { drug: 'Heparina não fracionada', amount: '12 UI/kg/h', maxDose: '1.000 UI/h' },
    ]);
  });
});

describe('Pediatria', () => {
  it('cada droga em bolus vira cartão com a dose do ANY e o teto que a conta aplica', () => {
    expect(BOLUS_DRUGS).toHaveLength(65);
    for (const drug of BOLUS_DRUGS) {
      const [dose] = doses(draftOf(`pediatria/bolus-${drug.id.replace(/_/g, '-')}`));
      expect(dose?.amount, drug.id).toBe(drug.doseLabel);
    }
    expect(doses(draftOf('pediatria/bolus-epinefrina-iv'))[0]).toMatchObject({
      drug: 'EPINEFRINA IV/IO',
      amount: '0,01 mg/kg',
      maxDose: '1 mg',
    });
    expect(doses(draftOf('pediatria/bolus-adenosina'))[0]?.maxDose).toBe(
      '6 mg (1ª dose) / 12 mg (2ª dose)',
    );
  });

  it('o fármaco da dose sai sem o complemento ("N-ACETILCISTEÍNA — Fase 1")', () => {
    expect(doses(draftOf('pediatria/bolus-nac-fase1'))[0]).toMatchObject({
      drug: 'N-ACETILCISTEÍNA',
      amount: '150 mg/kg',
      maxDose: '15000 mg',
    });
  });

  it('cada infusão contínua vira cartão com a faixa de dose', () => {
    for (const infusion of PEDIATRIC_INFUSIONS) {
      const [dose] = doses(draftOf(`pediatria/infusao-${infusion.id.replace(/_/g, '-')}`));
      expect(dose?.amount, infusion.id).toMatch(/^\d/);
      expect(dose?.amount).toContain(infusion.unit);
    }
  });

  it('dose pela idade traz cada faixa como dose própria', () => {
    expect(doses(draftOf('pediatria/bolus-loratadina')).map((dose) => dose.amount)).toEqual([
      '5 mg ou 10 mg',
      '5 mg',
      '10 mg',
    ]);
  });
});

describe('Via aérea e Sedação', () => {
  it('cada droga da sequência rápida tem a régua de dose por kg', () => {
    for (const drug of AIRWAY_DRUGS) {
      expect(doses(draftOf(`via-aerea/${drug.id}`))[0]?.amount, drug.id).toContain(drug.rateUnit);
    }
    expect(doses(draftOf('via-aerea/etomidato'))[0]?.amount).toBe('0,2 - 0,4 mg/kg');
  });

  it('cada droga de cada regime de sedação aparece com dose e via', () => {
    const all = anyCardDrafts('sedacao').flatMap(doses);
    for (const regimen of Object.values(REGIMENS)) {
      expect(
        all.some((dose) => dose.route === regimen.route),
        regimen.id,
      ).toBe(true);
    }
    expect(doses(draftOf('sedacao/agitacao-nao-urgente'))).toMatchObject([
      { drug: 'Haloperidol', amount: '5 mg', route: 'IM' },
      { drug: 'Prometazina', amount: '50 mg', route: 'IM' },
    ]);
  });
});

describe('Toxicologia e Bloqueios', () => {
  it('um cartão por antídoto do guia; as linhas de dose viram dose estruturada', () => {
    expect(anyCardDrafts('toxicologia')).toHaveLength(ANTIDOTES.length);
    expect(doses(draftOf('toxicologia/antidoto-naloxona'))).toMatchObject([
      { drug: 'Naloxona', amount: '0,04 a 0,4 mg', route: 'IV' },
      { drug: 'Naloxona', amount: 'até 2 mg', route: 'IV' },
    ]);
  });

  it('a dose é da droga que a linha ou a seção nomeia, não sempre a do card', () => {
    const gluconato = doses(draftOf('toxicologia/antidoto-gluconato')).map((dose) => dose.drug);
    expect(gluconato).toContain('Cloreto de cálcio 10%');
    const fomepizol = doses(draftOf('toxicologia/antidoto-fomepizol'));
    expect(fomepizol.map((dose) => dose.drug)).toEqual([
      'Fomepizol',
      'Fomepizol',
      'Fomepizol',
      'Etanol',
      'Etanol',
    ]);
    expect(fomepizol[1]).toMatchObject({ amount: '10 mg/kg', frequency: 'a cada 12h' });
  });

  it('linha de limite ou de diluição não vira dose ("Máximo: 3-5 mg", "Diluir em SF")', () => {
    expect(doses(draftOf('toxicologia/antidoto-flumazenil')).map((dose) => dose.amount)).toEqual([
      '0,2 mg',
      '0,3 mg',
    ]);
    expect(doses(draftOf('toxicologia/antidoto-azulmetileno')).map((dose) => dose.amount)).toEqual([
      '1-2 mg/kg',
    ]);
  });

  it('dose máxima de cada anestésico local, com e sem epinefrina, e o LAST', () => {
    for (const anesthetic of LOCAL_ANESTHETICS) {
      expect(doses(draftOf(`bloqueios/dose-maxima-${anesthetic.id}`))).toHaveLength(2);
    }
    expect(doses(draftOf('bloqueios/dose-maxima-lidocaina'))[0]).toMatchObject({
      drug: 'Lidocaína',
      maxDose: '4,5 mg/kg',
    });
    expect(doses(draftOf('bloqueios/last'))[0]).toMatchObject({
      amount: '1,5 mL/kg',
      maxDose: '12 mL/kg',
    });
  });
});

describe('Paliativos, ACLS, Dengue e CAD', () => {
  it('conversor de opioides e medicações por hipodermóclise', () => {
    expect(doses(draftOf('paliativos/conversao-opioides')).map((dose) => dose.drug)).toContain(
      'Tramadol VO',
    );
    for (const medication of SUBCUTANEOUS_MEDICATIONS) {
      const itemId = `paliativos/hipodermoclise-${medication.name
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')}`;
      const draft = draftOf(itemId);
      const [dose] = doses(draft);
      if (/\d/.test(medication.dose)) expect(dose?.amount, medication.name).toBe(medication.dose);
      expect(draft.reference).toContain('Azevedo');
    }
  });

  it('cada medicação da parada com dose, via e a citação da AHA', () => {
    for (const medication of ACLS_MEDICATIONS) {
      const parsed = parseAclsMedication(medication);
      const all = anyCardDrafts('acls').flatMap(doses);
      expect(all, medication.id).toContainEqual(expect.objectContaining(parsed));
    }
    expect(doses(draftOf('acls/epinefrina'))[0]).toMatchObject({
      drug: 'Epinefrina',
      amount: '1 mg',
      route: 'IV/IO',
      frequency: 'A cada 3-5 min',
    });
  });

  it('dengue: a hidratação de cada grupo, sem o volume que depende do peso', () => {
    expect(doses(draftOf('dengue/grupo-c'))[0]).toMatchObject({
      drug: 'SF 0,9% ou RL',
      amount: '10 mL/kg/h',
      frequency: 'por 2 horas',
    });
    expect(doses(draftOf('dengue/grupo-d')).map((dose) => dose.amount)).toContain('0,5-1 g/kg');
    for (const draft of anyCardDrafts('dengue')) {
      expect(anyCardSourceText(draft)).not.toMatch(/[{}]/);
    }
  });

  it('CAD: insulina, potássio, fluidos e fosfato com a referência da marca de fonte', () => {
    expect(doses(draftOf('cad-ehh/insulina-cad'))[0]).toMatchObject({
      drug: 'Insulina regular',
      amount: '0,1 U/kg/h',
    });
    expect(doses(draftOf('cad-ehh/potassio'))[0]?.amount).toBe('10 a 20 mEq de KCl por hora');
    expect(draftOf('cad-ehh/potassio').reference).toContain('UpToDate');
    expect(anyCardSourceText(draftOf('cad-ehh/insulina-cad'))).not.toMatch(/\[(ADA|UTD|JBDS)\]/);
  });
});
