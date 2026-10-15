import type { ScoreCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';
import { choiceItem, yesNoItem } from './items';

/** Porte do `glasgowBlatchford` do ANY. Itens, pontos e faixas iguais; ações como sugestão. */
export const GLASGOW_BLATCHFORD: ScoreCalculator = {
  kind: 'score',
  id: 'glasgow-blatchford',
  name: 'Glasgow-Blatchford Score',
  aliases: ['blatchford', 'gbs', 'hda', 'hemorragia digestiva', 'transfusão', 'sangramento gi'],
  category: 'Gastro / Hepato',
  description: 'Necessidade de intervenção (transfusão, endoscopia, cirurgia) em HDA.',
  reference: {
    why: 'Escore 0 identifica pacientes que podem ser manejados ambulatorialmente com segurança (VPN > 99%).',
    whenToUse: 'Triagem de pacientes com HDA no DE, antes da endoscopia.',
    pearlsPitfalls: [
      'Escore 0 = risco muito baixo; considere alta com EDA ambulatorial.',
      'Superior ao Rockall pré-endoscópico para prever necessidade de intervenção.',
      'Inclui hemoglobina e ureia, que devem ser coletadas na admissão.',
      'Melena e síncope são avaliadas clinicamente.',
    ],
    citation:
      'Blatchford O et al. A risk score to predict need for treatment for upper-gastrointestinal haemorrhage. Lancet. 2000;356(9238):1318-21.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  items: [
    choiceItem('bun', 'Ureia sanguínea', [
      ['lt6.5', '< 6,5 mmol/L (< 18,2 mg/dL)', 0],
      ['6.5-7.9', '6,5–7,9 mmol/L (18,2–22,3 mg/dL)', 2],
      ['8-9.9', '8,0–9,9 mmol/L (22,4–27,9 mg/dL)', 3],
      ['10-24.9', '10,0–24,9 mmol/L (28–69,9 mg/dL)', 4],
      ['gte25', '≥ 25 mmol/L (≥ 70 mg/dL)', 6],
    ]),
    choiceItem('hb', 'Hemoglobina (faixas diferentes por sexo)', [
      ['normal', 'Homem ≥ 13 ou mulher ≥ 12 g/dL', 0],
      ['homem-12', 'Homem 12,0–12,9 g/dL', 1],
      ['mulher-10', 'Mulher 10,0–11,9 g/dL', 1],
      ['homem-10', 'Homem 10,0–11,9 g/dL', 3],
      ['lt10', '< 10 g/dL (qualquer sexo)', 6],
    ]),
    choiceItem('sbp', 'Pressão arterial sistólica', [
      ['gte110', '≥ 110 mmHg', 0],
      ['100-109', '100–109 mmHg', 1],
      ['90-99', '90–99 mmHg', 2],
      ['lt90', '< 90 mmHg', 3],
    ]),
    yesNoItem('hr', 'Frequência cardíaca ≥ 100 bpm'),
    yesNoItem('melena', 'Melena'),
    yesNoItem('syncope', 'Síncope', 2),
    yesNoItem('liver', 'Doença hepática', 2),
    yesNoItem('chf', 'Insuficiência cardíaca', 2),
  ],
  interpretation: {
    bands: [
      {
        id: 'muito-baixo',
        upTo: { value: 0, inclusive: true },
        label: 'Muito baixo risco',
        tone: 'neutral',
        action:
          'Pode ser considerado para manejo ambulatorial. VPN > 99% para necessidade de intervenção.',
      },
      {
        id: 'baixo',
        upTo: { value: 5, inclusive: true },
        label: 'Baixo risco',
        tone: 'neutral',
        action: 'Baixa probabilidade de intervenção urgente. Considere EDA dentro de 24 h.',
      },
      {
        id: 'intermediario',
        upTo: { value: 11, inclusive: true },
        label: 'Risco intermediário',
        tone: 'attention',
        action: 'Internação e EDA recomendadas. Considere hemoglobina seriada.',
      },
    ],
    otherwise: {
      id: 'alto',
      label: 'Alto risco',
      tone: 'critical',
      action:
        'Alta probabilidade de necessidade de intervenção. Considere EDA de urgência, transfusão e UTI.',
    },
  },
};
