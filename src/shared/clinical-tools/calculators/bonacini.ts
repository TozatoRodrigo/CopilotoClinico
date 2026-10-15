import type { ScoreCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';
import { choiceItem } from './items';

/** Porte do `bonacini` do ANY. Itens, pontos e faixas iguais; ação alta como sugestão. */
export const BONACINI: ScoreCalculator = {
  kind: 'score',
  id: 'bonacini',
  name: 'Bonacini Cirrhosis Discriminant Score',
  aliases: ['bonacini', 'fibrose', 'cirrose', 'hepatopatia crônica'],
  category: 'Gastro / Hepato',
  description: 'Discrimina a presença de cirrose significativa usando dados laboratoriais simples.',
  reference: {
    why: 'Alternativa não invasiva à biópsia hepática para estimar fibrose significativa.',
    whenToUse:
      'Pacientes com hepatopatia crônica quando a biópsia não está disponível ou não é desejável.',
    pearlsPitfalls: [
      'Escore ≥ 7 sugere cirrose com boa especificidade.',
      'Usa a relação AST/ALT, a contagem de plaquetas e o INR.',
      'Não substitui a biópsia em cenários duvidosos.',
      'Menos validado que FIB-4 e APRI, porém útil como ferramenta complementar.',
    ],
    citation:
      'Bonacini M et al. Utility of a discriminant score for diagnosing advanced fibrosis or cirrhosis in patients with chronic hepatitis C virus infection. Am J Gastroenterol. 1997;92(8):1302-4.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  items: [
    choiceItem('ratio', 'Relação AST/ALT', [
      ['lt1.1', '< 1,1', 0],
      ['1.1-1.4', '1,1–1,4', 1],
      ['gte1.4', '≥ 1,4', 2],
    ]),
    choiceItem('platelets', 'Plaquetas', [
      ['gte280', '≥ 280.000/mm³', 0],
      ['220-279', '220.000–279.000', 1],
      ['160-219', '160.000–219.000', 2],
      ['100-159', '100.000–159.000', 3],
      ['40-99', '40.000–99.000', 4],
      ['lt40', '< 40.000', 5],
    ]),
    choiceItem('inr', 'INR', [
      ['lt1.1', '< 1,1', 0],
      ['1.1-1.4', '1,1–1,4', 1],
      ['gt1.4', '> 1,4', 2],
    ]),
  ],
  interpretation: {
    bands: [
      {
        id: 'baixa',
        upTo: { value: 3, inclusive: true },
        label: 'Baixa probabilidade de cirrose',
        tone: 'neutral',
        action:
          'Fibrose significativa improvável. Monitoramento e investigação conforme indicação clínica.',
      },
      {
        id: 'intermediaria',
        upTo: { value: 6, inclusive: true },
        label: 'Probabilidade intermediária',
        tone: 'attention',
        action:
          'Considere investigação adicional (elastografia, biópsia) para confirmar o grau de fibrose.',
      },
    ],
    otherwise: {
      id: 'alta',
      label: 'Alta probabilidade de cirrose',
      tone: 'critical',
      action:
        'Fibrose avançada/cirrose provável. Considere rastreio de complicações (varizes, HCC).',
    },
  },
};
