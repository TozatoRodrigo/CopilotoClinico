import { Module } from '@nestjs/common';
import { GuidelinesController } from './guidelines.controller';
import { GuidelinesService } from './guidelines.service';
import { AiGatewayModule } from '../ai-gateway/ai-gateway.module';
import { AuditModule } from '../audit/audit.module';
import { DeidModule } from '../deid/deid.module';
import { InstitutionsModule } from '../institutions/institutions.module';
import { LgpdModule } from '../lgpd/lgpd.module';

// DeidModule é global na API, mas os scripts (ingest:guidelines, cards:draft)
// sobem só este módulo: a consulta mascara pela de-identificação (CC-203).
@Module({
  imports: [AiGatewayModule, AuditModule, DeidModule, InstitutionsModule, LgpdModule],
  controllers: [GuidelinesController],
  providers: [GuidelinesService],
  exports: [GuidelinesService],
})
export class GuidelinesModule {}
