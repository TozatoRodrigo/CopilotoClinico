import { Injectable, Logger, Inject } from '@nestjs/common';
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
}

export interface IngestedChunk {
  id: string;
  text: string;
}

@Injectable()
export class GuidelinesService {
  private readonly logger = new Logger(GuidelinesService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AiGatewayService) private readonly aiGateway: AiGatewayService,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  async ingest(input: IngestGuidelineInput): Promise<IngestedChunk[]> {
    this.logger.log(`Ingesting guideline: ${input.source} v${input.sourceVersion}`);

    const chunks = chunkText({
      text: input.text,
      source: input.source,
      sourceVersion: input.sourceVersion,
      specialty: input.specialty,
      evidenceLevel: input.evidenceLevel,
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
          text: chunk.text,
          metadata: {
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
        },
      })
      .catch(() => undefined);

    return created;
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
}
