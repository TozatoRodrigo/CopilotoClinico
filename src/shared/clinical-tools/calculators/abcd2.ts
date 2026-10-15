import type { ScoreCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';
import { choiceItem, yesNoItem } from './items';

/** Porte do `abcd2` do ANY. Itens, pontos e faixas iguais; só acentuação corrigida. */
export const ABCD2: ScoreCalculator = {
  kind: 'score',
  id: 'abcd2',
  name: 'ABCD2 Score',
  aliases: ['abcd', 'ait', 'ataque isquemico transitorio', 'risco avc'],
  category: 'Neurologia',
  description: 'Risco de AVC em 2, 7 e 90 dias após um ataque isquêmico transitório.',
  reference: {
    why: 'Estratifica a urgência da investigação e da internação após AIT. Escore alto indica necessidade de avaliação vascular rápida.',
    whenToUse: 'Pacientes com diagnóstico clínico de AIT no DE.',
    pearlsPitfalls: [
      'Escore ≥ 4 sugere internação ou investigação acelerada (imagem vascular em < 24 h).',
      'Não substitui a imagem vascular: mesmo escores baixos podem ter estenose carotídea significativa.',
      'Duração ≥ 60 min e déficit motor são os maiores preditores.',
      'AIT com RM positiva (lesão isquêmica) = risco ainda maior que o escore sugere.',
    ],
    citation:
      'Johnston SC et al. Validation and refinement of scores to predict very early stroke risk after transient ischaemic attack. Lancet. 2007;369(9558):283-92.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  items: [
    yesNoItem('age', 'Idade ≥ 60 anos (A)'),
    yesNoItem('bp', 'PA ≥ 140/90 mmHg na apresentação (B)'),
    choiceItem('clinical', 'Apresentação clínica (C)', [
      ['outro', 'Outro sintoma', 0],
      ['fala', 'Alteração de fala sem fraqueza', 1],
      ['fraqueza', 'Fraqueza unilateral', 2],
    ]),
    choiceItem('duration', 'Duração dos sintomas (D)', [
      ['lt10', '< 10 minutos', 0],
      ['10-59', '10–59 minutos', 1],
      ['gte60', '≥ 60 minutos', 2],
    ]),
    yesNoItem('diabetes', 'Diabetes mellitus (D)'),
  ],
  interpretation: {
    bands: [
      {
        id: 'baixo',
        upTo: { value: 3, inclusive: true },
        label: 'Baixo risco',
        tone: 'neutral',
        action:
          'Risco de AVC em 2 dias: ~1%. Seguimento ambulatorial pode ser considerado se houver imagem vascular acessível.',
      },
      {
        id: 'moderado',
        upTo: { value: 5, inclusive: true },
        label: 'Risco moderado',
        tone: 'attention',
        action:
          'Risco de AVC em 2 dias: ~4,1%. Investigação acelerada recomendada (imagem vascular em 24 h).',
      },
    ],
    otherwise: {
      id: 'alto',
      label: 'Alto risco',
      tone: 'critical',
      action: 'Risco de AVC em 2 dias: ~8,1%. Considere internação para investigação urgente.',
    },
  },
};
