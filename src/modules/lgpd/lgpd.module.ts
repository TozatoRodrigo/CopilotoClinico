import { Module } from '@nestjs/common';
import { LgpdController } from './lgpd.controller';
import { LgpdService } from './lgpd.service';
import { AiConsentGuard } from './ai-consent.guard';
import { PhysicianErasureModule } from '../auth/physician-erasure.module';
import { StorageModule } from '../storage/storage.module';

/**
 * Sem o AuthModule: o GuidelinesModule importa este módulo pelo consentimento
 * de IA (CC-010), e o gabarito e o `pnpm cards:draft` montam o GuidelinesModule
 * fora do servidor HTTP, sem segredos de token. A eliminação só precisa da
 * checagem de médico eliminado (CC-018) e do storage dos PDFs.
 */
@Module({
  imports: [PhysicianErasureModule, StorageModule],
  controllers: [LgpdController],
  providers: [LgpdService, AiConsentGuard],
  exports: [LgpdService, AiConsentGuard],
})
export class LgpdModule {}
