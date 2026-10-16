import { Module } from '@nestjs/common';
import { LegalController } from './legal.controller';
import { LegalAdminController } from './legal-admin.controller';
import { LegalDocumentsService } from './legal-documents.service';

/**
 * CC-905 — termos de uso e política de privacidade versionados e o aceite por
 * médico. O gate (LegalTermsGateInterceptor) é registrado como
 * APP_INTERCEPTOR no AppModule, depois do contexto da requisição.
 */
@Module({
  controllers: [LegalController, LegalAdminController],
  providers: [LegalDocumentsService],
  exports: [LegalDocumentsService],
})
export class LegalModule {}
