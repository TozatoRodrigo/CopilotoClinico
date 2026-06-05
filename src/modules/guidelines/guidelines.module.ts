import { Module } from '@nestjs/common';
import { GuidelinesService } from './guidelines.service';
import { GuidelinesController } from './guidelines.controller';
import { AiGatewayModule } from '../ai-gateway/ai-gateway.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AiGatewayModule, AuthModule],
  controllers: [GuidelinesController],
  providers: [GuidelinesService],
  exports: [GuidelinesService],
})
export class GuidelinesModule {}
