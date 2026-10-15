import { validateWeight, type NumericFieldResult } from '../ranges';
import { HYDRATION_KEYS, type FigureDetail, type HydrationKey, type VolumeText } from './content';

/**
 * Volumes de hidratação da dengue por peso (CC-325). Mesma aritmética do
 * `calcDengueHydration` do ANY, expressão por expressão: o teste diferencial
 * (tests/clinical-tools/dengue-differential.spec.ts) exige o mesmo número, sem
 * tolerância, em 1.000 pesos.
 *
 * Só para adulto: o ANY é "para adultos (≥15 anos)" e só calcula com peso de
 * 40 a 200 kg. Fora disso (ou sem peso) tudo vira "--".
 */
export type DengueHydration = Readonly<Record<HydrationKey, number>>;

/** Volume de albumina 20% por frasco (frasco de 50 mL = 10 g). */
export const ALBUMIN_VIAL_ML = 50;

export function dengueHydration(weightKg: number): DengueHydration {
  return {
    // VO 60 mL/kg/dia: 1/3 em SRO, 2/3 em outros líquidos.
    oralTotal: weightKg * 60,
    oralSro: (weightKg * 60) / 3,
    oralLiquids: (weightKg * 60 * 2) / 3,
    // Grupo C: 10 mL/kg/h por 2 h.
    ivHourly: weightKg * 10,
    iv2h: weightKg * 10 * 2,
    // Manutenção: 25 mL/kg em 6 h e depois em 8 h (o volume é o mesmo).
    maintenance6h: weightKg * 25,
    maintenance8h: weightKg * 25,
    // Grupo D: bolus de 20 mL/kg.
    bolus: weightKg * 20,
    // Albumina 0,5 e 1 g/kg, em mL de albumina 20% (0,2 g/mL).
    albuminLow: (weightKg * 0.5) / 0.2,
    albuminHigh: (weightKg * 1) / 0.2,
  };
}

export type DengueHydrationResult =
  | { ok: true; weightKg: number; hydration: DengueHydration }
  | { ok: false; error: Extract<NumericFieldResult, { ok: false }>['error'] };

/** Peso digitado → volumes. Peso fora de 40–200 kg nunca vira volume. */
export function hydrationForWeight(raw: string): DengueHydrationResult {
  const weight = validateWeight(raw, 'adulto');
  if (!weight.ok) return weight;
  return { ok: true, weightKg: weight.value, hydration: dengueHydration(weight.value) };
}

/**
 * mL inteiros com ponto de milhar ("4.200"); sem valor, "--". É o `fmtInt`
 * do ANY (`Math.round(n).toLocaleString('pt-BR')`) sem depender do ICU do
 * aparelho: o resultado é o mesmo em qualquer navegador e no Node.
 */
export function formatMilliliters(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '--';
  const rounded = Math.round(value);
  const digits = String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return rounded < 0 ? `-${digits}` : digits;
}

/** Frascos de albumina 20% para o volume (arredonda para cima, como o ANY). */
export function albuminVials(volumeMl: number): number {
  return Math.ceil(volumeMl / ALBUMIN_VIAL_ML);
}

const PLACEHOLDER = /\{(\w+)(?:\/(\d+))?\}/g;

function isHydrationKey(key: string): key is HydrationKey {
  return (HYDRATION_KEYS as readonly string[]).includes(key);
}

/**
 * Preenche os marcadores de um texto com volume: "{oralSro}" vira "1.400" e
 * "{maintenance6h/6}", o volume dividido por 6 ("292"). Sem peso válido,
 * "--". Marcador desconhecido é erro de conteúdo e falha alto.
 */
export function fillVolumeText(text: VolumeText, hydration: DengueHydration | null): string {
  return text.replace(PLACEHOLDER, (_match, key: string, divisor: string | undefined) => {
    if (!isHydrationKey(key)) {
      throw new Error(`Marcador de volume desconhecido: {${key}}`);
    }
    if (!hydration) return '--';
    const value = hydration[key];
    return formatMilliliters(divisor ? value / Number(divisor) : value);
  });
}

/** Linha de apoio de um volume, já preenchida ("292 mL/h", "4 frascos"). */
export function formatFigureDetail(
  detail: FigureDetail,
  hydration: DengueHydration | null,
): string {
  switch (detail.kind) {
    case 'text':
      return fillVolumeText(detail.text, hydration);
    case 'rate':
      return hydration
        ? `${formatMilliliters(hydration[detail.volume] / detail.hours)} mL/h`
        : '--';
    case 'vials': {
      if (!hydration) return '--';
      const vials = albuminVials(hydration[detail.volume]);
      return `${vials} ${vials === 1 ? 'frasco' : 'frascos'}`;
    }
  }
}
