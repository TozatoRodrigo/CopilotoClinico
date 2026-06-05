import { Global, Module } from '@nestjs/common';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { AuditChainCronService } from '../../workers/audit-chain-cron.service';

/**
 * @Global — AuditService é uma preocupação transversal (cross-cutting concern).
 * Ao marcar o módulo como global, qualquer serviço da aplicação pode injetar
 * AuditService sem precisar importar AuditModule explicitamente, e sem
 * criar dependências circulares (ex: AuthModule ↔ AuditModule).
 *
 * AuthModule não precisa mais ser importado aqui — JwtStrategy já está
 * registrado globalmente via AppModule → AuthModule, tornando JwtAuthGuard
 * funcional em qualquer controlador.
 */
@Global()
@Module({
  controllers: [AuditController],
  providers: [AuditService, AuditChainCronService],
  exports: [AuditService],
})
export class AuditModule {}
