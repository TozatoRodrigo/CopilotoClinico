import { describe, expect, it } from 'vitest';
import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../config/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { KnowledgeCardsModule } from './knowledge-cards.module';
import { KnowledgeCardsService } from './knowledge-cards.service';
import { KnowledgeCardDraftService } from './drafting/card-draft.service';

describe('KnowledgeCardsModule', () => {
  // O mesmo conjunto de módulos do `pnpm cards:draft` (scripts/cards/draft.ts).
  it('resolve os serviços com as dependências do script e da API', async () => {
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
        KnowledgeCardsModule,
      ],
    }).compile();

    expect(moduleRef.get(KnowledgeCardsService)).toBeInstanceOf(KnowledgeCardsService);
    expect(moduleRef.get(KnowledgeCardDraftService)).toBeInstanceOf(KnowledgeCardDraftService);
    await moduleRef.close();
  });
});
