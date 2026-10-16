import { requireValue, type FormulaCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';

/**
 * Porte do `shockIndex` do ANY. Mesmo arredondamento (2 casas) antes de ler a
 * faixa: 0,695 vira 0,7 e cai em "limítrofe", como lá. As ações das faixas de
 * choque passaram para a forma de sugestão (ADR-017).
 */
export const SHOCK_INDEX: FormulaCalculator = {
  kind: 'formula',
  id: 'shock-index',
  name: 'Índice de choque',
  aliases: ['índice de choque', 'shock index', 'si', 'fc/pas', 'hemorragia', 'hipoperfusão'],
  category: 'Hemodinâmica',
  description: 'Relação FC/PAS como marcador precoce de instabilidade hemodinâmica.',
  reference: {
    why: 'Mais sensível que FC ou PAS isoladas para detectar hipovolemia precoce.',
    whenToUse: 'Triagem rápida de instabilidade hemodinâmica em trauma, hemorragia e sepse.',
    pearlsPitfalls: [
      'Normal: 0,5–0,7. ≥ 0,9 sugere choque.',
      'Índice > 1,0 em trauma: considere ativar o protocolo de transfusão maciça.',
      'Limitações: betabloqueadores, marca-passo, atletas, gestantes.',
      'O índice de choque modificado (ISM) inclui a PAM; não é consensual.',
    ],
    citation: 'Allgower M, Burri C. Shock index. Dtsch Med Wochenschr. 1967;92(43):1947-50.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-14',
    review: { status: 'pendente' },
  },
  inputs: [
    { id: 'hr', label: 'Frequência cardíaca', unit: 'bpm', min: 30, max: 250, step: 1 },
    { id: 'sbp', label: 'Pressão arterial sistólica', unit: 'mmHg', min: 40, max: 300, step: 1 },
  ],
  decimals: 2,
  compute: (values) =>
    Math.round((requireValue(values, 'hr') / requireValue(values, 'sbp')) * 100) / 100,
  interpretation: {
    bands: [
      {
        id: 'normal',
        upTo: { value: 0.7, inclusive: false },
        label: 'Normal',
        tone: 'neutral',
        action: 'Índice de choque dentro da faixa normal.',
      },
      {
        id: 'limitrofe',
        upTo: { value: 0.9, inclusive: false },
        label: 'Limítrofe',
        tone: 'attention',
        action: 'Índice de choque no limite. Considere monitorar de perto.',
      },
      {
        id: 'choque-provavel',
        upTo: { value: 1.3, inclusive: false },
        label: 'Choque provável',
        tone: 'critical',
        action:
          'Instabilidade hemodinâmica provável. Considere avaliar a causa e iniciar ressuscitação.',
      },
    ],
    otherwise: {
      id: 'choque-grave',
      label: 'Choque grave',
      tone: 'critical',
      action:
        'Choque grave. Considere ressuscitação agressiva imediata e transfusão maciça em trauma.',
    },
  },
};
