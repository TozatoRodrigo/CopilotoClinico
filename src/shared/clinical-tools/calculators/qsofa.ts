import type { ScoreCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';
import { yesNoItem } from './items';

/** Porte do `qsofa` do ANY. Conta, faixas e ações iguais. */
export const QSOFA: ScoreCalculator = {
  kind: 'score',
  id: 'qsofa',
  name: 'qSOFA',
  aliases: ['qsofa', 'quick sofa', 'sepse', 'sepsis', 'triagem sepse'],
  category: 'Respiratório / Sepse',
  description: 'Triagem rápida de sepse fora da UTI.',
  reference: {
    why: 'Rápido (sem laboratório), identifica pacientes com infecção em risco de desfecho ruim.',
    whenToUse: 'Triagem à beira-leito de pacientes com infecção suspeitada fora da UTI.',
    pearlsPitfalls: [
      'qSOFA ≥ 2: investigar disfunção orgânica (SOFA completo).',
      'NÃO é critério diagnóstico de sepse; é ferramenta de triagem.',
      'Sensibilidade moderada: não usar para excluir sepse.',
      'Três critérios: FR ≥ 22, PAS ≤ 100, alteração do nível de consciência (GCS < 15).',
    ],
    citation:
      'Singer M et al. The Third International Consensus Definitions for Sepsis and Septic Shock (Sepsis-3). JAMA. 2016;315(8):801-10.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-14',
    review: { status: 'pendente' },
  },
  items: [
    yesNoItem('rr', 'Frequência respiratória ≥ 22 irpm'),
    yesNoItem('sbp', 'Pressão arterial sistólica ≤ 100 mmHg'),
    yesNoItem('gcs', 'Alteração do nível de consciência (GCS < 15)'),
  ],
  interpretation: {
    bands: [
      {
        id: 'baixo',
        upTo: { value: 2, inclusive: false },
        label: 'qSOFA < 2',
        tone: 'neutral',
        action:
          'Baixo risco pela triagem. Não exclui sepse: manter vigilância clínica se houver suspeita de infecção.',
      },
    ],
    otherwise: {
      id: 'alto',
      label: 'qSOFA ≥ 2',
      tone: 'critical',
      action:
        'Alto risco de desfecho ruim. Avaliar disfunção orgânica (SOFA). Considere coleta de lactato, hemoculturas e início precoce de antibióticos.',
    },
  },
};
