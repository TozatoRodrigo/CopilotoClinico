import { ACLS_MEDICATIONS, ACLS_PROVENANCE, COMPRESSION_FRACTION_TARGET_PERCENT } from './content';
import { aclsElapsedSeconds, formatElapsed, type AclsState } from './session';

/**
 * Relatório da parada para colar no prontuário (CC-314): o `generateReport`
 * do ANY, com três diferenças (revisão clínica, seção 3):
 * - o tempo total para no fim da parada, não na hora em que o relatório foi
 *   aberto;
 * - cada linha da linha do tempo traz também o horário de relógio;
 * - uma linha resume as medicações.
 * Sem nome nem identificação do paciente: o prontuário já sabe de quem é.
 *
 * Datas e horas no fuso do aparelho, como no ANY.
 */

export const ACLS_REPORT_TITLE = 'RELATÓRIO DE PCR — Copiloto Clínico (ACLS)';

const pad = (value: number) => String(value).padStart(2, '0');

/** "15/10/2026" no fuso do aparelho. */
export function formatClockDate(at: number): string {
  const date = new Date(at);
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

/** "14:30" no fuso do aparelho. */
export function formatClockTime(at: number): string {
  const date = new Date(at);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Ritmo do primeiro registro de ritmo ("FV/TV sem pulso"), como no ANY. */
export function initialRhythmLabel(state: AclsState): string {
  return state.events.find(({ type }) => type === 'rhythm')?.detail ?? '---';
}

/** "Epinefrina 1 mg IV/IO ×3; Amiodarona 300 mg IV ×1", na ordem da tela. */
export function medicationSummary(state: AclsState): string {
  const given = ACLS_MEDICATIONS.flatMap(({ id, name }) => {
    const count = state.medicationCounts[id] ?? 0;
    return count > 0 ? [`${name} ×${count}`] : [];
  });
  return given.length > 0 ? given.join('; ') : 'nenhuma';
}

/** Texto do relatório; `null` enquanto a parada não terminou. */
export function buildAclsReport(state: AclsState, number: number): string | null {
  if (state.status !== 'finished' || state.startedAt === null || state.endedAt === null) {
    return null;
  }
  const elapsed = aclsElapsedSeconds(state, state.endedAt);
  const lines = [
    ACLS_REPORT_TITLE,
    `Atendimento #${number}`,
    `Data: ${formatClockDate(state.startedAt)} | Início: ${formatClockTime(state.startedAt)}`,
    `Ritmo inicial: ${initialRhythmLabel(state)}`,
    `Tempo total: ${formatElapsed(elapsed)}`,
    `Ciclos de RCP: ${state.cycleCount}`,
    `Choques: ${state.shockCount}`,
    `Medicações: ${medicationSummary(state)}`,
    `Desfecho: ${state.outcome === 'rosc' ? 'RCE obtido' : 'Óbito'}`,
  ];
  if (elapsed > 0) {
    // Como no ANY: conta as pausas encerradas (revisão clínica, item 1.10).
    const pauseSeconds = Math.round(state.totalPauseMs / 1000);
    const compressionSeconds = Math.max(0, elapsed - pauseSeconds);
    const fraction = Math.round((compressionSeconds / elapsed) * 100);
    const belowTarget =
      fraction < COMPRESSION_FRACTION_TARGET_PERCENT
        ? ` (meta: acima de ${COMPRESSION_FRACTION_TARGET_PERCENT}%)`
        : '';
    lines.push(
      `Tempo total de compressão: ${formatElapsed(compressionSeconds)}`,
      `Tempo em pausa: ${formatElapsed(pauseSeconds)}`,
      `Fração de compressão torácica: ${fraction}%${belowTarget}`,
    );
  }
  lines.push(
    '',
    'LINHA DO TEMPO:',
    ...state.events.map(
      (event) =>
        `  ${formatElapsed(event.elapsedSeconds)} (${formatClockTime(event.at)}) — ${event.detail}`,
    ),
    `Fim: ${formatClockTime(state.endedAt)}`,
    '',
    `AHA 2025 | Copiloto Clínico · conteúdo ACLS v${ACLS_PROVENANCE.version}`,
  );
  return lines.join('\n');
}
