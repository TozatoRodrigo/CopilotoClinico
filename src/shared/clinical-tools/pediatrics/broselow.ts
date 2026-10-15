import { formatCompact, formatDecimal } from '../numbers';

/**
 * Fita de Broselow do PedGuide v4 (CC-319): nove cores com peso, idade,
 * comprimento e o material de via aérea de cada uma. O motor não conhece cor
 * de tela: `key` é o nome da faixa da fita e a tela escolhe o token.
 */

export const BROSELOW_KEYS = [
  'gray',
  'pink',
  'red',
  'purple',
  'yellow',
  'white',
  'blue',
  'orange',
  'green',
] as const;

export type BroselowKey = (typeof BROSELOW_KEYS)[number];

export interface BroselowColor {
  key: BroselowKey;
  /** Nome da cor na fita ("Amarelo"). */
  name: string;
  /** Peso da faixa, usado na conta quando a cor é a fonte do peso. */
  weightKg: number;
  ageMonths: number;
  /** Comprimento de referência da faixa. */
  heightCm: number;
  /** Comprimento coberto pela faixa na fita. */
  lengthCm: { min: number; max: number };
  /** Tubo traqueal com cuff (mm). */
  tubeMm: number;
  /** Fixação na gengiva (cm). */
  fixationCm: number;
  blade: string;
  /** Tamanho da máscara laríngea. */
  laryngealMask: number;
  /** French. */
  bougie: string;
  /** French. */
  suctionCatheter: number;
}

export const BROSELOW_COLORS: readonly BroselowColor[] = [
  {
    key: 'gray',
    name: 'Cinza',
    weightKg: 3,
    ageMonths: 1.5,
    heightCm: 52,
    lengthCm: { min: 46, max: 59 },
    tubeMm: 3.0,
    fixationCm: 9,
    blade: '0 reta',
    laryngealMask: 1,
    bougie: '5',
    suctionCatheter: 6,
  },
  {
    key: 'pink',
    name: 'Rosa',
    weightKg: 6,
    ageMonths: 4.5,
    heightCm: 63,
    lengthCm: { min: 60, max: 66 },
    tubeMm: 3.0,
    fixationCm: 9,
    blade: '1 reta',
    laryngealMask: 1,
    bougie: '5',
    suctionCatheter: 6,
  },
  {
    key: 'red',
    name: 'Vermelho',
    weightKg: 8,
    ageMonths: 7.5,
    heightCm: 70,
    lengthCm: { min: 67, max: 74 },
    tubeMm: 3.5,
    fixationCm: 10,
    blade: '1 reta',
    laryngealMask: 1.5,
    bougie: '6',
    suctionCatheter: 8,
  },
  {
    key: 'purple',
    name: 'Roxo',
    weightKg: 10,
    ageMonths: 10,
    heightCm: 79,
    lengthCm: { min: 75, max: 83 },
    tubeMm: 3.5,
    fixationCm: 11,
    blade: '1-2',
    laryngealMask: 1.5,
    bougie: '6',
    suctionCatheter: 8,
  },
  {
    key: 'yellow',
    name: 'Amarelo',
    weightKg: 12,
    ageMonths: 18,
    heightCm: 89,
    lengthCm: { min: 84, max: 95 },
    tubeMm: 4.0,
    fixationCm: 12,
    blade: '2',
    laryngealMask: 2,
    bougie: '10',
    suctionCatheter: 8,
  },
  {
    key: 'white',
    name: 'Branco',
    weightKg: 14,
    ageMonths: 30,
    heightCm: 101,
    lengthCm: { min: 96, max: 106 },
    tubeMm: 4.5,
    fixationCm: 13,
    blade: '2',
    laryngealMask: 2,
    bougie: '10',
    suctionCatheter: 10,
  },
  {
    key: 'blue',
    name: 'Azul',
    weightKg: 18,
    ageMonths: 54,
    heightCm: 113,
    lengthCm: { min: 107, max: 120 },
    tubeMm: 5.0,
    fixationCm: 15,
    blade: '2',
    laryngealMask: 2.5,
    bougie: '10',
    suctionCatheter: 10,
  },
  {
    key: 'orange',
    name: 'Laranja',
    weightKg: 24,
    ageMonths: 78,
    heightCm: 126,
    lengthCm: { min: 121, max: 132 },
    tubeMm: 5.5,
    fixationCm: 16,
    blade: '2-3',
    laryngealMask: 3,
    bougie: '15',
    suctionCatheter: 12,
  },
  {
    key: 'green',
    name: 'Verde',
    weightKg: 32,
    ageMonths: 108,
    heightCm: 139,
    lengthCm: { min: 133, max: 145 },
    tubeMm: 6.0,
    fixationCm: 18,
    blade: '3',
    laryngealMask: 3,
    bougie: '15',
    suctionCatheter: 12,
  },
];

export function findBroselowColor(key: string): BroselowColor | undefined {
  return BROSELOW_COLORS.find((color) => color.key === key);
}

/**
 * Cor mais próxima do peso, como no ANY: menor diferença absoluta; no empate
 * fica a cor mais leve (13 kg é Amarelo, não Branco).
 */
export function broselowColorForWeight(kg: number): BroselowColor {
  let best = BROSELOW_COLORS[0] as BroselowColor;
  let smallest = Number.POSITIVE_INFINITY;
  for (const color of BROSELOW_COLORS) {
    const difference = Math.abs(color.weightKg - kg);
    if (difference < smallest) {
      smallest = difference;
      best = color;
    }
  }
  return best;
}

/** "1,5 meses", "2 anos" — como o ANY descreve a idade da faixa. */
export function describeBroselowAge(months: number): string {
  if (months < 12) return `${formatCompact(months)} meses`;
  return `${Math.round(months / 12)} anos`;
}

export interface AirwayEquipment {
  tube: string;
  fixation: string;
  blade: string;
  laryngealMask: string;
  bougie: string;
  suctionCatheter: string;
  /** Valores que o checklist de intubação mostra ao lado de cada item. */
  checklist: { blade: string; tube: string; bougie: string; laryngealMask: string };
}

/**
 * Material de via aérea da cor (CC-319). Os textos são os do PedGuide v4, com
 * vírgula decimal: o tubo "e um menor" sai "3 e 2,5" e "3,5 e 3,0", como lá.
 */
export function airwayEquipment(color: BroselowColor): AirwayEquipment {
  return {
    tube: formatDecimal(color.tubeMm, 1),
    fixation: String(color.fixationCm),
    blade: color.blade,
    laryngealMask: formatCompact(color.laryngealMask),
    bougie: color.bougie,
    suctionCatheter: String(color.suctionCatheter),
    checklist: {
      blade: `Lâmina ${color.blade}`,
      tube: `${formatCompact(color.tubeMm)} e ${formatDecimal(color.tubeMm - 0.5, 1)}`,
      bougie: `${color.bougie} Fr`,
      laryngealMask: `Tam. ${formatCompact(color.laryngealMask)}`,
    },
  };
}
