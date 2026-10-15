import { buildAclsReport, formatClockDate, formatClockTime, initialRhythmLabel } from './report';
import { aclsElapsedSeconds, type AclsState } from './session';

/**
 * Histórico de paradas (CC-314): o `acls_records` do ANY, tipado. Fica só no
 * aparelho (decisão no ADR-017, item 9): resumo e relatório de cada parada,
 * sem identificação do paciente, com opção de apagar um ou todos. Nada vai
 * para o servidor.
 */

/** Paradas guardadas no aparelho; passando disso, sai a mais antiga. */
export const ACLS_HISTORY_LIMIT = 50;

export interface AclsHistoryRecord {
  id: string;
  /** Número do atendimento no aparelho ("Atendimento #3"). */
  number: number;
  /** "15/10/2026". */
  date: string;
  /** "14:30". */
  startTime: string;
  endTime: string;
  initialRhythm: string;
  outcome: 'RCE' | 'Óbito';
  cycles: number;
  shocks: number;
  durationSeconds: number;
  /** O relatório, como foi gerado. */
  report: string;
}

/** Próximo número: um a mais que o maior guardado (apagar um não repete número). */
export function nextReportNumber(records: readonly AclsHistoryRecord[]): number {
  return records.reduce((max, record) => Math.max(max, record.number), 0) + 1;
}

/** Registro da parada encerrada; `null` se ela ainda não terminou. */
export function createAclsHistoryRecord(
  state: AclsState,
  { id, number }: { id: string; number: number },
): AclsHistoryRecord | null {
  const report = buildAclsReport(state, number);
  if (report === null || state.startedAt === null || state.endedAt === null) return null;
  return {
    id,
    number,
    date: formatClockDate(state.startedAt),
    startTime: formatClockTime(state.startedAt),
    endTime: formatClockTime(state.endedAt),
    initialRhythm: initialRhythmLabel(state),
    outcome: state.outcome === 'rosc' ? 'RCE' : 'Óbito',
    cycles: state.cycleCount,
    shocks: state.shockCount,
    durationSeconds: aclsElapsedSeconds(state, state.endedAt),
    report,
  };
}

/** Acrescenta no fim e mantém só as `limit` mais recentes. */
export function addToHistory(
  records: readonly AclsHistoryRecord[],
  record: AclsHistoryRecord,
  limit = ACLS_HISTORY_LIMIT,
): AclsHistoryRecord[] {
  return [...records.filter(({ id }) => id !== record.id), record].slice(-limit);
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is AclsHistoryRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    isCount(record.number) &&
    typeof record.date === 'string' &&
    typeof record.startTime === 'string' &&
    typeof record.endTime === 'string' &&
    typeof record.initialRhythm === 'string' &&
    (record.outcome === 'RCE' || record.outcome === 'Óbito') &&
    isCount(record.cycles) &&
    isCount(record.shocks) &&
    isCount(record.durationSeconds) &&
    typeof record.report === 'string'
  );
}

/** Lê o histórico salvo sem confiar no formato: entrada estranha é descartada. */
export function parseAclsHistory(value: unknown): AclsHistoryRecord[] {
  return Array.isArray(value) ? value.filter(isRecord).slice(-ACLS_HISTORY_LIMIT) : [];
}
