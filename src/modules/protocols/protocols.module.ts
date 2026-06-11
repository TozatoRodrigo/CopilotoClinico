import { Module } from '@nestjs/common';
import { ProtocolsController } from './protocols.controller';
import { ProtocolsService } from './protocols.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [ProtocolsController],
  providers: [ProtocolsService],
  exports: [ProtocolsService],
})
export class ProtocolsModule {}
