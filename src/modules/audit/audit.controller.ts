import { Controller, Get, Post, Query, UseGuards, Request, HttpCode, HttpStatus } from '@nestjs/common';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { InternalServiceGuard } from '../../shared/guards/internal-service.guard';
import { ZodValidationPipe } from '../../shared/pipes/zod-validation.pipe';
import { auditQuerySchema } from './schemas/audit.schemas';
import type { AuditQueryInput } from './schemas/audit.schemas';
import type { ChainVerificationResult } from './audit.service';

@Controller('v1/audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  /**
   * Lista registros de auditoria do médico autenticado.
   * Requer JWT válido.
   */
  @Get()
  @UseGuards(JwtAuthGuard)
  async query(
    @Request() req: { user: { physicianId: string } },
    @Query(new ZodValidationPipe(auditQuerySchema)) query: AuditQueryInput,
  ) {
    return this.auditService.query({
      ...query,
      actorId: req.user.physicianId,
    });
  }

  /**
   * Verifica a integridade da cadeia de hash do audit_log.
   *
   * Endpoint interno — requer header `x-internal-token` com o valor de
   * `INTERNAL_SERVICE_TOKEN`. Nunca deve ser exposto publicamente.
   * Também acionado diariamente pelo AuditChainCronService.
   *
   * Retorna 200 com { valid: true, count } se a cadeia estiver íntegra,
   * ou 200 com { valid: false, count, brokenAt, message } se corrompida.
   * Usa 200 em ambos os casos para que o caller possa diferenciar via body
   * e não confundir com erros de infraestrutura (4xx/5xx).
   */
  @Post('verify-chain')
  @UseGuards(InternalServiceGuard)
  @HttpCode(HttpStatus.OK)
  async verifyChain(): Promise<ChainVerificationResult> {
    return this.auditService.verifyChain();
  }
}
