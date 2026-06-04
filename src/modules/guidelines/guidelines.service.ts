import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { AiGatewayService } from '../ai-gateway/ai-gateway.service';
import { chunkText } from './ingestion/chunking';

export interface IngestGuidelineInput {
  text: string;
  source: string;
  sourceVersion: string;
  specialty: string;
  evidenceLevel?: string;
}

interface IngestedChunk {
  id: string;
  text: string;
}

@Injectable()
export class GuidelinesService {
  private readonly logger = new Logger(GuidelinesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiGateway: AiGatewayService,
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

      await this.prisma.$executeRawUnsafe(
        `UPDATE guideline_chunks SET embedding = $1::vector WHERE id = $2`,
        embeddingStr,
        record.id,
      );

      created.push({
        id: record.id,
        text: chunk.text.substring(0, 50) + '...',
      });
    }

    this.logger.log(`Ingested ${created.length} chunks successfully`);
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
}
