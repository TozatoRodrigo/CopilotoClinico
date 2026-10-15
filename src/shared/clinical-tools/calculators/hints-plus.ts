import type { ScoreCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';
import { bandIsResult, choiceItem } from './items';

/** Porte do `hintsPlus` do ANY. Achados, faixas e ações iguais; o padrão é o resultado. */
export const HINTS_PLUS: ScoreCalculator = {
  kind: 'score',
  id: 'hints-plus',
  name: 'HINTS Plus',
  aliases: [
    'hints',
    'vertigem',
    'tontura',
    'avc',
    'vestibular',
    'central',
    'periférico',
    'nistagmo',
  ],
  category: 'Neurologia',
  description: 'Diferencia vertigem central (AVC) de periférica na síndrome vestibular aguda.',
  reference: {
    why: 'Sensibilidade de 99,2% para AVC de fossa posterior na síndrome vestibular aguda, superior à RM nas primeiras 48 h.',
    whenToUse:
      'Pacientes com síndrome vestibular aguda (vertigem + nistagmo + instabilidade de marcha contínua por > 24 h).',
    pearlsPitfalls: [
      'APENAS aplicável em síndrome vestibular aguda contínua; não usar em vertigem episódica.',
      'Requer treinamento no exame: Head Impulse, Nistagmo, Test of Skew.',
      'HI normal (sem sacada corretiva) = CENTRAL até que se prove o contrário.',
      'Nistagmo que muda de direção com o olhar = CENTRAL.',
      'Plus = perda auditiva nova, que sugere infarto de AICA.',
      'HINTS periférico: HI positivo (sacada corretiva) + nistagmo unidirecional + sem skew + sem perda auditiva.',
    ],
    citation:
      'Kattah JC et al. HINTS to diagnose stroke in the acute vestibular syndrome. Stroke. 2009;40(11):3504-10.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  items: [
    choiceItem('hi', 'Head Impulse Test', [
      ['positivo', 'Positivo (sacada corretiva presente) — sugere periférico', 0],
      ['normal', 'Normal/negativo (sem sacada corretiva) — sugere central', 1],
    ]),
    choiceItem('nystagmus', 'Nistagmo', [
      ['unidirecional', 'Unidirecional (bate para um lado) — sugere periférico', 0],
      ['bidirecional', 'Bidirecional ou vertical — sugere central', 1],
    ]),
    choiceItem('skew', 'Test of Skew (cover-uncover)', [
      ['ausente', 'Ausente (sem desalinhamento vertical) — sugere periférico', 0],
      ['presente', 'Presente (desalinhamento vertical) — sugere central', 1],
    ]),
    choiceItem('hearing', 'Plus: perda auditiva nova', [
      ['ausente', 'Ausente', 0],
      ['presente', 'Presente (sugere infarto de AICA)', 1],
    ]),
  ],
  formatValue: bandIsResult,
  interpretation: {
    bands: [
      {
        id: 'periferico',
        upTo: { value: 0, inclusive: true },
        label: 'Padrão periférico',
        tone: 'neutral',
        action:
          'Todos os testes sugerem causa periférica (ex.: neurite vestibular). RM geralmente desnecessária.',
      },
    ],
    otherwise: {
      id: 'central',
      label: 'Padrão central — considere AVC',
      tone: 'critical',
      action:
        'Pelo menos 1 achado central. Considere AVC de fossa posterior mesmo com RM normal nas primeiras 48 h. Neuroimagem e avaliação vascular recomendadas.',
    },
  },
};
