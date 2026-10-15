import { formatCompact } from '../numbers';
import type { BiologicalSex } from './content';

/**
 * Tamanho do tubo e dos dispositivos extraglóticos, como no AirwayGuide do
 * ANY App v4 (`getTubeSize`, `getDEGSize`, `getTLSize`): tubo pelo sexo,
 * máscara laríngea pelo peso e tubo laríngeo pela altura.
 */

/** Tubo orotraqueal sugerido, em mm de diâmetro interno: o primeiro e a alternativa. */
export const TUBE_SIZE_BY_SEX: Readonly<Record<BiologicalSex, readonly [number, number]>> = {
  M: [8.5, 8.0],
  F: [8.0, 7.5],
};

/** "8,5 ou 8,0 mm". */
export function suggestedTube(sex: BiologicalSex): string {
  const [first, alternative] = TUBE_SIZE_BY_SEX[sex];
  return `${first.toFixed(1).replace('.', ',')} ou ${alternative.toFixed(1).replace('.', ',')} mm`;
}

interface SizeBand {
  /** Vale para valores abaixo deste limite. */
  below: number;
  size: number;
}

/** Máscara laríngea pelo peso: < 50 kg → 3; < 70 kg → 4; senão 5. */
export const LARYNGEAL_MASK_BY_WEIGHT = {
  bands: [
    { below: 50, size: 3 },
    { below: 70, size: 4 },
  ],
  otherwise: 5,
} as const satisfies { bands: readonly SizeBand[]; otherwise: number };

/** Tubo laríngeo pela altura: < 155 cm → 3; < 180 cm → 4; senão 5. */
export const LARYNGEAL_TUBE_BY_HEIGHT = {
  bands: [
    { below: 155, size: 3 },
    { below: 180, size: 4 },
  ],
  otherwise: 5,
} as const satisfies { bands: readonly SizeBand[]; otherwise: number };

function sizeFor(table: { bands: readonly SizeBand[]; otherwise: number }, value: number): number {
  return table.bands.find(({ below }) => value < below)?.size ?? table.otherwise;
}

export function laryngealMaskSize(weightKg: number): number {
  return sizeFor(LARYNGEAL_MASK_BY_WEIGHT, weightKg);
}

export function laryngealTubeSize(heightCm: number): number {
  return sizeFor(LARYNGEAL_TUBE_BY_HEIGHT, heightCm);
}

/**
 * Texto do DEG no plano B: "Máscara laríngea: tamanho 4 | Tubo laríngeo:
 * tamanho 4" (o tubo laríngeo só com altura). Sem peso não há tamanho: o ANY
 * caía para 70 kg; aqui a tela pede o peso.
 */
export function supraglotticDeviceText(weightKg: number | null, heightCm: number | null): string {
  const parts = [
    weightKg === null
      ? 'Máscara laríngea: informe o peso'
      : `Máscara laríngea: tamanho ${formatCompact(laryngealMaskSize(weightKg))}`,
  ];
  if (heightCm !== null) {
    parts.push(`Tubo laríngeo: tamanho ${formatCompact(laryngealTubeSize(heightCm))}`);
  }
  return parts.join(' | ');
}
