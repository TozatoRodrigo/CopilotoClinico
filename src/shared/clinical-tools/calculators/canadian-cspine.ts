import type { ScoreCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';
import { bandIsResult, choiceItem } from './items';

/**
 * Porte do `canadianCSpine` do ANY. As três perguntas viram pontos que só
 * separam "imagem" de "sem imagem"; a tela mostra a faixa. Ações como sugestão.
 */
export const CANADIAN_CSPINE: ScoreCalculator = {
  kind: 'score',
  id: 'canadian-cspine',
  name: 'Canadian C-Spine Rule',
  aliases: ['c-spine', 'cervical', 'coluna', 'colar cervical', 'rx coluna', 'trauma cervical'],
  category: 'Trauma',
  description: 'Necessidade de imagem da coluna cervical em trauma com paciente alerta.',
  reference: {
    why: 'Reduz radiografias cervicais desnecessárias em > 40%, mantendo sensibilidade de ~100% para lesão significativa.',
    whenToUse: 'Adultos alertas (GCS 15) e estáveis após trauma com possível lesão cervical.',
    pearlsPitfalls: [
      'Só aplicável se GCS 15, estável e alerta.',
      'NÃO usar em < 16 anos, trauma penetrante, doença espinhal conhecida ou gestantes.',
      'Pergunta 1: alto risco? Se sim → imagem. Se não → Pergunta 2: baixo risco permite exame clínico? Se sim → Pergunta 3: rotação ativa ≥ 45 graus? Se sim e sem dor → sem imagem.',
      'Superior ao NEXUS em sensibilidade e especificidade.',
    ],
    citation:
      'Stiell IG et al. The Canadian C-spine rule versus the NEXUS low-risk criteria in patients with trauma. N Engl J Med. 2003;349(26):2510-8.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  items: [
    choiceItem(
      'high_risk',
      'Fator de alto risco presente? (Idade ≥ 65, mecanismo perigoso, parestesia em extremidades)',
      [
        ['nao', 'Não', 0],
        ['sim', 'Sim', 3],
      ],
    ),
    choiceItem(
      'low_risk',
      'Se sem alto risco: fator de baixo risco presente que permita o exame? (Colisão traseira simples, sentado no DE, deambulou, dor cervical tardia, ausência de dor em linha média)',
      [
        ['nenhum', 'Nenhum fator de baixo risco (não pode avaliar rotação)', 2],
        ['sim', 'Sim, pelo menos 1 fator de baixo risco', 0],
      ],
    ),
    choiceItem(
      'rotation',
      'Se baixo risco presente: rotação ativa ≥ 45 graus para ambos os lados sem dor?',
      [
        ['nao', 'Não consegue / dor presente', 1],
        ['sim', 'Sim, rotação sem dor bilateralmente', 0],
      ],
    ),
  ],
  formatValue: bandIsResult,
  interpretation: {
    bands: [
      {
        id: 'sem-imagem',
        upTo: { value: 0, inclusive: true },
        label: 'Imagem cervical não necessária',
        tone: 'neutral',
        action:
          'Sensibilidade ~100%. Considere retirar a imobilização cervical, sem radiografia/TC.',
      },
    ],
    otherwise: {
      id: 'imagem',
      label: 'Imagem cervical recomendada',
      tone: 'critical',
      action:
        'Considere manter a imobilização. TC de coluna cervical recomendada (superior à radiografia simples).',
    },
  },
};
