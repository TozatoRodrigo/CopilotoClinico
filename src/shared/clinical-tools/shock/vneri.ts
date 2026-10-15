import type { NumericInput } from '../calculator';
import { validateNumber, type NumericFieldError } from '../ranges';
import type { ResultTone } from '../tone';

/**
 * VNERi — índice de responsividade vascular à noradrenalina (Goury et al.
 * 2025), porte do `calcVNERi`/`getVNERiZone` do ANY e do texto de conduta do
 * ShockPath. VNERi = PAD / (dose de NE × FC), dose em mcg/kg/min.
 */

/** Limite superior de uma faixa; as faixas são lidas em ordem e vale a primeira que cabe. */
export interface UpperBound {
  value: number;
  inclusive: boolean;
}

function fits(value: number, upTo: UpperBound | undefined): boolean {
  if (!upTo) return true;
  return upTo.inclusive ? value <= upTo.value : value < upTo.value;
}

/** Primeira faixa em que o valor cabe; a última, sem limite, pega o resto. */
export function pickBand<T extends { upTo?: UpperBound }>(bands: readonly T[], value: number): T {
  const band = bands.find(({ upTo }) => fits(value, upTo));
  if (!band) throw new Error('Faixas sem a última, sem limite; confira a definição.');
  return band;
}

export const VNERI_INPUTS = {
  pad: {
    id: 'pad',
    label: 'Pressão arterial diastólica (PAD)',
    unit: 'mmHg',
    min: 10,
    max: 150,
    step: 1,
  },
  fc: { id: 'fc', label: 'Frequência cardíaca (FC)', unit: 'bpm', min: 30, max: 250, step: 1 },
  doseNE: {
    id: 'doseNE',
    label: 'Dose de noradrenalina',
    unit: 'mcg/kg/min',
    min: 0.01,
    max: 3,
    step: 0.01,
  },
} as const satisfies Record<string, NumericInput>;

export type VneriInputId = keyof typeof VNERI_INPUTS;

export type VneriZoneId =
  | 'hiporresponsividade-grave'
  | 'resposta-parcial'
  | 'resposta-adequada'
  | 'tonus-preservado';

export interface VneriZone {
  id: VneriZoneId;
  label: string;
  /**
   * Tom do ADR-017. O ANY pinta o tônus preservado de azul no número e de
   * amarelo na barra; aqui vale a barra (atenção), porque a mortalidade volta
   * a subir. Está na revisão clínica.
   */
  tone: ResultTone;
  /** Mortalidade observada na zona (Goury et al. 2025), como o ANY mostra. */
  mortality: string;
  /** Nome curto na legenda da barra. */
  barLabel: string;
  upTo?: UpperBound;
}

/** Zonas do `getVNERiZone` do ANY: cortes 2,6, 6,7 e 10,8, todos exclusivos. */
export const VNERI_ZONES: readonly VneriZone[] = [
  {
    id: 'hiporresponsividade-grave',
    label: 'Hiporresponsividade grave',
    tone: 'critical',
    mortality: '~56%',
    barLabel: 'Hipo grave',
    upTo: { value: 2.6, inclusive: false },
  },
  {
    id: 'resposta-parcial',
    label: 'Resposta parcial',
    tone: 'attention',
    mortality: '28-40%',
    barLabel: 'Parcial',
    upTo: { value: 6.7, inclusive: false },
  },
  {
    id: 'resposta-adequada',
    label: 'Resposta adequada',
    tone: 'neutral',
    mortality: '~28%',
    barLabel: 'Adequada',
    upTo: { value: 10.8, inclusive: false },
  },
  {
    id: 'tonus-preservado',
    label: 'Tônus preservado',
    tone: 'attention',
    mortality: '~39%',
    barLabel: 'Preservado',
  },
];

export interface VneriConduct {
  /** Zona cujo texto é este (o corte de 10,8 aqui é inclusivo; ver abaixo). */
  zone: VneriZoneId;
  text: string;
  upTo?: UpperBound;
}

/**
 * Conduta sugerida por faixa, do `getVneriCondutaText` do ShockPath. O corte
 * de 10,8 é **inclusivo** aqui e exclusivo nas zonas: com VNERi exatamente
 * 10,8 o ANY mostra "Tônus preservado" com o texto da resposta adequada. A
 * paridade mantém isso; a decisão está na revisão clínica.
 */
export const VNERI_CONDUCTS: readonly VneriConduct[] = [
  {
    zone: 'hiporresponsividade-grave',
    upTo: { value: 2.6, inclusive: false },
    text: 'Considere associar vasopressina (0,01-0,04 UI/min) ou hidrocortisona (200 mg/dia). Escalar a dose de NE isoladamente pode ser insuficiente (Goury et al. 2025).',
  },
  {
    zone: 'resposta-parcial',
    upTo: { value: 6.7, inclusive: false },
    text: 'Considere titular a noradrenalina conforme a PAM alvo e acompanhar a tendência do VNERi. Se o VNERi cair apesar do aumento de dose, considere vasopressina ou corticoides (Goury et al. 2025).',
  },
  {
    zone: 'resposta-adequada',
    upTo: { value: 10.8, inclusive: true },
    text: 'Zona de menor mortalidade (nadir 6,7). Considere manter a conduta atual e reavaliar se houver piora clínica (Goury et al. 2025).',
  },
  {
    zone: 'tonus-preservado',
    text: 'Mortalidade em ascensão apesar de tônus preservado. Considere investigar hipovolemia, disfunção miocárdica e obstrução, com ecocardiograma à beira-leito (Goury et al. 2025).',
  },
];

/** A barra do ANY vai de 0 a 15; acima disso o marcador fica no fim. */
export const VNERI_BAR_MAX = 15;

/** VNERi = PAD / (dose de NE × FC). Recebe valores já validados (todos > 0). */
export function computeVneri(pad: number, doseNE: number, fc: number): number {
  return pad / (doseNE * fc);
}

export function vneriZone(vneri: number): VneriZone {
  return pickBand(VNERI_ZONES, vneri);
}

export function vneriConduct(vneri: number): VneriConduct {
  return pickBand(VNERI_CONDUCTS, vneri);
}

/** Posição do marcador na barra, em % (0 a 100). */
export function vneriBarPosition(vneri: number): number {
  return Math.min(100, Math.max(0, (vneri / VNERI_BAR_MAX) * 100));
}

/** Início e largura (em %) de cada zona na barra de 0 a 15. */
export function vneriBarSegments(): { zone: VneriZone; start: number; width: number }[] {
  let start = 0;
  return VNERI_ZONES.map((zone) => {
    const end = zone.upTo ? (zone.upTo.value / VNERI_BAR_MAX) * 100 : 100;
    const segment = { zone, start, width: end - start };
    start = end;
    return segment;
  });
}

export type VneriEvaluation =
  | {
      status: 'pending';
      missing: readonly string[];
      errors: Readonly<Partial<Record<VneriInputId, NumericFieldError>>>;
    }
  | {
      status: 'complete';
      value: number;
      zone: VneriZone;
      conduct: VneriConduct;
      inputs: Readonly<Record<VneriInputId, number>>;
    };

/** Valida PAD, FC e dose; só com os três dentro da faixa calcula e interpreta. */
export function evaluateVneri(raw: Readonly<Record<VneriInputId, string>>): VneriEvaluation {
  const missing: string[] = [];
  const errors: Partial<Record<VneriInputId, NumericFieldError>> = {};
  const values: Partial<Record<VneriInputId, number>> = {};
  for (const id of Object.keys(VNERI_INPUTS) as VneriInputId[]) {
    const input = VNERI_INPUTS[id];
    const checked = validateNumber(raw[id], input);
    if (checked.ok) values[id] = checked.value;
    else if (checked.error.kind === 'empty') missing.push(input.label);
    else errors[id] = checked.error;
  }
  const { pad, fc, doseNE } = values;
  if (pad === undefined || fc === undefined || doseNE === undefined) {
    return { status: 'pending', missing, errors };
  }
  const value = computeVneri(pad, doseNE, fc);
  return {
    status: 'complete',
    value,
    zone: vneriZone(value),
    conduct: vneriConduct(value),
    inputs: { pad, fc, doseNE },
  };
}

/** Tela do VNERi avulso (CC-317), com os textos da tela "VNERi" do ANY. */
export const VNERI_STANDALONE = {
  title: 'VNERi',
  subtitle: 'Vascular Norepinephrine Responsiveness index',
  info: {
    title: 'O que mede?',
    text: 'Avalia a responsividade vascular à noradrenalina no choque séptico. Valores baixos indicam que o vaso não responde bem à NE — considere terapia adjuvante. A curva de mortalidade tem formato de J invertido: mortalidade mínima em VNERi ~ 6,7.',
    formula: 'Fórmula: PAD / (dose NE × FC)',
  },
  notes: [
    'Goury et al. Ann Intensive Care 2025 — curva em J invertido, nadir de mortalidade em VNERi 6,7.',
    'Validado para choque séptico (Goury et al. Ann Intensive Care 2025).',
  ],
} as const;
