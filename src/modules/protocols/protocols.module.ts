import { Module } from '@nestjs/common';
import { ProtocolsController } from './protocols.controller';
import { ProtocolsService } from './protocols.service';
import { AuditModule } from '../audit/audit.module';
import { InstitutionsModule } from '../institutions/institutions.module';

@Module({
  imports: [AuditModule, InstitutionsModule],
  controllers: [ProtocolsController],
  providers: [ProtocolsService],
  exports: [ProtocolsService],
})
export class ProtocolsModule {}
