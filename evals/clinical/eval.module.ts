import { type DynamicModule, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../src/config/prisma.module';
import { AiGatewayService } from '../../src/modules/ai-gateway/ai-gateway.service';
import { AuditModule } from '../../src/modules/audit/audit.module';
import { DeidModule } from '../../src/modules/deid/deid.module';
import { ConversationService } from '../../src/modules/copilot/intake/conversation.service';
import { IntakeService } from '../../src/modules/copilot/intake/intake.service';
import { OrchestratorService } from '../../src/modules/copilot/orchestrator/orchestrator.service';
import { RetrievalService } from '../../src/modules/copilot/retrieval/retrieval.service';
import { UnderstandingService } from '../../src/modules/copilot/understanding/understanding.service';
import { WebResearchService } from '../../src/modules/copilot/research/web-research.service';
import { AttachmentsService } from '../../src/modules/encounters/attachments/attachments.service';
import { EncountersService } from '../../src/modules/encounters/encounters.service';
import { GuidelinesModule } from '../../src/modules/guidelines/guidelines.module';
import { InstitutionsService } from '../../src/modules/institutions/institutions.service';
import { RedisModule } from '../../src/modules/redis/redis.module';
import { CARD_INDEX_PROVIDERS } from '../../src/modules/knowledge-cards/card-index/knowledge-card-index.module';
import { REVIEWED_CARD_RETRIEVAL_PROVIDERS } from '../../src/modules/knowledge-cards/card-retrieval/knowledge-card-retrieval.module';
import { CompletionRecorder, RecordingAiGatewayService } from './recorder';
import { ENV_FILE_PATHS } from './variants';

/**
 * F0-A — Contexto Nest mínimo para chamar `OrchestratorService.analyze` (e,
 * no afunilamento, a conversa do Copiloto guiado) de verdade. Não importa AppModule nem CopilotModule porque eles trazem o que
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
        // CC-203 — caso, respostas e anexos passam pela de-identificação de
        // produção (DEID_MODE da variante; padrão regex).
        DeidModule,
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
        // CC-408 — cartões revisados (variantes com COPILOT_REVIEWED_CARDS),
        // com o gateway que grava as chamadas: o embedding da busca entra no rastro.
        ...CARD_INDEX_PROVIDERS,
        ...REVIEWED_CARD_RETRIEVAL_PROVIDERS,
        OrchestratorService,
        // CC-106 — a conversa do Copiloto guiado, do jeito que a tela a usa.
        IntakeService,
        ConversationService,
      ],
    };
  }
}
