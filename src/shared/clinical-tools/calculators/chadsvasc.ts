import type { ScoreCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';
import { yesNoItem } from './items';

/** Porte do `chadsVasc` do ANY. Textos com acentuação corrigida; conta e faixas iguais. */
export const CHADSVASC: ScoreCalculator = {
  kind: 'score',
  id: 'chadsvasc',
  name: 'CHA2DS2-VASc',
  aliases: ['chads', 'chadsvasc', 'fibrilação atrial', 'fa', 'avc', 'anticoagulação'],
  category: 'Cardiologia / SCA',
  description: 'Risco de AVC em fibrilação atrial para decisão de anticoagulação.',
  reference: {
    why: 'Substituiu o CHADS2, com melhor discriminação em pacientes de baixo risco. Recomendado pelas diretrizes ESC e AHA.',
    whenToUse:
      'Todo paciente com fibrilação atrial não valvar, para decidir sobre anticoagulação crônica.',
    pearlsPitfalls: [
      'Sexo feminino só pontua se houver outro fator de risco; isoladamente não indica anticoagulação.',
      'Escore 0 em homens (ou 1 em mulheres só pelo sexo): anticoagulação não indicada.',
      'Escore ≥ 2 em homens ou ≥ 3 em mulheres: anticoagulação recomendada.',
      'Sempre avaliar o HAS-BLED em conjunto para balancear risco e benefício.',
    ],
    citation:
      'Lip GY et al. Refining clinical risk stratification for predicting stroke and thromboembolism in atrial fibrillation. Chest. 2010;137(2):263-72.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-14',
    review: { status: 'pendente' },
  },
  items: [
    yesNoItem('chf', 'ICC / disfunção ventricular (C)'),
    yesNoItem('htn', 'Hipertensão (H)'),
    yesNoItem('dm', 'Diabetes mellitus (D)'),
    yesNoItem('stroke', 'AVC / AIT / tromboembolismo prévio (S2)', 2),
    yesNoItem('vascular', 'Doença vascular (IAM prévio, DAP, placa aórtica) (V)'),
    {
      id: 'idade',
      label: 'Idade (A / A2)',
      options: [
        { id: 'lt65', label: '< 65 anos', points: 0 },
        { id: '65-74', label: '65–74 anos', points: 1 },
        { id: 'gte75', label: '≥ 75 anos', points: 2 },
      ],
    },
    yesNoItem('sex', 'Sexo feminino (Sc)'),
  ],
  interpretation: {
    bands: [
      {
        id: 'baixo',
        upTo: { value: 0, inclusive: true },
        label: 'Baixo risco',
        tone: 'neutral',
        action: 'Risco anual de AVC ~0%. Anticoagulação geralmente não recomendada.',
      },
      {
        id: 'baixo-intermediario',
        upTo: { value: 1, inclusive: true },
        label: 'Risco baixo-intermediário',
        tone: 'attention',
        action:
          'Risco anual de AVC ~1,3%. Considere anticoagulação (recomendada em homens; em mulheres com escore 1 só pelo sexo, anticoagulação não indicada).',
      },
      {
        id: 'moderado',
        upTo: { value: 3, inclusive: true },
        label: 'Risco moderado',
        tone: 'attention',
        action: 'Risco anual de AVC 2,2–3,2%. Anticoagulação oral recomendada.',
      },
    ],
    otherwise: {
      id: 'alto',
      label: 'Alto risco',
      tone: 'critical',
      action: 'Risco anual de AVC ≥ 4%. Anticoagulação oral fortemente recomendada.',
    },
  },
};
