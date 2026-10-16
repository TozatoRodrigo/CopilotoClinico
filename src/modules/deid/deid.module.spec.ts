import { Injectable, Inject, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { DeidModule } from './deid.module';
import { HttpDeidModelClient } from './deid-model.client';
import {
  DeidentificationService,
  REGEX_ONLY_DEIDENTIFIER,
  type Deidentifier,
} from './deidentification.service';

/** Como os serviços do caso recebem a de-identificação: obrigatória no Nest. */
@Injectable()
class NeedsDeid {
  constructor(
    @Inject(DeidentificationService) readonly deid: Deidentifier = REGEX_ONLY_DEIDENTIFIER,
  ) {}
}

@Module({ providers: [NeedsDeid] })
class ConsumerModule {}

describe('DeidModule (CC-203)', () => {
  it('é global: outro módulo recebe o DeidentificationService com o cliente HTTP', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        DeidModule,
        ConsumerModule,
      ],
    }).compile();

    const consumer = moduleRef.get(NeedsDeid);
    expect(consumer.deid).toBeInstanceOf(DeidentificationService);
    expect(consumer.deid).not.toBe(REGEX_ONLY_DEIDENTIFIER);
    expect((consumer.deid as unknown as { client: unknown }).client).toBeInstanceOf(
      HttpDeidModelClient,
    );
  });

  it('sem o DeidModule o Nest não sobe: o padrão só-regex não vale em produção', async () => {
    await expect(
      Test.createTestingModule({
        imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), ConsumerModule],
      }).compile(),
    ).rejects.toThrow(/DeidentificationService/);
  });
});
