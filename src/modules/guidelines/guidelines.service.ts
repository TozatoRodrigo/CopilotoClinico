import { Injectable, Logger, Inject, NotFoundException, ConflictException } from '@nestjs/common';
import { GuidelineChunkStatus } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';
import { AiGatewayService } from '../ai-gateway/ai-gateway.service';
import { AuditService } from '../audit/audit.service';
import { chunkText } from './ingestion/chunking';

export interface IngestGuidelineInput {
  text: string;
  source: string;
  sourceVersion: string;
  specialty: string;
  evidenceLevel?: string;
  institutionId?: string | null;
  cenario?: string;
  redFlags?: string[];
}

export interface IngestedChunk {
  id: string;
  text: string;
}

export interface BatchIngestResult {
  source: string;
  sourceVersion: string;
  chunksCreated: number;
  superseded: number;
}

export interface PendingGuidelineChunk {
  id: string;
  source: string;
  sourceVersion: string;
  specialty: string;
  evidenceLevel: string | null;
  text: string;
  metadata: unknown;
  createdAt: Date;
}

@Injectable()
export class GuidelinesService {
  private readonly logger = new Logger(GuidelinesService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AiGatewayService) private readonly aiGateway: AiGatewayService,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  /**
   * Ingestão direta de um único documento (endpoint interno service-to-service).
   * Permanece auto-aprovada: já é restrita ao InternalServiceGuard e antecede
   * o pipeline de revisão por curador (KB-002), que cobre a ingestão em lote.
   */
  async ingest(input: IngestGuidelineInput): Promise<IngestedChunk[]> {
    const created = await this.createChunks(input, GuidelineChunkStatus.approved);
    if (created.length === 0) {
      return [];
    }

    await this.auditService
      .log({
        actorId: 'system',
        action: 'GUIDELINE_INGESTED',
        entity: 'GuidelineChunk',
        entityId: `${input.source}@${input.sourceVersion}`,
        payload: {
          source: input.source,
          sourceVersion: input.sourceVersion,
          chunks: created.length,
          institutionId: input.institutionId ?? null,
        },
      })
      .catch(() => undefined);

    return created;
  }

  /**
   * Ingestão em lote (KB-002): cria chunks como `pending_review` — só entram
   * em retrieval após aprovação de um curador (`approveChunk`). Chunks de
   * versões anteriores da mesma fonte são marcados como `superseded`,
   * preservando histórico para rastreabilidade de análises passadas.
   */
  async ingestForReview(input: IngestGuidelineInput): Promise<BatchIngestResult> {
    const created = await this.createChunks(input, GuidelineChunkStatus.pending_review);

    if (created.length === 0) {
      return {
        source: input.source,
        sourceVersion: input.sourceVersion,
        chunksCreated: 0,
        superseded: 0,
      };
    }

    const superseded = await this.prisma.guidelineChunk.updateMany({
      where: {
        source: input.source,
        sourceVersion: { not: input.sourceVersion },
        institutionId: input.institutionId ?? null,
        status: { in: [GuidelineChunkStatus.approved, GuidelineChunkStatus.pending_review] },
      },
      data: { status: GuidelineChunkStatus.superseded },
    });

    await this.auditService
      .log({
        actorId: 'system',
        action: 'GUIDELINE_BATCH_INGESTED',
        entity: 'GuidelineChunk',
        entityId: `${input.source}@${input.sourceVersion}`,
        payload: {
          source: input.source,
          sourceVersion: input.sourceVersion,
          chunksCreated: created.length,
          superseded: superseded.count,
          institutionId: input.institutionId ?? null,
        },
      })
      .catch(() => undefined);

    return {
      source: input.source,
      sourceVersion: input.sourceVersion,
      chunksCreated: created.length,
      superseded: superseded.count,
    };
  }

  async listPending(): Promise<PendingGuidelineChunk[]> {
    return this.prisma.guidelineChunk.findMany({
      where: { status: GuidelineChunkStatus.pending_review },
      select: {
        id: true,
        source: true,
        sourceVersion: true,
        specialty: true,
        evidenceLevel: true,
        text: true,
        metadata: true,
        createdAt: true,
      },
      orderBy: [{ source: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async approveChunk(chunkId: string, reviewerId: string) {
    const chunk = await this.findReviewableChunkOrThrow(chunkId);

    const updated = await this.prisma.guidelineChunk.update({
      where: { id: chunkId },
      data: {
        status: GuidelineChunkStatus.approved,
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
      },
    });

    await this.auditService
      .log({
        actorId: reviewerId,
        action: 'GUIDELINE_APPROVED',
        entity: 'GuidelineChunk',
        entityId: chunkId,
        payload: { source: chunk.source, sourceVersion: chunk.sourceVersion },
      })
      .catch(() => undefined);

    return updated;
  }

  async rejectChunk(chunkId: string, reviewerId: string, reason?: string) {
    const chunk = await this.findReviewableChunkOrThrow(chunkId);

    const updated = await this.prisma.guidelineChunk.update({
      where: { id: chunkId },
      data: {
        status: GuidelineChunkStatus.rejected,
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
      },
    });

    await this.auditService
      .log({
        actorId: reviewerId,
        action: 'GUIDELINE_REJECTED',
        entity: 'GuidelineChunk',
        entityId: chunkId,
        payload: {
          source: chunk.source,
          sourceVersion: chunk.sourceVersion,
          reason: reason ?? null,
        },
      })
      .catch(() => undefined);

    return updated;
  }

  async getChunkById(id: string) {
    return this.prisma.guidelineChunk.findUnique({
      where: { id },
      select: {
        id: true,
        source: true,
        sourceVersion: true,
        specialty: true,
        evidenceLevel: true,
        text: true,
        metadata: true,
        validFrom: true,
        validTo: true,
      },
    });
  }

  async listSources(): Promise<
    Array<{
      source: string;
      sourceVersion: string;
      chunkCount: number;
      active: boolean;
      validFrom: Date;
      validTo: Date | null;
    }>
  > {
    const rows = await this.prisma.guidelineChunk.findMany({
      select: {
        source: true,
        sourceVersion: true,
        validFrom: true,
        validTo: true,
      },
      distinct: ['source', 'sourceVersion'],
      orderBy: [{ source: 'asc' }, { validFrom: 'desc' }],
    });

    const result = await Promise.all(
      rows.map(async (row) => {
        const chunkCount = await this.prisma.guidelineChunk.count({
          where: { source: row.source, sourceVersion: row.sourceVersion, validTo: null },
        });
        return {
          source: row.source,
          sourceVersion: row.sourceVersion,
          chunkCount,
          active: row.validTo === null,
          validFrom: row.validFrom,
          validTo: row.validTo,
        };
      }),
    );

    return result;
  }

  async deactivateSource(
    source: string,
    sourceVersion: string,
    actorId = 'system',
  ): Promise<{ deactivated: number }> {
    const now = new Date();
    const result = await this.prisma.guidelineChunk.updateMany({
      where: { source, sourceVersion, validTo: null },
      data: { validTo: now },
    });

    await this.auditService
      .log({
        actorId,
        action: 'GUIDELINE_DEACTIVATED',
        entity: 'GuidelineChunk',
        entityId: `${source}@${sourceVersion}`,
        payload: {
          source,
          sourceVersion,
          deactivated: result.count,
          deactivatedAt: now.toISOString(),
        },
      })
      .catch(() => undefined);

    this.logger.log(`Deactivated ${result.count} chunks for ${source} v${sourceVersion}`);
    return { deactivated: result.count };
  }

  private async createChunks(
    input: IngestGuidelineInput,
    status: GuidelineChunkStatus,
  ): Promise<IngestedChunk[]> {
    this.logger.log(`Ingesting guideline: ${input.source} v${input.sourceVersion} (${status})`);

    const chunks = chunkText({
      text: input.text,
      source: input.source,
      sourceVersion: input.sourceVersion,
      specialty: input.specialty,
      evidenceLevel: input.evidenceLevel,
      cenario: input.cenario,
      redFlags: input.redFlags,
    });

    this.logger.log(`Created ${chunks.length} chunks from guideline`);

    if (chunks.length === 0) {
      this.logger.warn('No chunks created from guideline text');
      return [];
    }

    const texts = chunks.map((c) => c.text);
    const embeddingResponse = await this.aiGateway.embed(texts);

    const created: IngestedChunk[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]!;
      const embedding = embeddingResponse.embeddings[i]!;
      const embeddingStr = `[${embedding.join(',')}]`;

      const record = await this.prisma.guidelineChunk.create({
        data: {
          source: chunk.metadata.source,
          sourceVersion: chunk.metadata.sourceVersion,
          specialty: chunk.metadata.specialty,
          evidenceLevel: chunk.metadata.evidenceLevel ?? null,
          institutionId: input.institutionId ?? null,
          text: chunk.text,
          status,
          metadata: {
            cenario: chunk.metadata.cenario ?? null,
            redFlags: chunk.metadata.redFlags ?? [],
            charStart: chunk.metadata.charStart,
            charEnd: chunk.metadata.charEnd,
            chunkIndex: chunk.index,
          },
        },
      });

      await this.prisma
        .$executeRaw`UPDATE "guideline_chunks" SET embedding = ${embeddingStr}::vector WHERE id = ${record.id}::uuid`;

      created.push({
        id: record.id,
        text: chunk.text.substring(0, 50) + '...',
      });
    }

    this.logger.log(`Ingested ${created.length} chunks successfully`);
    return created;
  }

  private async findReviewableChunkOrThrow(chunkId: string) {
    const chunk = await this.prisma.guidelineChunk.findUnique({ where: { id: chunkId } });
    if (!chunk) {
      throw new NotFoundException('Guideline chunk not found');
    }
    if (chunk.status !== GuidelineChunkStatus.pending_review) {
      throw new ConflictException(
        'Apenas chunks pendentes de revisão podem ser aprovados/rejeitados',
      );
    }
    return chunk;
  }
}
