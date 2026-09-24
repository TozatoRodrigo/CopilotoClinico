import { Module } from '@nestjs/common';
import { AiGatewayModule } from '../../ai-gateway/ai-gateway.module';
import { AuditModule } from '../../audit/audit.module';
import { OfficialGuidelinesSyncService } from './official-guidelines-sync.service';
import { HttpOfficialSourceFetcher, OFFICIAL_SOURCE_FETCHER } from './official-source-fetcher';

/** ADR-010 — Coleta da base oficial da Conitec (PCDT/DDT/DB/PU). */
@Module({
  imports: [AiGatewayModule, AuditModule],
  providers: [
    OfficialGuidelinesSyncService,
    { provide: OFFICIAL_SOURCE_FETCHER, useClass: HttpOfficialSourceFetcher },
  ],
  exports: [OfficialGuidelinesSyncService],
})
export class OfficialGuidelinesModule {}
