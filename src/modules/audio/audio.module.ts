import { Module } from '@nestjs/common';
import { AudioController } from './audio.controller';
import { AudioService } from './audio.service';
import { AudioRetentionService } from './audio-retention.service';
import { WhisperService } from './whisper.service';
import { QueueModule } from '../queue/queue.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { CryptoModule } from '../../shared/crypto/crypto.module';
import { AudioRetentionCronService } from '../../workers/audio-retention-cron.service';
import { LgpdModule } from '../lgpd/lgpd.module';

@Module({
  imports: [QueueModule, AuthModule, AuditModule, CryptoModule, LgpdModule],
  controllers: [AudioController],
  providers: [AudioService, WhisperService, AudioRetentionService, AudioRetentionCronService],
  exports: [AudioService],
})
export class AudioModule {}
