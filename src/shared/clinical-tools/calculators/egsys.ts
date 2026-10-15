import type { ScoreCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';
import { yesNoItem } from './items';

/**
 * Porte do `egsys` do ANY. Conta e faixas iguais (dois itens valem -1); a
 * ação da faixa alta passou para a forma de sugestão (ADR-017).
 */
export const EGSYS: ScoreCalculator = {
  kind: 'score',
  id: 'egsys',
  name: 'EGSYS Score',
  aliases: ['egsys', 'sincope', 'sincope cardíaca', 'perda de consciência'],
  category: 'Cardiologia / SCA',
  description: 'Probabilidade de síncope de causa cardíaca.',
  reference: {
    why: 'Identifica rapidamente síncopes de alto risco no DE, que necessitam investigação e internação.',
    whenToUse: 'Pacientes com síncope no DE, para diferenciar causa cardíaca de não cardíaca.',
    pearlsPitfalls: [
      'Escore ≥ 3 tem sensibilidade de 92% e especificidade de 69% para síncope cardíaca.',
      'Palpitação antes da síncope é o maior preditor positivo.',
      'Pródromos neurovegetativos (náusea, calor) reduzem a probabilidade de causa cardíaca.',
      'Não exclui causas potencialmente graves não cardíacas (ex.: embolia pulmonar).',
    ],
    citation:
      'Del Rosso A et al. Clinical predictors of cardiac syncope at initial evaluation in patients referred urgently to a general hospital. Heart. 2008;94(12):1620-6.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  items: [
    yesNoItem('ecg_abnormal', 'ECG anormal e/ou cardiopatia', 3),
    yesNoItem('palpitation', 'Palpitação antes da síncope', 4),
    yesNoItem('effort', 'Síncope durante esforço', 3),
    yesNoItem('supine', 'Síncope em posição supina', 2),
    yesNoItem('prodrome', 'Pródromos neurovegetativos (náusea, calor)', -1),
    yesNoItem(
      'precipitant',
      'Fatores predisponentes/precipitantes (quente, ortostatismo prolongado, medo, dor, emoção)',
      -1,
    ),
  ],
  interpretation: {
    bands: [
      {
        id: 'baixa',
        upTo: { value: 3, inclusive: false },
        label: 'Baixa probabilidade de síncope cardíaca',
        tone: 'neutral',
        action: 'Causa cardíaca improvável. Considere causas reflexas ou ortostáticas.',
      },
    ],
    otherwise: {
      id: 'alta',
      label: 'Alta probabilidade de síncope cardíaca',
      tone: 'critical',
      action:
        'Investigação cardiológica recomendada. Considere monitoramento, ecocardiograma e internação.',
    },
  },
};
