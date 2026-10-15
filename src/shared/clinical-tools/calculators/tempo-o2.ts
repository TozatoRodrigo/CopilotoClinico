import { requireValue, type FormulaCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';

/** "45 min", "1 h", "1 h 8 min" — o ANY escrevia "1h8min". */
function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours} h ${rest} min` : `${hours} h`;
}

/**
 * Porte do `tempoO2` do ANY. Mesma conta (capacidade × pressão/200 ÷ fluxo,
 * arredondada em minutos) e mesmos limites; as ações viraram sugestão.
 */
export const TEMPO_O2: FormulaCalculator = {
  kind: 'formula',
  id: 'tempo-o2',
  name: 'Tempo de O2 Torpedo',
  aliases: ['torpedo', 'o2', 'oxigenio', 'cilindro', 'transporte', 'autonomia'],
  category: 'Respiratório / Sepse',
  description: 'Autonomia de oxigênio em cilindro pressurizado (torpedo).',
  reference: {
    why: 'Essencial para planejar o transporte intra e inter-hospitalar com segurança.',
    whenToUse: 'Antes do transporte de paciente em uso de O2 suplementar com torpedo.',
    pearlsPitfalls: [
      'Fórmula: capacidade × (pressão no manômetro ÷ 200) ÷ fluxo. Ex.: torpedo D cheio (340 L a 200 bar) em 5 L/min ≈ 68 min.',
      'Capacidade total com cilindro cheio: torpedo padrão D, 340 L; torpedo E, 680 L.',
      'Cilindro cheio = ~200 bar. Reserva de segurança: não usar abaixo de 30 bar.',
      'Sempre superestimar o fluxo necessário (pacientes podem precisar de mais O2 durante o transporte).',
      'Considere margem de segurança de 30% no cálculo.',
    ],
    citation: 'Standard respiratory therapy and transport oxygen calculations.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  inputs: [
    {
      id: 'volume',
      label: 'Capacidade do cilindro cheio',
      unit: 'litros',
      min: 1,
      max: 10000,
      step: 1,
    },
    { id: 'pressure', label: 'Pressão no manômetro', unit: 'bar', min: 1, max: 300, step: 1 },
    { id: 'flow', label: 'Fluxo de O2', unit: 'L/min', min: 0.5, max: 60, step: 0.5 },
  ],
  decimals: 0,
  unit: 'min',
  formatValue: formatMinutes,
  compute: (values) => {
    // Gás disponível = capacidade total × fração da pressão de cilindro cheio (~200 bar).
    const litersAvailable =
      requireValue(values, 'volume') * (requireValue(values, 'pressure') / 200);
    return Math.round(litersAvailable / requireValue(values, 'flow'));
  },
  interpretation: {
    bands: [
      {
        id: 'critica',
        upTo: { value: 30, inclusive: false },
        label: 'Autonomia crítica',
        tone: 'critical',
        action: 'Insuficiente para transporte seguro. Considere trocar o cilindro.',
      },
      {
        id: 'limitada',
        upTo: { value: 60, inclusive: false },
        label: 'Autonomia limitada',
        tone: 'attention',
        action: 'Considere planejar rota mais curta ou levar cilindro adicional.',
      },
    ],
    otherwise: {
      id: 'uma-hora-ou-mais',
      label: 'Autonomia de 1 h ou mais',
      tone: 'neutral',
      action: 'Considere margem de segurança de 30%.',
    },
  },
};
