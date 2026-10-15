import type { ScoreCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';
import { choiceItem } from './items';

/** Porte do `bps` do ANY. Itens, pontos e faixas iguais; ações como sugestão. */
export const BPS: ScoreCalculator = {
  kind: 'score',
  id: 'bps',
  name: 'BPS (Behavioral Pain Scale)',
  aliases: ['bps', 'dor', 'sedação', 'uti', 'intubado', 'behavioral pain'],
  category: 'Sedação / Dor',
  description: 'Avaliação comportamental de dor em pacientes sedados ou intubados.',
  reference: {
    why: 'Permite identificar dor em pacientes que não conseguem se comunicar verbalmente.',
    whenToUse: 'Pacientes intubados ou sedados na UTI, para guiar a analgesia.',
    pearlsPitfalls: [
      'BPS 3 = sem dor. BPS > 5 = dor significativa; considere analgesia.',
      'Avaliar expressão facial, movimentos dos membros superiores e sincronia com o ventilador.',
      'Não usar se houver bloqueio neuromuscular (o paciente não pode expressar dor).',
      'Avaliar antes, durante e após procedimentos dolorosos.',
      'Meta: BPS ≤ 5 (ou conforme o protocolo institucional).',
    ],
    citation:
      'Payen JF et al. Assessing pain in critically ill sedated patients by using a behavioral pain scale. Crit Care Med. 2001;29(12):2258-63.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  items: [
    choiceItem('face', 'Expressão facial', [
      ['relaxada', 'Relaxada', 1],
      ['parcial', 'Parcialmente tensa (ex.: sobrancelhas franzidas)', 2],
      ['total', 'Totalmente tensa (ex.: pálpebras cerradas)', 3],
      ['careta', 'Careta/esgar', 4],
    ]),
    choiceItem('upper', 'Membros superiores', [
      ['sem', 'Sem movimento', 1],
      ['parcial', 'Parcialmente fletidos', 2],
      ['total', 'Totalmente fletidos com flexão dos dedos', 3],
      ['retraidos', 'Permanentemente retraídos', 4],
    ]),
    choiceItem('ventilator', 'Sincronia com o ventilador', [
      ['tolerando', 'Tolerando a ventilação', 1],
      ['tossindo', 'Tossindo, mas tolerando na maior parte do tempo', 2],
      ['lutando', 'Lutando contra o ventilador', 3],
      ['incapaz', 'Incapaz de controlar a ventilação', 4],
    ]),
  ],
  interpretation: {
    bands: [
      {
        id: 'sem-dor',
        upTo: { value: 3, inclusive: true },
        label: 'Sem dor',
        tone: 'neutral',
        action: 'Sem evidência comportamental de dor.',
      },
      {
        id: 'leve',
        upTo: { value: 5, inclusive: true },
        label: 'Dor leve',
        tone: 'neutral',
        action: 'Dor leve. Considere manter a analgesia atual e reavaliar regularmente.',
      },
      {
        id: 'moderada',
        upTo: { value: 8, inclusive: true },
        label: 'Dor moderada',
        tone: 'attention',
        action: 'Dor moderada. Considere ajustar a analgesia e avaliar a causa.',
      },
    ],
    otherwise: {
      id: 'intensa',
      label: 'Dor intensa',
      tone: 'critical',
      action: 'Dor intensa. Analgesia urgente recomendada. Considere investigar e tratar a causa.',
    },
  },
};
