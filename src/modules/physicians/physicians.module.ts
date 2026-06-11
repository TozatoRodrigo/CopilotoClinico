import { Module } from '@nestjs/common';
import { CrmVerificationController } from './crm-verification.controller';
import { CrmVerificationService } from './crm-verification.service';
import { CrmCheckerService } from './crm-checker.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [CrmVerificationController],
  providers: [CrmVerificationService, CrmCheckerService],
  exports: [CrmVerificationService, CrmCheckerService],
})
export class PhysiciansModule {}
