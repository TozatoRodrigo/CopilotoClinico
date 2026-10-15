import { byRule, type ClassificationCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';
import { bandIsResult, choiceItem, yesNoItem } from './items';

/** Classe de Mississippi pelas plaquetas: 0 sem critério … 3 = Classe 1 (≤ 50 mil). */
const PLATELETS = { none: 0, class2: 2, class1: 3 } as const;

/**
 * Porte do `hellpCriteria` do ANY (Mississippi). A soma não decide: a regra
 * lê as plaquetas, o LDH e a TGO, na mesma ordem de lá. Ações como sugestão.
 */
export const HELLP: ClassificationCalculator = {
  kind: 'classification',
  id: 'hellp',
  name: 'Critérios de HELLP (classificação de Mississippi)',
  aliases: ['hellp', 'pre-eclampsia', 'síndrome hellp', 'mississippi', 'plaquetas', 'ldh', 'tgo'],
  category: 'Obstetrícia',
  description: 'Classificação de gravidade da síndrome HELLP pela classificação de Mississippi.',
  reference: {
    why: 'Classifica a gravidade da síndrome HELLP para guiar o manejo e a decisão do parto.',
    whenToUse: 'Gestantes com suspeita de pré-eclâmpsia grave ou síndrome HELLP.',
    pearlsPitfalls: [
      'HELLP: Hemolysis, Elevated Liver enzymes, Low Platelets.',
      'Mississippi Classe 1 (mais grave): plaquetas ≤ 50.000.',
      'Mississippi Classe 2: plaquetas 50.000–100.000.',
      'Mississippi Classe 3: plaquetas 100.000–150.000.',
      'Critérios laboratoriais: plaquetas < 150.000, LDH > 600 U/L, TGO > 70 U/L.',
      'Tratamento definitivo: parto. Corticoide para maturação fetal se < 34 semanas.',
    ],
    citation:
      'Martin JN Jr et al. The spectrum of severe preeclampsia: comparative analysis by HELLP (hemolysis, elevated liver enzyme levels, and low platelet count) syndrome classification. Am J Obstet Gynecol. 1999;180(6 Pt 1):1373-84.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  items: [
    choiceItem('platelets', 'Contagem de plaquetas', [
      ['gte150', '≥ 150.000/mm³ — sem critério', PLATELETS.none],
      ['100-150', '100.000–150.000/mm³ — Classe 3', 1],
      ['50-100', '50.000–100.000/mm³ — Classe 2', PLATELETS.class2],
      ['lte50', '≤ 50.000/mm³ — Classe 1', PLATELETS.class1],
    ]),
    yesNoItem('ldh', 'LDH > 600 U/L'),
    yesNoItem('tgo', 'TGO > 70 U/L'),
  ],
  formatValue: bandIsResult,
  interpretation: byRule(
    [
      {
        id: 'sem-criterio',
        label: 'Sem critério de HELLP (plaquetas normais)',
        tone: 'neutral',
        action:
          'Plaquetas ≥ 150.000. Não preenche critério de HELLP. Considere investigar outras causas se a clínica for sugestiva.',
      },
      {
        id: 'incompleta',
        label: 'HELLP incompleta',
        tone: 'attention',
        action:
          'Plaquetopenia isolada, sem elevação de LDH ou TGO. Considere HELLP incompleta e laboratório seriado.',
      },
      {
        id: 'classe-1',
        label: 'HELLP — Mississippi Classe 1 (mais grave)',
        tone: 'critical',
        action:
          'Plaquetas ≤ 50.000. Classe mais grave. Considere parto imediato e suporte transfusional; risco de CIVD.',
      },
      {
        id: 'classe-2',
        label: 'HELLP — Mississippi Classe 2',
        tone: 'critical',
        action:
          'Plaquetas 50.000–100.000. Considere parto, corticoide se < 34 semanas e monitoramento intensivo.',
      },
      {
        id: 'classe-3',
        label: 'HELLP — Mississippi Classe 3',
        tone: 'attention',
        action:
          'Plaquetas 100.000–150.000. Forma mais branda. Considere laboratório seriado e parto conforme indicação obstétrica.',
      },
    ],
    (_value, values) => {
      if (values.platelets === PLATELETS.none) return 'sem-criterio';
      if (!values.ldh && !values.tgo) return 'incompleta';
      if (values.platelets === PLATELETS.class1) return 'classe-1';
      if (values.platelets === PLATELETS.class2) return 'classe-2';
      return 'classe-3';
    },
  ),
};
