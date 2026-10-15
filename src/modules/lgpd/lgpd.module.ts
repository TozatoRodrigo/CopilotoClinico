import { Module } from '@nestjs/common';
import { LgpdController } from './lgpd.controller';
import { LgpdService } from './lgpd.service';
import { AiConsentGuard } from './ai-consent.guard';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [LgpdController],
  providers: [LgpdService, AiConsentGuard],
  exports: [LgpdService, AiConsentGuard],
})
export class LgpdModule {}
