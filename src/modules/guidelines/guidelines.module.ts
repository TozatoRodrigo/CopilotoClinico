import { Module } from '@nestjs/common';
import { GuidelinesController } from './guidelines.controller';
import { GuidelinesService } from './guidelines.service';
import { AiGatewayModule } from '../ai-gateway/ai-gateway.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AiGatewayModule, AuditModule],
  controllers: [GuidelinesController],
  providers: [GuidelinesService],
  exports: [GuidelinesService],
})
export class GuidelinesModule {}
