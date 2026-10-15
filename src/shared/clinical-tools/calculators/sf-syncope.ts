import type { ScoreCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';
import { criteriaCount, yesNoItem } from './items';

/** Porte do `sfSyncope` do ANY (regra CHESS). Conta, faixas e ações iguais. */
export const SF_SYNCOPE: ScoreCalculator = {
  kind: 'score',
  id: 'sf-syncope',
  name: 'San Francisco Syncope Rule',
  aliases: ['sfsyncope', 'chess', 'san francisco', 'sincope', 'alto risco sincope'],
  category: 'Cardiologia / SCA',
  description: 'Identifica pacientes com síncope de alto risco no DE (regra CHESS).',
  reference: {
    why: 'Regra simples para triagem rápida de síncope no DE: qualquer critério positivo indica risco de evento grave em 30 dias.',
    whenToUse: 'Triagem de pacientes com síncope no DE, para decidir entre alta e investigação.',
    pearlsPitfalls: [
      'CHESS: Congestive heart failure, Hematocrit < 30%, ECG abnormal, Shortness of breath, Systolic BP < 90.',
      'Sensibilidade ~96–98%, mas especificidade baixa (~56%).',
      'Validação externa variável: use como ferramenta de triagem, não como decisão final.',
      'Qualquer critério positivo = alto risco. Todos negativos = considere alta com seguimento.',
    ],
    citation:
      'Quinn JV et al. Derivation of the San Francisco Syncope Rule to predict patients with short-term serious outcomes. Ann Emerg Med. 2004;43(2):224-32.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  items: [
    yesNoItem('chf', 'História de insuficiência cardíaca congestiva (C)'),
    yesNoItem('hematocrit', 'Hematócrito < 30% (H)'),
    yesNoItem('ecg', 'ECG anormal (novo ou não sinusal) (E)'),
    yesNoItem('sob', 'Dispneia (S)'),
    yesNoItem('sbp', 'PAS < 90 mmHg na triagem (S)'),
  ],
  formatValue: criteriaCount,
  interpretation: {
    bands: [
      {
        id: 'baixo',
        upTo: { value: 0, inclusive: true },
        label: 'Baixo risco',
        tone: 'neutral',
        action:
          'Nenhum critério CHESS positivo. Risco de evento grave em 30 dias < 2%. Considere alta com seguimento.',
      },
    ],
    otherwise: {
      id: 'alto',
      label: 'Alto risco',
      tone: 'critical',
      action:
        'Pelo menos 1 critério CHESS positivo. Risco de evento grave em 30 dias ~12%. Considere investigação complementar e internação.',
    },
  },
};
