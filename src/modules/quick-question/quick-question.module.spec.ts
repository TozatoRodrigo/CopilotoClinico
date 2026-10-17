import { describe, expect, it } from 'vitest';
import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../config/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { DeidModule } from '../deid/deid.module';
import { QuickQuestionController } from './quick-question.controller';
import { QuickQuestionModule } from './quick-question.module';
import { QuickQuestionService } from './quick-question.service';

describe('QuickQuestionModule (CC-501)', () => {
  it('resolve o serviço e o controller com a busca de cartões da decisão', async () => {
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
        DeidModule,
        QuickQuestionModule,
      ],
    }).compile();

    expect(moduleRef.get(QuickQuestionService)).toBeInstanceOf(QuickQuestionService);
    expect(moduleRef.get(QuickQuestionController)).toBeInstanceOf(QuickQuestionController);
    await moduleRef.close();
  });
});
