import { Module } from '@nestjs/common';
import { AccountLockoutService } from './account-lockout.service';

/**
 * CC-025 — limite de tentativas por conta (MFA, troca de senha). Módulo à
 * parte: quem mais precisar do limite importa só ele, sem puxar o AuthModule.
 */
@Module({
  providers: [AccountLockoutService],
  exports: [AccountLockoutService],
})
export class AccountLockoutModule {}
