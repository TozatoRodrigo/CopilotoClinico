import { formatCompact } from '../numbers';
import type { ContentProvenance } from '../provenance';
import type { NumericRange } from '../ranges';
import { DOSE_STATUS_TONE, type DoseStatus, type ResultTone } from '../tone';

/**
 * Insulina regular em infusão contínua (CC-312): tabela por glicemia no
 * início e, no ajuste, a mesma tabela corrigida pela queda da última hora.
 * Porte do `InsulinCalculator.tsx` do ANY App v4, sem mudar faixa, bolus nem
 * infusão; o teste diferencial roda o componente congelado do ANY.
 *
 * Diluição de 1 UI/mL: UI/h e mL/h são o mesmo número.
 */

const PROVENANCE: ContentProvenance = {
  source: 'ANY App v4 · InsulinCalculator.tsx (95c8fba)',
  version: '1.0.0',
  updatedAt: '2026-10-15',
  review: { status: 'pendente' },
};

export interface InsulinRow {
  id: string;
  /** Faixa de glicemia por extenso, em mg/dL. */
  range: string;
  bolusText: string;
  infusionText: string;
  /** Bolus em UI. */
  bolus: number;
  /** Infusão em UI/h. */
  infusion: number;
  /** Limite superior da faixa; a última não tem. */
  upTo?: { value: number; inclusive: boolean };
}

export const INSULIN_PROTOCOL = {
  /** UI/mL da bolsa. */
  concentration: 1,
  preparation: '100 UI (1 frasco 10mL — 100UI/mL) + SF 0,9% 100 mL',
  /** Tabela por glicemia, na ordem do ANY. */
  table: [
    {
      id: 'hipo',
      range: '< 70',
      bolusText: '—',
      infusionText: 'Corrigir hipo',
      bolus: 0,
      infusion: 0,
      upTo: { value: 70, inclusive: false },
    },
    {
      id: 'baixa',
      range: '70 - 140',
      bolusText: '—',
      infusionText: 'Não iniciar',
      bolus: 0,
      infusion: 0,
      upTo: { value: 140, inclusive: true },
    },
    {
      id: 'alvo',
      range: '141 - 180',
      bolusText: '—',
      infusionText: '1',
      bolus: 0,
      infusion: 1,
      upTo: { value: 180, inclusive: true },
    },
    {
      id: '181-200',
      range: '181 - 200',
      bolusText: '—',
      infusionText: '2',
      bolus: 0,
      infusion: 2,
      upTo: { value: 200, inclusive: true },
    },
    {
      id: '201-250',
      range: '201 - 250',
      bolusText: '3',
      infusionText: '2',
      bolus: 3,
      infusion: 2,
      upTo: { value: 250, inclusive: true },
    },
    {
      id: '251-300',
      range: '251 - 300',
      bolusText: '6',
      infusionText: '3',
      bolus: 6,
      infusion: 3,
      upTo: { value: 300, inclusive: true },
    },
    {
      id: '301-350',
      range: '301 - 350',
      bolusText: '9',
      infusionText: '3',
      bolus: 9,
      infusion: 3,
      upTo: { value: 350, inclusive: true },
    },
    { id: 'sup350', range: '> 350', bolusText: '10', infusionText: '4', bolus: 10, infusion: 4 },
  ] satisfies InsulinRow[],
  provenance: PROVENANCE,
} as const;

/**
 * Faixas dos campos, definidas no porte (no ANY qualquer número passava).
 * A confirmar na revisão clínica.
 */
export const INSULIN_INPUT_RANGES = {
  glucose: { min: 10, max: 2000, unit: 'mg/dL' },
  currentInfusion: { min: 0, max: 50, unit: 'UI/h' },
} as const satisfies Record<string, NumericRange>;

export function insulinRow(glucose: number): InsulinRow {
  const rows: readonly InsulinRow[] = INSULIN_PROTOCOL.table;
  const row = rows.find(({ upTo }) =>
    upTo ? (upTo.inclusive ? glucose <= upTo.value : glucose < upTo.value) : true,
  );
  if (!row) throw new Error('tabela de insulina sem última faixa');
  return row;
}

/** Cor do resultado: < 70 ou > 300 crítico; < 140 ou > 180 atenção (como no ANY). */
export function insulinStatus(glucose: number): DoseStatus {
  if (glucose < 70 || glucose > 300) return 'critical';
  if (glucose < 140 || glucose > 180) return 'caution';
  return 'therapeutic';
}

export function describeInsulinStatus(glucose: number): {
  status: DoseStatus;
  tone: ResultTone;
  label: string;
} {
  const status = insulinStatus(glucose);
  const label =
    status === 'therapeutic'
      ? 'Glicemia no alvo'
      : glucose < 70
        ? 'Hipoglicemia'
        : glucose < 140
          ? 'Glicemia abaixo do alvo'
          : status === 'critical'
            ? 'Glicemia muito alta'
            : 'Glicemia acima do alvo';
  return { status, tone: DOSE_STATUS_TONE[status], label };
}

export type InsulinBolus =
  | { kind: 'nenhum' }
  | { kind: 'ui'; units: number }
  /** Glicemia < 70 no ajuste: parar a infusão (o "PARAR" do ANY). */
  | { kind: 'parar' };

export type InsulinInfusion =
  | { kind: 'ui-h'; unitsPerHour: number; reduction: 'metade' | 'menos-1' | null }
  | { kind: 'corrigir-hipo' }
  | { kind: 'nao-iniciar' }
  /** Glicemia < 70 no ajuste: glicose 50% 40 mL. */
  | { kind: 'glicose-50' }
  /** Glicemia 70–140 no ajuste com infusão correndo: parar ou cortar pela metade. */
  | { kind: 'parar-ou-metade'; halved: number };

export interface InsulinSuggestion {
  row: InsulinRow;
  bolus: InsulinBolus;
  infusion: InsulinInfusion;
}

/** Início: bolus e infusão pela tabela. */
export function insulinStart(glucose: number): InsulinSuggestion {
  const row = insulinRow(glucose);
  return {
    row,
    // Como no ANY: a partir de 140 o bolus é o da tabela, mesmo quando é 0.
    bolus: glucose < 140 ? { kind: 'nenhum' } : { kind: 'ui', units: row.bolus },
    infusion:
      glucose < 70
        ? { kind: 'corrigir-hipo' }
        : glucose <= 140
          ? { kind: 'nao-iniciar' }
          : { kind: 'ui-h', unitsPerHour: row.infusion, reduction: null },
  };
}

export type InsulinTrendReading = 'queda-rapida' | 'queda-moderada' | 'queda-leve' | 'subindo';

export interface InsulinTrend {
  /** Glicemia anterior − atual, em mg/dL em 1 hora (positivo = caiu). */
  drop: number;
  reading: InsulinTrendReading;
  /** "↓ 60 mg/dL/h". */
  dropText: string;
  /** Leitura do ANY ("Queda moderada → ↓ 1 UI/h"). */
  readingText: string;
}

const READING_TEXT: Record<InsulinTrendReading, string> = {
  'queda-rapida': 'Queda rápida → ↓ 50%',
  'queda-moderada': 'Queda moderada → ↓ 1 UI/h',
  'queda-leve': 'Queda leve → seguir tabela',
  subindo: 'Subindo → seguir tabela',
};

/** Variação em relação à glicemia de 1 hora antes. */
export function insulinTrend(current: number, previous: number): InsulinTrend {
  const drop = previous - current;
  const reading: InsulinTrendReading =
    drop > 100
      ? 'queda-rapida'
      : drop > 50
        ? 'queda-moderada'
        : drop >= 0
          ? 'queda-leve'
          : 'subindo';
  return {
    drop,
    reading,
    dropText: `${drop >= 0 ? '↓ ' : '↑ '}${formatCompact(Math.abs(drop))} mg/dL/h`,
    readingText: READING_TEXT[reading],
  };
}

/**
 * Ajuste (regras do ANY):
 * - < 70: parar a infusão e glicose 50% 40 mL;
 * - 70–140: com infusão correndo, parar ou cortar pela metade; sem, não iniciar;
 * - 141–180: manter a infusão atual; acima, a infusão da tabela;
 * - em ambos, queda > 100 mg/dL/h corta a infusão atual pela metade e queda
 *   > 50, em 1 UI/h.
 * Infusão atual 0 equivale a "não informada" no ANY.
 */
export function insulinAdjustment(
  current: number,
  previous: number | null,
  currentInfusion: number,
): InsulinSuggestion {
  const row = insulinRow(current);
  if (current < 70) return { row, bolus: { kind: 'parar' }, infusion: { kind: 'glicose-50' } };
  if (current <= 140) {
    return {
      row,
      bolus: { kind: 'nenhum' },
      infusion:
        currentInfusion > 0
          ? { kind: 'parar-ou-metade', halved: Math.floor(currentInfusion / 2) }
          : { kind: 'nao-iniciar' },
    };
  }
  let unitsPerHour = current <= 180 ? currentInfusion : row.infusion;
  let reduction: 'metade' | 'menos-1' | null = null;
  if (previous !== null && currentInfusion) {
    const drop = previous - current;
    if (drop > 100) {
      unitsPerHour = Math.max(0, Math.floor(currentInfusion / 2));
      reduction = 'metade';
    } else if (drop > 50) {
      unitsPerHour = Math.max(0, currentInfusion - 1);
      reduction = 'menos-1';
    }
  }
  return {
    row,
    bolus: row.bolus > 0 ? { kind: 'ui', units: row.bolus } : { kind: 'nenhum' },
    infusion: { kind: 'ui-h', unitsPerHour, reduction },
  };
}

/** Bolus por extenso ("6 UI", "—", "Parar a infusão"). */
export function formatInsulinBolus(bolus: InsulinBolus): string {
  switch (bolus.kind) {
    case 'nenhum':
      return '—';
    case 'ui':
      return `${formatCompact(bolus.units)} UI`;
    case 'parar':
      return 'Parar a infusão';
  }
}

/** Infusão por extenso ("2 UI/h (↓ 1)", "Glicose 50% 40 mL"). */
export function formatInsulinInfusion(infusion: InsulinInfusion): string {
  switch (infusion.kind) {
    case 'ui-h': {
      const note =
        infusion.reduction === 'metade'
          ? ' (↓ 50%)'
          : infusion.reduction === 'menos-1'
            ? ' (↓ 1)'
            : '';
      return `${formatCompact(infusion.unitsPerHour)} UI/h${note}`;
    }
    case 'corrigir-hipo':
      return 'Corrigir a hipoglicemia';
    case 'nao-iniciar':
      return 'Não iniciar';
    case 'glicose-50':
      return 'Glicose 50% 40 mL';
    case 'parar-ou-metade':
      return `Parar ou reduzir 50% (${formatCompact(infusion.halved)} UI/h)`;
  }
}

/** Texto para o prontuário, sem nome de paciente nem horário. */
export function buildInsulinNote(input: {
  phase: 'inicio' | 'ajuste';
  glucose: number;
  previous: number | null;
  currentInfusion: number | null;
  suggestion: InsulinSuggestion;
}): string {
  const title = input.phase === 'inicio' ? 'início' : 'ajuste';
  const lines = [
    `Insulina regular em infusão (${title}): glicemia ${formatCompact(input.glucose)} mg/dL (faixa ${input.suggestion.row.range}).`,
    `- Bolus: ${formatInsulinBolus(input.suggestion.bolus)}`,
    `- Infusão: ${formatInsulinInfusion(input.suggestion.infusion)}`,
  ];
  if (input.phase === 'ajuste') {
    if (input.currentInfusion !== null) {
      lines.push(`- Infusão atual: ${formatCompact(input.currentInfusion)} UI/h`);
    }
    if (input.previous !== null) {
      const trend = insulinTrend(input.glucose, input.previous);
      lines.push(
        `- Glicemia 1 h antes: ${formatCompact(input.previous)} mg/dL (${trend.dropText})`,
      );
    }
  }
  lines.push(
    `- Diluição: ${INSULIN_PROTOCOL.preparation} (${INSULIN_PROTOCOL.concentration} UI/mL; UI/h = mL/h)`,
  );
  return lines.join('\n');
}
