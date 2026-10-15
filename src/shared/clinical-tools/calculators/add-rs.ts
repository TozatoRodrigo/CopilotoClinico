import type { ScoreCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';
import { binaryItem } from './items';

/** Porte do `addRs` do ANY. Domínios, pontos e faixas iguais; só acentuação corrigida. */
export const ADD_RS: ScoreCalculator = {
  kind: 'score',
  id: 'add-rs',
  name: 'ADD-RS (Aortic Dissection Detection Risk Score)',
  aliases: ['add', 'disseccao', 'aórtica', 'dissecção aórtica', 'dor torácica rasgando'],
  category: 'Vascular',
  description: 'Estratificação de risco pré-teste para dissecção aguda de aorta.',
  reference: {
    why: 'Guia a necessidade de angioTC ou D-dímero na investigação de dissecção aórtica no DE.',
    whenToUse: 'Pacientes com dor torácica, dorsal ou abdominal aguda sugestiva de dissecção.',
    pearlsPitfalls: [
      'ADD-RS 0 + D-dímero negativo: pode excluir dissecção com segurança.',
      'ADD-RS ≥ 1: angioTC recomendada (D-dímero não exclui).',
      'Avalia 3 domínios: condições de alto risco, dor de alto risco e achados de alto risco.',
      'Cada domínio pontua 0 ou 1; escore total de 0 a 3.',
      'Sensibilidade elevada quando combinado com D-dímero.',
    ],
    citation:
      'Rogers AM et al. Sensitivity of the aortic dissection detection risk score (ADD-RS), a novel guideline-based tool for identification of acute aortic dissection at initial presentation. Circulation. 2011;123(20):2213-8.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  items: [
    binaryItem(
      'condition',
      'Condições de alto risco (qualquer): Marfan, Ehlers-Danlos, história familiar de doença aórtica, valva aórtica bicúspide, cirurgia cardíaca ou aórtica prévia, aneurisma de aorta conhecido',
      ['Nenhuma', 'Pelo menos 1 presente'],
    ),
    binaryItem(
      'pain',
      'Dor de alto risco (qualquer): dor torácica/dorsal/abdominal de início abrupto, de forte intensidade, tipo "rasgando" ou "dilacerando"',
      ['Nenhuma', 'Pelo menos 1 presente'],
    ),
    binaryItem(
      'exam',
      'Achados de alto risco ao exame (qualquer): déficit de perfusão (assimetria de PA > 20 mmHg, déficit de pulso, déficit neurológico focal), sopro diastólico aórtico novo, hipotensão/choque',
      ['Nenhum', 'Pelo menos 1 presente'],
    ),
  ],
  interpretation: {
    bands: [
      {
        id: '0',
        upTo: { value: 0, inclusive: true },
        label: 'ADD-RS 0 — baixo risco',
        tone: 'neutral',
        action:
          'Se D-dímero < 500 ng/mL: dissecção aórtica excluída com segurança. Se D-dímero positivo: considere angioTC.',
      },
      {
        id: '1',
        upTo: { value: 1, inclusive: true },
        label: 'ADD-RS 1 — risco intermediário',
        tone: 'attention',
        action:
          'D-dímero pode ser considerado, mas a angioTC é preferida. Se D-dímero positivo: angioTC obrigatória.',
      },
    ],
    otherwise: {
      id: '2',
      label: 'ADD-RS ≥ 2 — alto risco',
      tone: 'critical',
      action: 'AngioTC recomendada diretamente, sem aguardar D-dímero. D-dímero não exclui.',
    },
  },
};
