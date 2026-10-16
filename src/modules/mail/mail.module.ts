import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailAdminController } from './mail-admin.controller';
import { MAIL_RUNTIME, MailService, createMailRuntime } from './mail.service';

/**
 * CC-015 — e-mail transacional. Quem precisa enviar importa este módulo e
 * injeta `MailService` (contrato em mail.service.ts). PrismaService vem do
 * módulo global.
 */
@Module({
  controllers: [MailAdminController],
  providers: [
    { provide: MAIL_RUNTIME, useFactory: createMailRuntime, inject: [ConfigService] },
    MailService,
  ],
  exports: [MailService],
})
export class MailModule {}
