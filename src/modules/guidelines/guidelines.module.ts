import { Module } from '@nestjs/common';
import { GuidelinesService } from './guidelines.service';
import { AiGatewayModule } from '../ai-gateway/ai-gateway.module';

@Module({
  imports: [AiGatewayModule],
  providers: [GuidelinesService],
  exports: [GuidelinesService],
})
export class GuidelinesModule {}
