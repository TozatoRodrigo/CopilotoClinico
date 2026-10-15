import { formatCompact, formatDecimal } from '../numbers';
import type { ContentProvenance } from '../provenance';
import type { NumericRange } from '../ranges';
import { DOSE_STATUS_TONE, type DoseStatus, type ResultTone } from '../tone';

/**
 * Heparina não fracionada em infusão contínua (CC-312): início por peso e
 * indicação, e ajuste pelo nomograma de TTPa. Porte do `HeparinCalculator.tsx`
 * e do `calcHeparina` do ANY App v4, sem mudar bolus, teto nem faixa; o teste
 * diferencial roda o componente congelado do ANY.
 */

const PROVENANCE: ContentProvenance = {
  source: 'ANY App v4 · HeparinCalculator.tsx e calculations.ts (95c8fba)',
  version: '1.0.0',
  updatedAt: '2026-10-15',
  review: { status: 'pendente' },
};

export type HeparinIndication = 'sca' | 'tep';

export interface HeparinIndicationContent {
  label: string;
  bolusTitle: string;
  /** Regra por extenso, como o ANY mostra. */
  bolusText: string;
  bolusPerKg: number;
  /** Teto do bolus em UI; `null` = sem teto. */
  bolusCap: number | null;
  infusionText: string;
  infusionPerKg: number;
  /** Teto da infusão inicial em UI/h; `null` = sem teto. */
  infusionCap: number | null;
}

export interface NomogramRow {
  id: string;
  /** Faixa do TTPa/R por extenso ("1,2 - 1,5"). */
  range: string;
  bolusText: string;
  actionText: string;
  bolusPerKg: number;
  /** Mudança da dose, em UI/kg/h. */
  adjustment: number;
  /** Limite superior da faixa; a última não tem. */
  upTo?: { value: number; inclusive: boolean };
}

export const HEPARIN_PROTOCOL = {
  /** UI/mL da bolsa. */
  concentration: 100,
  preparation: '25.000 UI (1 frasco 5mL — 5.000UI/mL) + SF 0,9% qsp 250 mL',
  indications: {
    sca: {
      label: 'SCA',
      bolusTitle: 'Bolus inicial (SCA)',
      bolusText: '60 UI/kg (máx 4.000 UI)',
      bolusPerKg: 60,
      bolusCap: 4000,
      infusionText: '12 UI/kg/h (máx 1.000 UI/h)',
      infusionPerKg: 12,
      infusionCap: 1000,
    },
    tep: {
      label: 'TEP/TEV',
      bolusTitle: 'Bolus inicial (TEP/TEV)',
      bolusText: '80 UI/kg',
      bolusPerKg: 80,
      bolusCap: null,
      infusionText: '18 UI/kg/h',
      infusionPerKg: 18,
      infusionCap: null,
    },
  } satisfies Record<HeparinIndication, HeparinIndicationContent>,
  /** Nomograma por TTPa/R, na ordem do ANY. */
  nomogram: [
    {
      id: 'sub12',
      range: '< 1,2',
      bolusText: '80 UI/kg',
      actionText: '↑ 4 UI/kg/h',
      bolusPerKg: 80,
      adjustment: 4,
      upTo: { value: 1.2, inclusive: false },
    },
    {
      id: '12-15',
      range: '1,2 - 1,5',
      bolusText: '40 UI/kg',
      actionText: '↑ 2 UI/kg/h',
      bolusPerKg: 40,
      adjustment: 2,
      upTo: { value: 1.5, inclusive: false },
    },
    {
      id: 'alvo',
      range: '1,5 - 2,5',
      bolusText: '—',
      actionText: 'Manter',
      bolusPerKg: 0,
      adjustment: 0,
      upTo: { value: 2.5, inclusive: true },
    },
    {
      id: '25-30',
      range: '2,5 - 3,0',
      bolusText: '—',
      actionText: '↓ 2 UI/kg/h',
      bolusPerKg: 0,
      adjustment: -2,
      upTo: { value: 3.0, inclusive: true },
    },
    {
      id: 'sup30',
      range: '> 3,0',
      bolusText: 'Parar 1h',
      actionText: '↓ 3 UI/kg/h',
      bolusPerKg: 0,
      adjustment: -3,
    },
  ] satisfies NomogramRow[],
  provenance: PROVENANCE,
} as const;

/**
 * Faixas dos campos, definidas no porte (no ANY só se exigia número > 0). O
 * teto do TTPa/R barra o TTPa digitado em segundos no lugar da relação.
 * A confirmar na revisão clínica.
 */
export const HEPARIN_INPUT_RANGES = {
  ratio: { min: 0.2, max: 10, unit: '× controle' },
  currentDose: { min: 0, max: 40, unit: 'UI/kg/h' },
} as const satisfies Record<string, NumericRange>;

export interface HeparinStart {
  bolusUnits: number;
  bolusVolumeMl: number;
  unitsPerHour: number;
  mlh: number;
}

/** Início (`calcHeparina` do ANY): bolus e infusão por peso, com teto quando há. */
export function heparinStart(weightKg: number, indication: HeparinIndication): HeparinStart {
  const content: HeparinIndicationContent = HEPARIN_PROTOCOL.indications[indication];
  const bolusUnits = Math.min(weightKg * content.bolusPerKg, content.bolusCap ?? Infinity);
  const unitsPerHour = Math.min(weightKg * content.infusionPerKg, content.infusionCap ?? Infinity);
  return {
    bolusUnits,
    bolusVolumeMl: bolusUnits / HEPARIN_PROTOCOL.concentration,
    unitsPerHour,
    mlh: unitsPerHour / HEPARIN_PROTOCOL.concentration,
  };
}

/** Linha do nomograma para o TTPa/R (limites do ANY: < 1,2; < 1,5; ≤ 2,5; ≤ 3,0). */
export function heparinNomogramRow(ratio: number): NomogramRow {
  const rows: readonly NomogramRow[] = HEPARIN_PROTOCOL.nomogram;
  const row = rows.find(({ upTo }) =>
    upTo ? (upTo.inclusive ? ratio <= upTo.value : ratio < upTo.value) : true,
  );
  if (!row) throw new Error('nomograma sem última faixa');
  return row;
}

/** Cor do resultado no ajuste: segue o TTPa, não a velocidade (como no ANY). */
export function heparinStatus(ratio: number): DoseStatus {
  if (ratio < 1.2 || ratio > 3.0) return 'critical';
  if (ratio < 1.5 || ratio > 2.5) return 'caution';
  return 'therapeutic';
}

export function describeHeparinStatus(ratio: number): {
  status: DoseStatus;
  tone: ResultTone;
  label: string;
} {
  const status = heparinStatus(ratio);
  const label =
    status === 'therapeutic'
      ? 'TTPa no alvo'
      : ratio < 1.5
        ? status === 'critical'
          ? 'TTPa muito baixo'
          : 'TTPa abaixo do alvo'
        : status === 'critical'
          ? 'TTPa muito alto'
          : 'TTPa acima do alvo';
  return { status, tone: DOSE_STATUS_TONE[status], label };
}

export interface HeparinAdjustment {
  row: NomogramRow;
  extraBolusUnits: number;
  extraBolusMl: number;
  /** UI/kg/h, nunca negativa. */
  newDosePerKg: number;
  unitsPerHour: number;
  mlh: number;
  /** TTPa/R > 3,0: o ANY manda parar a infusão por 1 hora. */
  pauseOneHour: boolean;
}

/**
 * Ajuste pelo TTPa/R. Sem dose atual informada, parte da dose inicial por kg
 * da indicação (como o ANY). O teto da SCA (1.000 UI/h) não entra no ajuste,
 * como no ANY — achado para a revisão clínica.
 */
export function heparinAdjustment(
  weightKg: number,
  indication: HeparinIndication,
  ratio: number,
  currentDosePerKg: number | null,
): HeparinAdjustment {
  const row = heparinNomogramRow(ratio);
  const base = currentDosePerKg ?? HEPARIN_PROTOCOL.indications[indication].infusionPerKg;
  const newDosePerKg = Math.max(0, base + row.adjustment);
  const unitsPerHour = newDosePerKg * weightKg;
  const extraBolusUnits = row.bolusPerKg * weightKg;
  return {
    row,
    extraBolusUnits,
    extraBolusMl: extraBolusUnits / HEPARIN_PROTOCOL.concentration,
    newDosePerKg,
    unitsPerHour,
    mlh: unitsPerHour / HEPARIN_PROTOCOL.concentration,
    pauseOneHour: row.id === 'sup30',
  };
}

/** UI sem casa decimal ("4000 UI"), como no ANY. */
export function formatUnits(units: number): string {
  return `${formatDecimal(units, 0)} UI`;
}

/** Texto para o prontuário, sem nome de paciente nem horário. */
export function buildHeparinNote(input: {
  indication: HeparinIndication;
  weightKg: number;
  start?: HeparinStart;
  adjustment?: { ratio: number; result: HeparinAdjustment };
}): string {
  const content = HEPARIN_PROTOCOL.indications[input.indication];
  const lines: string[] = [];
  if (input.adjustment) {
    const { ratio, result } = input.adjustment;
    lines.push(
      `Heparina (${content.label}), ajuste por TTPa/R ${formatCompact(ratio)} (faixa ${result.row.range}): nova dose ${formatDecimal(result.newDosePerKg)} UI/kg/h = ${formatUnits(result.unitsPerHour)}/h = ${formatDecimal(result.mlh)} mL/h.`,
      `- Bolus adicional: ${result.extraBolusUnits > 0 ? `${formatUnits(result.extraBolusUnits)} (${formatDecimal(result.extraBolusMl)} mL)` : 'nenhum'}`,
    );
    if (result.pauseOneHour) lines.push('- Nomograma: parar a infusão por 1 hora');
  } else if (input.start) {
    lines.push(
      `Heparina (${content.label}), início: bolus ${formatUnits(input.start.bolusUnits)}; infusão ${formatUnits(input.start.unitsPerHour)}/h = ${formatDecimal(input.start.mlh)} mL/h.`,
      `- Regra: bolus ${content.bolusText}; infusão ${content.infusionText}`,
    );
  }
  lines.push(
    `- Peso: ${formatCompact(input.weightKg, 1)} kg`,
    `- Diluição: ${HEPARIN_PROTOCOL.preparation} (${HEPARIN_PROTOCOL.concentration} UI/mL)`,
  );
  return lines.join('\n');
}
