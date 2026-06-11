import { Module } from '@nestjs/common';
import { ProtocolEngineController } from './protocol-engine.controller';
import { ProtocolEngineService } from './protocol-engine.service';
import { EncountersModule } from '../../encounters/encounters.module';
import { ProtocolsModule } from '../../protocols/protocols.module';
import { AuditModule } from '../../audit/audit.module';

@Module({
  imports: [EncountersModule, ProtocolsModule, AuditModule],
  controllers: [ProtocolEngineController],
  providers: [ProtocolEngineService],
  exports: [ProtocolEngineService],
})
export class ProtocolEngineModule {}
