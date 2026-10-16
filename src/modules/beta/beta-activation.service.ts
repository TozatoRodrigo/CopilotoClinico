import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import {
  BETA_ACTIVATION_TARGET,
  BETA_ACTIVATION_WINDOW_HOURS,
  type BetaActivationCounts,
  type BetaActivationReport,
} from '../../shared/contracts/beta';

/** Uma linha por médico cadastrado na janela. Só datas e o lote: nenhum conteúdo clínico. */
export interface ActivationRow {
  physician_id: string;
  created_at: Date;
  batch_label: string | null;
  first_analysis_at: Date | null;
  first_real_analysis_at: Date | null;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const WINDOW_MS = BETA_ACTIVATION_WINDOW_HOURS * HOUR_MS;

const round3 = (value: number): number => Math.round(value * 1000) / 1000;

function within(start: Date, end: Date | null): boolean {
  return end !== null && end.getTime() - start.getTime() <= WINDOW_MS;
}

export function countActivation(rows: ActivationRow[], now: Date): BetaActivationCounts {
  const eligible = rows.filter((row) => now.getTime() - row.created_at.getTime() >= WINDOW_MS);
  const activated24h = eligible.filter((row) => within(row.created_at, row.first_analysis_at));
  const activatedReal = eligible.filter((row) =>
    within(row.created_at, row.first_real_analysis_at),
  );
  return {
    registered: rows.length,
    eligible: eligible.length,
    activated24h: activated24h.length,
    activatedRealCase24h: activatedReal.length,
    rate: eligible.length > 0 ? round3(activated24h.length / eligible.length) : null,
    realCaseRate: eligible.length > 0 ? round3(activatedReal.length / eligible.length) : null,
  };
}

/**
 * CC-702 — métrica de ativação do beta: % dos médicos que fazem a 1ª análise
 * em até 24 h do cadastro (meta ≥ 70%). Exposta em
 * `GET /admin/beta/activation` para o painel semanal da CC-705.
 *
 * - Só entram na taxa as contas com 24 h completas (as mais novas ainda podem
 *   ativar e só aparecem em `registered`).
 * - "Análise" é qualquer `ai_interactions` de um atendimento do médico. O caso
 *   de exemplo do onboarding (`params.demoCase`) conta em `activated24h` e
 *   fica de fora em `activatedRealCase24h` — o sinal de uso no plantão.
 * - Por lote do convite (`batchLabel`), com `null` para cadastro sem convite.
 * - Conta eliminada (LGPD) dentro da janela perde os atendimentos e aparece
 *   como não ativada; no beta isso é raro e fica como está.
 */
@Injectable()
export class BetaActivationService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async report(days: number, now: Date = new Date()): Promise<BetaActivationReport> {
    const since = new Date(now.getTime() - days * DAY_MS);
    // As colunas são `timestamp` sem fuso, gravadas em UTC pelo Prisma: o
    // limite vai como texto ISO e é convertido para UTC explicitamente, sem
    // depender do fuso da sessão.
    const rows = await this.prisma.$queryRaw<ActivationRow[]>`
      SELECT p.id AS physician_id,
             p.created_at,
             i.batch_label,
             MIN(ai.created_at) AS first_analysis_at,
             MIN(ai.created_at) FILTER (WHERE ai.params->>'demoCase' IS NULL) AS first_real_analysis_at
      FROM physicians p
      LEFT JOIN beta_participants bp ON bp.physician_id = p.id
      LEFT JOIN beta_invites i ON i.id = bp.invite_id
      LEFT JOIN encounters e ON e.physician_id = p.id
      LEFT JOIN ai_interactions ai ON ai.encounter_id = e.id
      WHERE p.created_at >= (${since.toISOString()}::timestamptz AT TIME ZONE 'UTC')
        AND p.role = 'PHYSICIAN'
      GROUP BY p.id, p.created_at, i.batch_label`;

    const byLabel = new Map<string | null, ActivationRow[]>();
    for (const row of rows) {
      const group = byLabel.get(row.batch_label) ?? [];
      group.push(row);
      byLabel.set(row.batch_label, group);
    }

    const byBatch = [...byLabel.entries()]
      .map(([batchLabel, group]) => ({ batchLabel, ...countActivation(group, now) }))
      .sort((a, b) => b.registered - a.registered);

    return {
      days,
      target: BETA_ACTIVATION_TARGET,
      overall: countActivation(rows, now),
      byBatch,
      generatedAt: now.toISOString(),
    };
  }
}
