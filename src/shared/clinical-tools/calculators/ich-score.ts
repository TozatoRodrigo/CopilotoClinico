import type { ScoreCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';
import { choiceItem, yesNoItem } from './items';

/**
 * Porte do `ichScore` do ANY. Uma faixa por pontuação, como lá. O escore 3
 * usa o laranja do ANY (#FF9800), que aqui vira o tom de atenção (achado para
 * a revisão clínica, CC-310). Ações como sugestão.
 */
export const ICH_SCORE: ScoreCalculator = {
  kind: 'score',
  id: 'ich-score',
  name: 'ICH Score',
  aliases: [
    'ich',
    'avch',
    'hemorragia intracerebral',
    'hematoma cerebral',
    'avc hemorragico',
    'hemphill',
  ],
  category: 'Neurologia',
  description: 'Predição de mortalidade em 30 dias no AVCh espontâneo.',
  reference: {
    why: 'Escore mais validado para prognóstico de AVCh. Simples, rápido e reprodutível. Auxilia a comunicação com familiares e a decisão sobre nível de cuidado.',
    whenToUse:
      'Pacientes com hemorragia intracerebral espontânea confirmada por TC. Não usar para trauma ou hemorragia subaracnóidea (usar Hunt-Hess/Fisher).',
    pearlsPitfalls: [
      'NÃO usar isoladamente para limitar cuidados: viés de profecia autorrealizável (retirada precoce de suporte).',
      'Volume do hematoma: usar a fórmula ABC/2 (disponível nesta área).',
      'Infratentorial (cerebelo/tronco) tem pior prognóstico independentemente do volume.',
      'Recalcular após expansão do hematoma (TC de controle em 6 h).',
      'Escore 0 não significa ausência de risco: a mortalidade ainda pode ser significativa.',
    ],
    citation:
      'Hemphill JC et al. The ICH Score: a simple, reliable grading scale for intracerebral hemorrhage. Stroke. 2001;32(4):891-7.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  items: [
    choiceItem('gcs_ich', 'Glasgow (GCS)', [
      ['13-15', '13–15', 0],
      ['5-12', '5–12', 1],
      ['3-4', '3–4', 2],
    ]),
    choiceItem('volume', 'Volume do hematoma', [
      ['lt30', '< 30 mL', 0],
      ['gte30', '≥ 30 mL', 1],
    ]),
    yesNoItem('hiv', 'Hemorragia intraventricular'),
    choiceItem('infratentorial', 'Origem infratentorial', [
      ['nao', 'Não (supratentorial)', 0],
      ['sim', 'Sim (cerebelo ou tronco)', 1],
    ]),
    yesNoItem('age80', 'Idade ≥ 80 anos'),
  ],
  interpretation: {
    bands: [
      {
        id: '0',
        upTo: { value: 0, inclusive: true },
        label: 'ICH Score 0 — mortalidade ~0%',
        tone: 'neutral',
        action: 'Bom prognóstico. Considere manter suporte agressivo e monitorização em UTI.',
      },
      {
        id: '1',
        upTo: { value: 1, inclusive: true },
        label: 'ICH Score 1 — mortalidade ~13%',
        tone: 'neutral',
        action:
          'Prognóstico favorável. Considere controle pressórico rigoroso e reversão de anticoagulação, se aplicável.',
      },
      {
        id: '2',
        upTo: { value: 2, inclusive: true },
        label: 'ICH Score 2 — mortalidade ~26%',
        tone: 'attention',
        action:
          'Prognóstico intermediário. Considere UTI e neurocirurgia se hematoma cerebelar > 3 cm.',
      },
      {
        id: '3',
        upTo: { value: 3, inclusive: true },
        label: 'ICH Score 3 — mortalidade ~72%',
        tone: 'attention',
        action: 'Prognóstico reservado. Considere discutir com a família os objetivos de cuidado.',
      },
      {
        id: '4',
        upTo: { value: 4, inclusive: true },
        label: 'ICH Score 4 — mortalidade ~97%',
        tone: 'critical',
        action:
          'Prognóstico muito reservado. Considere cuidados de conforto conforme os valores do paciente.',
      },
      {
        id: '5',
        upTo: { value: 5, inclusive: true },
        label: 'ICH Score 5 — mortalidade ~100%',
        tone: 'critical',
        action: 'Prognóstico extremamente reservado.',
      },
    ],
    otherwise: {
      id: '6',
      label: 'ICH Score 6 — mortalidade ~100%',
      tone: 'critical',
      action: 'Prognóstico incompatível com sobrevida na maioria dos casos.',
    },
  },
};
