import type { ScoreCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';
import { bandIsResult, choiceItem, yesNoItem } from './items';

/**
 * Porte do `pecarn` do ANY. Não é somatório: critério de alto risco vale 100
 * e os demais valem 1, então a soma só separa as três faixas, e a tela
 * mostra a faixa, não o número. A faixa etária não muda a conta (achado para
 * a revisão clínica, CC-310).
 */
export const PECARN: ScoreCalculator = {
  kind: 'score',
  id: 'pecarn',
  name: 'PECARN',
  aliases: ['pecarn', 'tce', 'pediátrico', 'crianca', 'trauma craniano', 'tomografia pediátrica'],
  category: 'Trauma',
  description: 'Necessidade de TC de crânio em TCE leve pediátrico.',
  reference: {
    why: 'Reduz TCs desnecessárias em crianças com TCE leve, evitando radiação sem perder lesões clinicamente importantes.',
    whenToUse: 'Crianças com GCS 14–15 após trauma craniano. Duas versões: < 2 anos e ≥ 2 anos.',
    pearlsPitfalls: [
      'GCS < 14 = TC indicada independentemente do PECARN.',
      'Critérios diferentes para < 2 anos e ≥ 2 anos.',
      '< 2 anos: hematoma parietal/temporal não frontal e mecanismo grave são preditores.',
      '≥ 2 anos: cefaleia intensa e sinais de fratura de base de crânio são preditores.',
      'Risco muito baixo (todos negativos) = VPN > 99,9% para lesão intracraniana clinicamente importante.',
      'Não é somatório: um único critério de alto risco (estado mental alterado ou fratura de crânio) já indica TC. Os demais definem a zona intermediária.',
      'Comportamento não habitual vale para menores de 2 anos; vômitos valem para 2 anos ou mais.',
    ],
    citation:
      'Kuppermann N et al. Identification of children at very low risk of clinically-important brain injuries after head trauma: a prospective cohort study. Lancet. 2009;374(9696):1160-70.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  items: [
    choiceItem('age_group', 'Faixa etária (define quais critérios se aplicam)', [
      ['lt2', '< 2 anos', 0],
      ['gte2', '≥ 2 anos', 0],
    ]),
    yesNoItem('gcs_alt', 'Estado mental alterado ou GCS < 15 (critério de alto risco)', 100),
    yesNoItem(
      'skull',
      'Fratura de crânio palpável (< 2a) ou sinais de fratura de base (≥ 2a) (critério de alto risco)',
      100,
    ),
    yesNoItem(
      'hematoma',
      'Hematoma subgaleal occipital, parietal ou temporal (< 2a) ou cefaleia intensa (≥ 2a)',
    ),
    yesNoItem(
      'loc',
      'Perda de consciência ≥ 5 segundos (< 2a) ou qualquer perda de consciência (≥ 2a)',
    ),
    yesNoItem(
      'mechanism',
      'Mecanismo de trauma grave (queda > 90 cm em < 2a, > 1,5 m em ≥ 2a; colisão com ejeção, capotamento ou óbito; atropelamento; ciclista sem capacete)',
    ),
    yesNoItem('behavior', 'Comportamento não habitual segundo os pais (< 2a)'),
    yesNoItem('vomito', 'Vômitos (≥ 2a)'),
  ],
  formatValue: bandIsResult,
  interpretation: {
    bands: [
      {
        id: 'muito-baixo',
        upTo: { value: 0, inclusive: true },
        label: 'Risco muito baixo — TC geralmente não recomendada',
        tone: 'neutral',
        action:
          'Risco de lesão intracraniana clinicamente importante abaixo de 0,05%. TC geralmente não recomendada. Observação e orientações de alta.',
      },
      {
        id: 'intermediario',
        upTo: { value: 100, inclusive: false },
        label: 'Risco intermediário',
        tone: 'attention',
        action:
          'Risco em torno de 0,9%. Considere observação por 4–6 h ou TC, conforme evolução clínica, experiência do examinador, achados múltiplos, piora dos sintomas, idade abaixo de 3 meses e preferência dos pais.',
      },
    ],
    otherwise: {
      id: 'alto',
      label: 'Alto risco — TC recomendada',
      tone: 'critical',
      action:
        'Risco de lesão intracraniana clinicamente importante em torno de 4%. TC de crânio recomendada.',
    },
  },
};
