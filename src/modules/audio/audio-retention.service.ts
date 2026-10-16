import { Injectable, Logger } from '@nestjs/common';
import { Prisma, type AudioCapture } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';
import { AuditService } from '../audit/audit.service';

/** Capturas vencidas lidas por página. */
export const AUDIO_RETENTION_PAGE_SIZE = 100;

export const AUDIO_RETENTION_PURGE_ACTION = 'AUDIO_RETENTION_PURGE';

export interface AudioRetentionPurgeResult {
  /** Capturas cujo áudio esta execução eliminou. */
  purged: number;
  /** Capturas vencidas que falharam — continuam elegíveis na próxima execução. */
  failed: number;
}

type ExpiredCapture = Pick<AudioCapture, 'id' | 'encounterId' | 'physicianId'>;

/**
 * LGPD — elimina o áudio das capturas cujo `retainUntil` venceu.
 *
 * O áudio cifrado sai (`encryptedContent = null`) e a linha fica como lápide
 * com status `deleted`: metadados e a transcrição já mascarada continuam,
 * ligados à trilha de auditoria pelo mesmo id. Por que lápide e não DELETE:
 * ver "Capturas de áudio" em docs/compliance/LGPD.md.
 *
 * Cada captura é eliminada numa transação própria junto com a sua entrada
 * AUDIO_RETENTION_PURGE: ou as duas existem, ou nenhuma. O UPDATE é condicional
 * (`status <> 'deleted'`), então execuções concorrentes — outra réplica, ou uma
 * chamada manual durante o cron — eliminam e auditam cada captura uma única
 * vez, e reexecutar é inofensivo.
 */
@Injectable()
export class AudioRetentionService {
  private readonly logger = new Logger(AudioRetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async purgeExpired(now: Date = new Date()): Promise<AudioRetentionPurgeResult> {
    const result: AudioRetentionPurgeResult = { purged: 0, failed: 0 };
    let cursor: string | undefined;

    for (;;) {
      // Cursor por id, não offset: capturas eliminadas saem do filtro e as que
      // falharam ficam para trás — a varredura termina mesmo com falhas.
      const page = await this.prisma.audioCapture.findMany({
        where: {
          retainUntil: { lt: now },
          status: { not: 'deleted' },
          ...(cursor ? { id: { gt: cursor } } : {}),
        },
        orderBy: { id: 'asc' },
        take: AUDIO_RETENTION_PAGE_SIZE,
        select: { id: true, encounterId: true, physicianId: true },
      });

      for (const capture of page) {
        try {
          if (await this.purgeOne(capture, now)) result.purged++;
        } catch (err: unknown) {
          result.failed++;
          const message = err instanceof Error ? err.message : String(err);
          this.logger.error(
            `Audio retention purge failed for capture ${capture.id}: ${message}`,
            err instanceof Error ? err.stack : undefined,
          );
        }
      }

      const last = page.at(-1);
      if (!last || page.length < AUDIO_RETENTION_PAGE_SIZE) return result;
      cursor = last.id;
    }
  }

  /** @returns false quando outra execução já eliminou a captura. */
  private async purgeOne(capture: ExpiredCapture, now: Date): Promise<boolean> {
    return this.prisma.$transaction(
      async (tx) => {
        const { count } = await tx.audioCapture.updateMany({
          where: { id: capture.id, retainUntil: { lt: now }, status: { not: 'deleted' } },
          data: { encryptedContent: null, status: 'deleted' },
        });
        if (count === 0) return false;

        await this.audit.logInTransaction(tx, {
          actorId: 'system',
          action: AUDIO_RETENTION_PURGE_ACTION,
          entity: 'AudioCapture',
          entityId: capture.id,
          // LGPD: só ids — nada do áudio, da transcrição ou do paciente.
          payload: { encounterId: capture.encounterId, physicianId: capture.physicianId },
        });
        return true;
      },
      // READ COMMITTED: exigido pelo logInTransaction, e é o que faz o UPDATE
      // concorrente reavaliar `status` depois que a outra transação confirma.
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }
}
