import { Module } from '@nestjs/common';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { AuthModule } from '../auth/auth.module';
import { AuditChainCronService } from '../../workers/audit-chain-cron.service';

@Module({
  imports: [AuthModule],
  controllers: [AuditController],
  providers: [AuditService, AuditChainCronService],
  exports: [AuditService],
})
export class AuditModule {}
