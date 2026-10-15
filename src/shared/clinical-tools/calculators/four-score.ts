import type { ScoreCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';
import { choiceItem } from './items';

/**
 * Porte do `fourScore` do ANY. Itens, pontos e faixas iguais; as ações
 * passaram para a forma de sugestão. Os rótulos de B0 e B1 vieram iguais do
 * ANY (achado para a revisão clínica, CC-310).
 */
export const FOUR_SCORE: ScoreCalculator = {
  kind: 'score',
  id: 'four-score',
  name: 'Escala FOUR',
  aliases: ['four', 'coma', 'consciência', 'uti', 'neurologia'],
  category: 'Neurologia',
  description:
    'Avaliação de consciência mais detalhada que a GCS, especialmente em pacientes intubados.',
  reference: {
    why: 'Avalia reflexos de tronco cerebral e padrão respiratório, permitindo o uso em pacientes intubados, nos quais a GCS é limitada.',
    whenToUse:
      'Pacientes com rebaixamento de consciência, especialmente intubados. Complementa ou substitui a GCS na UTI.',
    pearlsPitfalls: [
      'Vantagem principal: não depende de resposta verbal (utilizável em intubados).',
      'Escore 0 em todos os 4 componentes sugere morte encefálica: considere iniciar o protocolo.',
      'O componente respiratório detecta padrão de Cheyne-Stokes e respiração atáxica.',
      'E0 + M0 + B0 + R0 = considerar investigação de morte encefálica.',
    ],
    citation:
      'Wijdicks EF et al. Validation of a new coma scale: The FOUR score. Ann Neurol. 2005;58(4):585-93.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  items: [
    choiceItem('eye', 'Resposta ocular (E)', [
      ['e0', 'E0 — pálpebras fechadas, sem abertura à dor', 0],
      ['e1', 'E1 — pálpebras fechadas, abertura à dor', 1],
      ['e2', 'E2 — pálpebras fechadas, abertura à voz', 2],
      ['e3', 'E3 — pálpebras abertas, sem rastreamento', 3],
      ['e4', 'E4 — pálpebras abertas, rastreamento ou piscar ao comando', 4],
    ]),
    choiceItem('motor', 'Resposta motora (M)', [
      ['m0', 'M0 — sem resposta à dor ou status mioclônico generalizado', 0],
      ['m1', 'M1 — resposta extensora à dor', 1],
      ['m2', 'M2 — resposta flexora à dor', 2],
      ['m3', 'M3 — localização da dor', 3],
      ['m4', 'M4 — polegar para cima, punho fechado ou sinal de paz ao comando', 4],
    ]),
    choiceItem('brainstem', 'Reflexos de tronco (B)', [
      ['b0', 'B0 — reflexo pupilar e corneano ausentes', 0],
      ['b1', 'B1 — reflexo pupilar E corneano ausentes', 1],
      ['b2', 'B2 — reflexo pupilar OU corneano ausente', 2],
      ['b3', 'B3 — uma pupila fixa e dilatada', 3],
      ['b4', 'B4 — reflexos pupilares e corneano presentes', 4],
    ]),
    choiceItem('respiration', 'Padrão respiratório (R)', [
      ['r0', 'R0 — apneia ou respiração na frequência de backup do ventilador', 0],
      ['r1', 'R1 — frequência acima da do ventilador', 1],
      ['r2', 'R2 — não intubado, respiração irregular', 2],
      ['r3', 'R3 — não intubado, padrão de Cheyne-Stokes', 3],
      ['r4', 'R4 — não intubado, padrão respiratório regular', 4],
    ]),
  ],
  interpretation: {
    bands: [
      {
        id: 'zero',
        upTo: { value: 0, inclusive: true },
        label: 'Pontuação 0 — considere investigação de morte encefálica',
        tone: 'critical',
        action:
          'Todos os componentes zerados. Considere iniciar o protocolo de morte encefálica, se aplicável.',
      },
      {
        id: 'grave',
        upTo: { value: 6, inclusive: true },
        label: 'Gravemente comprometido',
        tone: 'critical',
        action: 'Coma profundo. Considere prognóstico reservado e avaliar causa tratável.',
      },
      {
        id: 'moderado',
        upTo: { value: 11, inclusive: true },
        label: 'Moderadamente comprometido',
        tone: 'attention',
        action: 'Rebaixamento significativo. Monitoramento em UTI recomendado.',
      },
    ],
    otherwise: {
      id: 'leve',
      label: 'Levemente comprometido',
      tone: 'neutral',
      action: 'Nível de consciência relativamente preservado.',
    },
  },
};
