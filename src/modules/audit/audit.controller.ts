import {
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
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
   * Lista a trilha de auditoria completa (não filtrada por ator) para
   * compliance/admin. Requer JWT válido + role COMPLIANCE/ADMIN.
   *
   * BUGFIX — antes este método injetava `actorId: req.user.physicianId`
   * incondicionalmente, sobrescrevendo qualquer filtro do caller. Como o
   * frontend nunca envia `actorId` (ver web/src/app/(app)/audit/page.tsx),
   * isso filtrava SEMPRE pelo próprio usuário autenticado — um médico com
   * role COMPLIANCE/ADMIN só via os próprios eventos (ex.: os próprios
   * AUTH_LOGIN), nunca os eventos de outros médicos que um console de
   * compliance existe para auditar. `auditQuerySchema.actorId` já é um
   * campo opcional pensado para filtro explícito por ator no futuro — só
   * não deve ser preenchido à força aqui.
   */
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('COMPLIANCE', 'ADMIN')
  async query(@Query(new ZodValidationPipe(auditQuerySchema)) query: AuditQueryInput) {
    return this.auditService.query(query);
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
    @Query(new ZodValidationPipe(auditQuerySchema)) query: AuditQueryInput,
  ): Promise<string> {
    // BUGFIX — mesmo problema de query(): não força mais actorId do
    // usuário autenticado. Override limit/offset para buscar tudo de uma
    // vez (até o teto), preservando os demais filtros do caller.
    const result = await this.auditService.query({
      ...query,
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
