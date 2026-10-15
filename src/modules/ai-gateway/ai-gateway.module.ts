import { Module } from '@nestjs/common';
import { AiGatewayService } from './ai-gateway.service';
import { AiCallLogService } from './ai-call-log.service';
import { AI_CALL_SINK } from './ai-call-trace';

@Module({
  providers: [
    AiGatewayService,
    AiCallLogService,
    { provide: AI_CALL_SINK, useExisting: AiCallLogService },
  ],
  exports: [AiGatewayService],
})
export class AiGatewayModule {}
