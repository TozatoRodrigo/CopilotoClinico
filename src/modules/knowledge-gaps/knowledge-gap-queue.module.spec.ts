import { describe, expect, it } from 'vitest';
import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { $Enums } from '@prisma/client';
import { PrismaModule } from '../../config/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { KnowledgeCardsService } from '../knowledge-cards/knowledge-cards.service';
import {
  KNOWLEDGE_GAP_SOURCES,
  KNOWLEDGE_GAP_STATUSES,
} from '../../shared/contracts/knowledge-gaps';
import { KnowledgeGapCronService } from '../../workers/knowledge-gap-cron.service';
import { KnowledgeGapQueueModule } from './knowledge-gap-queue.module';
import { KnowledgeGapQueueService } from './knowledge-gap-queue.service';
import { KnowledgeGapsService } from './knowledge-gaps.service';

describe('KnowledgeGapQueueModule (CC-409)', () => {
  it('resolve a fila, o registro, a varredura e os cartões que fecham lacunas', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              AI_PROVIDER: 'test',
              AI_API_KEY: 'test-key',
              AI_MODEL: 'test-model',
              AI_EMBEDDING_MODEL: 'test-embedding',
            }),
          ],
        }),
        PrismaModule,
        AuditModule,
        KnowledgeGapQueueModule,
      ],
    }).compile();

    expect(moduleRef.get(KnowledgeGapQueueService)).toBeInstanceOf(KnowledgeGapQueueService);
    expect(moduleRef.get(KnowledgeGapCronService)).toBeInstanceOf(KnowledgeGapCronService);
    expect(moduleRef.get(KnowledgeGapsService)).toBeInstanceOf(KnowledgeGapsService);
    expect(moduleRef.get(KnowledgeCardsService)).toBeInstanceOf(KnowledgeCardsService);
    await moduleRef.close();
  });

  it('as listas do contrato (que o web lê) são as do enum do banco', () => {
    expect([...KNOWLEDGE_GAP_SOURCES].sort()).toEqual(
      Object.values($Enums.KnowledgeGapSource).sort(),
    );
    expect([...KNOWLEDGE_GAP_STATUSES].sort()).toEqual(
      Object.values($Enums.KnowledgeGapGroupStatus).sort(),
    );
  });
});
