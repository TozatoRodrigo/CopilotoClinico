import { Module } from '@nestjs/common';
import { AudioController } from './audio.controller';
import { AudioService } from './audio.service';
import { WhisperService } from './whisper.service';
import { QueueModule } from '../queue/queue.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { CryptoModule } from '../../shared/crypto/crypto.module';

@Module({
  imports: [QueueModule, AuthModule, AuditModule, CryptoModule],
  controllers: [AudioController],
  providers: [AudioService, WhisperService],
  exports: [AudioService],
})
export class AudioModule {}
