import { Module } from '@nestjs/common';
import { CrmVerificationController } from './crm-verification.controller';
import { CrmVerificationService } from './crm-verification.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [CrmVerificationController],
  providers: [CrmVerificationService],
  exports: [CrmVerificationService],
})
export class PhysiciansModule {}
