import { Module } from '@nestjs/common';
import { EncountersController } from './encounters.controller';
import { EncountersService } from './encounters.service';
import { AttachmentsController } from './attachments/attachments.controller';
import { AttachmentsService } from './attachments/attachments.service';
import { AuthModule } from '../auth/auth.module';
import { InstitutionsModule } from '../institutions/institutions.module';
// F4 — os anexos reaproveitam a extração de texto do pipeline de diretrizes
// (guidelines/ingestion/document-text.ts) em vez de duplicar o parser de PDF.
import { GuidelinesModule } from '../guidelines/guidelines.module';

@Module({
  imports: [AuthModule, InstitutionsModule, GuidelinesModule],
  controllers: [EncountersController, AttachmentsController],
  providers: [EncountersService, AttachmentsService],
  exports: [EncountersService, AttachmentsService],
})
export class EncountersModule {}
