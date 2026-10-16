import { Module } from '@nestjs/common';
import { GuidelinesController } from './guidelines.controller';
import { GuidelinesService } from './guidelines.service';
import { AiGatewayModule } from '../ai-gateway/ai-gateway.module';
import { AuditModule } from '../audit/audit.module';
import { InstitutionsModule } from '../institutions/institutions.module';
import { LgpdModule } from '../lgpd/lgpd.module';

@Module({
  imports: [AiGatewayModule, AuditModule, InstitutionsModule, LgpdModule],
  controllers: [GuidelinesController],
  providers: [GuidelinesService],
  exports: [GuidelinesService],
})
export class GuidelinesModule {}
