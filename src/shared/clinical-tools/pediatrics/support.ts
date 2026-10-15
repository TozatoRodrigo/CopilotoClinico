import { hollidaySegarMlPerHour } from './bolus';

/**
 * Apoio da emergência pediátrica (CC-320): parâmetros de RCP, desfibrilação,
 * causas reversíveis, checklist de intubação, fluidos, transfusão e sinais
 * vitais do PedGuide v4, e acessos e drenos do HETRIN Ped. Textos e contas
 * são os do ANY; o teste diferencial confere contra a tela congelada.
 */

/** Parâmetros fixos de RCP pediátrica (PALS/AHA), como a tela de PCR do ANY. */
export const CPR_PARAMETERS: readonly { label: string; value: string; note?: string }[] = [
  { label: 'Frequência', value: '100-120/min' },
  { label: 'C:V — 2 socorristas', value: '15:2', note: '30:2 se 1 socorrista ou pós-puberdade' },
  { label: 'Com TOT', value: '1 a cada 2-3s', note: 'compressões contínuas, sem pausa' },
];

/** Profundidade da compressão pelo peso. */
export function compressionDepth(kg: number): string {
  if (kg < 10) return '1/3 AP (~4cm)';
  if (kg < 30) return '1/3 AP (~5cm)';
  return '5-6 cm';
}

export interface DefibrillationEnergy {
  /** 1ª desfibrilação, 2 J/kg. */
  first: number;
  /** 2ª desfibrilação, 4 J/kg. */
  second: number;
  /** Cardioversão sincronizada, 0,5–1 J/kg. */
  cardioversion: readonly [number, number];
  /** Cardioversão refratária, 2 J/kg. */
  refractory: number;
}

/** Energia em joules, arredondada como no ANY (PALS 2025). Sem teto, como o PedGuide v4. */
export function defibrillationEnergy(kg: number): DefibrillationEnergy {
  return {
    first: Math.round(kg * 2),
    second: Math.round(kg * 4),
    cardioversion: [Math.round(kg * 0.5), Math.round(kg)],
    refractory: Math.round(kg * 2),
  };
}

export const REVERSIBLE_CAUSES = {
  h: [
    'Hipóxia',
    'Hipovolemia',
    'Hidrogênio (Acidose)',
    'Hipoglicemia',
    'Hipo/Hipercalemia',
    'Hipotermia',
  ],
  t: [
    'Tensão (Pneumotórax)',
    'Tamponamento cardíaco',
    'Toxinas',
    'Trombose pulmonar (TEP)',
    'Trombose coronariana',
    'Trauma',
  ],
} as const;

export type ChecklistEquipmentKey = 'blade' | 'tube' | 'bougie' | 'laryngealMask';

/** Checklist de intubação do ANY; quatro itens mostram o material da cor ao lado. */
export const IOT_CHECKLIST: readonly { text: string; equipment?: ChecklistEquipmentKey }[] = [
  { text: 'Monitorização (SpO₂, ECG, ETCO2, PA)' },
  { text: 'Acesso venoso pérvio' },
  { text: 'Pré-oxigenação (FiO₂ 100%, 3 min)' },
  { text: 'Aspirador montado e testado' },
  { text: 'Laringoscópio com luz testada', equipment: 'blade' },
  { text: 'Tubo traqueal + 1 menor', equipment: 'tube' },
  { text: 'Cuff testado' },
  { text: 'Bougie / Guia disponível', equipment: 'bougie' },
  { text: 'Máscara laríngea disponível', equipment: 'laryngealMask' },
  { text: 'Bolsa-válvula-máscara conectada O2' },
  { text: 'Drogas preparadas e identificadas' },
  { text: 'Plano VA difícil definido' },
];

export interface FluidVolumes {
  /** Bolus de cristaloide, 20 mL/kg. */
  bolusMl: number;
  /** Manutenção de Holliday-Segar (mL/h). */
  maintenanceMlPerHour: number;
  /** Volemia estimada, 80 mL/kg. */
  bloodVolumeMl: number;
}

export function fluidVolumes(kg: number): FluidVolumes {
  return {
    bolusMl: kg * 20,
    maintenanceMlPerHour: hollidaySegarMlPerHour(kg),
    bloodVolumeMl: kg * 80,
  };
}

export interface TransfusionComponent {
  id: 'hemacias' | 'plasma' | 'plaquetas' | 'crioprecipitado';
  name: string;
  /** Dose por extenso ("10-15 mL/kg"). */
  dose: string;
  mlPerKg: readonly [number, number];
}

export const TRANSFUSION_COMPONENTS: readonly TransfusionComponent[] = [
  { id: 'hemacias', name: 'Concentrado de Hemácias', dose: '10-15 mL/kg', mlPerKg: [10, 15] },
  { id: 'plasma', name: 'Plasma Fresco', dose: '10-15 mL/kg', mlPerKg: [10, 15] },
  { id: 'plaquetas', name: 'Plaquetas', dose: '5-10 mL/kg', mlPerKg: [5, 10] },
  { id: 'crioprecipitado', name: 'Crioprecipitado', dose: '5-10 mL/kg', mlPerKg: [5, 10] },
];

/** Volume de cada hemocomponente para o peso, em mL (faixa). */
export function transfusionVolumes(kg: number, component: TransfusionComponent): [number, number] {
  return [kg * component.mlPerKg[0], kg * component.mlPerKg[1]];
}

/** Protocolo de transfusão maciça do ANY, em linguagem de sugestão. */
export const MASSIVE_TRANSFUSION = {
  title: 'Protocolo de transfusão maciça pediátrica',
  trigger: 'Considere ativar com perda > 40 mL/kg ou > 50% da volemia.',
  ratio: 'Proporção alvo: CH:PFC:Plaq = 1:1:1.',
} as const;

export const VITAL_SIGN_AGES = [
  '< 1 ano',
  '1-2 anos',
  '3-5 anos',
  '6-11 anos',
  '> 12 anos',
] as const;

export const VITAL_SIGNS: readonly { label: string; values: readonly string[] }[] = [
  { label: 'FC (bpm)', values: ['100-190', '80-160', '75-120', '70-110', '60-110'] },
  { label: 'FR (irpm)', values: ['30-60', '20-40', '20-30', '18-25', '12-20'] },
];

/** PAS mínima estimada: 70 + 2 × idade; a partir de 10 anos (acima de 10), piso de 90 mmHg. */
export function minimumSystolicPressure(ageYears: number): number {
  return ageYears > 10 ? 90 : Math.round(70 + 2 * ageYears);
}

export interface AccessEquipment {
  centralVenousCatheter: string;
  /** French. */
  chestDrain: string;
  /** Gauge. */
  needleDecompression: string;
  /** Gauge. */
  arterialLine: string;
  /** French. */
  urinaryCatheter: string;
}

/**
 * Acessos e drenos por peso e idade (CC-320), do HETRIN Ped: só existem lá.
 * Pede a idade; sem ela não há sugestão.
 */
export function accessEquipment(kg: number, ageYears: number | null): AccessEquipment | null {
  if (!(kg > 0) || ageYears === null) return null;
  const w = kg;
  const age = ageYears;
  return {
    centralVenousCatheter:
      w < 3
        ? '3 Fr/24G'
        : w < 10
          ? '3 Fr/22G'
          : age < 2
            ? '4 Fr/20-22G'
            : age < 4
              ? '5 Fr/20G'
              : age < 8
                ? '5 Fr/18G'
                : age < 12
                  ? '6 Fr/16-18G'
                  : age < 14
                    ? '6-7 Fr/16G'
                    : '6-7 Fr/14-16G',
    chestDrain:
      w < 3
        ? '8-10'
        : w < 10
          ? '10-12'
          : age < 4
            ? '16-20'
            : age < 8
              ? '20-28'
              : age < 14
                ? '28-32'
                : '32-38',
    needleDecompression: w < 3 ? '20' : age < 4 ? '18' : age < 8 ? '16' : '14',
    arterialLine: w < 3 ? '24' : age < 2 ? '22-24' : age < 8 ? '22' : age < 12 ? '20-22' : '20',
    urinaryCatheter: w < 3 ? '4-6' : w < 10 ? '6-8' : age < 6 ? '8-10' : age < 14 ? '10-12' : '14',
  };
}
