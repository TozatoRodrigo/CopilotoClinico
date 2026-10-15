import { type DynamicModule, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../src/config/prisma.module';
import { AiGatewayService } from '../../src/modules/ai-gateway/ai-gateway.service';
import { AuditModule } from '../../src/modules/audit/audit.module';
import { OrchestratorService } from '../../src/modules/copilot/orchestrator/orchestrator.service';
import { RetrievalService } from '../../src/modules/copilot/retrieval/retrieval.service';
import { UnderstandingService } from '../../src/modules/copilot/understanding/understanding.service';
import { WebResearchService } from '../../src/modules/copilot/research/web-research.service';
import { AttachmentsService } from '../../src/modules/encounters/attachments/attachments.service';
import { EncountersService } from '../../src/modules/encounters/encounters.service';
import { GuidelinesModule } from '../../src/modules/guidelines/guidelines.module';
import { InstitutionsService } from '../../src/modules/institutions/institutions.service';
import { RedisModule } from '../../src/modules/redis/redis.module';
import { CompletionRecorder, RecordingAiGatewayService } from './recorder';
import { ENV_FILE_PATHS } from './variants';

/**
 * F0-A — Contexto Nest mínimo para chamar `OrchestratorService.analyze` de
 * verdade. Não importa AppModule nem CopilotModule porque eles trazem o que
 * só existe no servidor HTTP: JWT/Passport (AuthModule, que exige segredos de
 * token), fila BullMQ (QueueModule), throttler e interceptors. Os serviços do
 * caminho da análise são os mesmos de produção: orquestrador, retrieval
 * (Postgres + Redis), atendimentos, anexos e auditoria.
 *
 * `load` tem precedência sobre `.env` e `process.env` no ConfigService
 * (@nestjs/config 4) — é por aí que entram os overrides da variante.
 */
@Module({})
export class EvalModule {
  static forVariant(
    envOverrides: Record<string, string>,
    recorder: CompletionRecorder,
  ): DynamicModule {
    return {
      module: EvalModule,
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: ENV_FILE_PATHS,
          load: [() => envOverrides],
        }),
        PrismaModule,
        RedisModule,
        AuditModule,
        GuidelinesModule,
      ],
      providers: [
        { provide: CompletionRecorder, useValue: recorder },
        { provide: AiGatewayService, useClass: RecordingAiGatewayService },
        InstitutionsService,
        EncountersService,
        AttachmentsService,
        RetrievalService,
        UnderstandingService,
        WebResearchService,
        OrchestratorService,
      ],
    };
  }
}
