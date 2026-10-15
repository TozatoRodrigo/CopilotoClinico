import type { ClassificationCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';
import { bandIsResult, choiceItem } from './items';

/**
 * Porte do `forrest` do ANY. O valor de cada classe é um código (Ia = 6 …
 * III = 1), não um ponto, então a tela mostra só a classe. Faixas iguais;
 * ações como sugestão.
 */
export const FORREST: ClassificationCalculator = {
  kind: 'classification',
  id: 'forrest',
  name: 'Classificação de Forrest',
  aliases: ['forrest', 'ulcera', 'sangramento', 'endoscopia', 'hda'],
  category: 'Gastro / Hepato',
  description: 'Classificação endoscópica de úlcera péptica e risco de ressangramento.',
  reference: {
    why: 'Guia a decisão de tratamento endoscópico e a necessidade de internação pós-EDA.',
    whenToUse: 'Classificação durante endoscopia digestiva alta por úlcera péptica sangrante.',
    pearlsPitfalls: [
      'Forrest Ia/Ib = tratamento endoscópico obrigatório.',
      'Forrest IIa (vaso visível) = tratamento endoscópico recomendado.',
      'Forrest IIb (coágulo aderente) = decisão individualizada (remover o coágulo e tratar).',
      'Forrest IIc e III = baixo risco, geralmente sem necessidade de tratamento endoscópico.',
    ],
    citation:
      'Forrest JA et al. Endoscopy in gastrointestinal bleeding. Lancet. 1974;2(7877):394-7.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  items: [
    choiceItem('class', 'Achado endoscópico', [
      ['ia', 'Ia — sangramento ativo em jato (arterial)', 6],
      ['ib', 'Ib — sangramento ativo em gotejamento (babação)', 5],
      ['iia', 'IIa — vaso visível não sangrante', 4],
      ['iib', 'IIb — coágulo aderente', 3],
      ['iic', 'IIc — mancha plana pigmentada (hematina)', 2],
      ['iii', 'III — base limpa (fibrina)', 1],
    ]),
  ],
  formatValue: bandIsResult,
  interpretation: {
    bands: [
      {
        id: 'iii',
        upTo: { value: 1, inclusive: true },
        label: 'Forrest III — base limpa',
        tone: 'neutral',
        action: 'Ressangramento ~5%. Baixo risco. Alta precoce com IBP oral pode ser considerada.',
      },
      {
        id: 'iic',
        upTo: { value: 2, inclusive: true },
        label: 'Forrest IIc — mancha plana',
        tone: 'neutral',
        action: 'Ressangramento ~10%. Tratamento endoscópico geralmente desnecessário.',
      },
      {
        id: 'iib',
        upTo: { value: 3, inclusive: true },
        label: 'Forrest IIb — coágulo aderente',
        tone: 'attention',
        action: 'Ressangramento ~22%. Considere remoção do coágulo e tratamento endoscópico.',
      },
      {
        id: 'iia',
        upTo: { value: 4, inclusive: true },
        label: 'Forrest IIa — vaso visível',
        tone: 'critical',
        action: 'Ressangramento ~43%. Tratamento endoscópico recomendado.',
      },
    ],
    otherwise: {
      id: 'i',
      label: 'Forrest I — sangramento ativo',
      tone: 'critical',
      action:
        'Ressangramento ~55–90%. Tratamento endoscópico obrigatório. Considere IBP IV em dose alta.',
    },
  },
};
