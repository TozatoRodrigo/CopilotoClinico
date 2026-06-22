import {
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Header,
} from '@nestjs/common';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { Roles } from '../../shared/decorators/roles.decorator';
import { InternalServiceGuard } from '../../shared/guards/internal-service.guard';
import { ZodValidationPipe } from '../../shared/pipes/zod-validation.pipe';
import { auditQuerySchema } from './schemas/audit.schemas';
import type { AuditQueryInput } from './schemas/audit.schemas';
import type { ChainVerificationResult } from './audit.service';

@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  /**
   * Lista registros de auditoria do médico autenticado.
   * Requer JWT válido.
   */
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('COMPLIANCE', 'ADMIN')
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
   * S25-AUD-01 — Export CSV server-side do conjunto FILTRADO.
   *
   * Antes o front exportava só a página atual (≤20 itens). Para auditoria
   * séria é inútil. Agora o backend faz o export com todos os itens que
   * casam com os filtros (limite 10k para evitar OOM; acima disso, filtrar
   * por data). Retorna text/csv com header Content-Disposition attachment.
   */
  @Get('export')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('COMPLIANCE', 'ADMIN')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportCsv(
    @Request() req: { user: { physicianId: string } },
    @Query(new ZodValidationPipe(auditQuerySchema)) query: AuditQueryInput,
  ): Promise<string> {
    // Override limit/offset para buscar tudo de uma vez (até o teto).
    const result = await this.auditService.query({
      ...query,
      actorId: req.user.physicianId,
      limit: 10000,
      offset: 0,
    });
    return this.auditService.toCsv(result.items);
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
