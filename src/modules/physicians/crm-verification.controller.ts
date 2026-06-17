import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CrmVerificationService } from './crm-verification.service';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { Roles } from '../../shared/decorators/roles.decorator';
import { ZodValidationPipe } from '../../shared/pipes/zod-validation.pipe';
import { resolveVerificationSchema } from './schemas/crm-verification.schemas';
import type { ResolveVerificationInput } from './schemas/crm-verification.schemas';

interface AuthedRequest {
  user: { physicianId: string; role: string };
  ip?: string;
  headers: Record<string, string | undefined>;
}

@Controller()
export class CrmVerificationController {
  constructor(private readonly crmVerificationService: CrmVerificationService) {}

  // ── Physician-facing endpoints ───────────────────────────────────────────

  /**
   * Solicita verificação de CRM para o médico autenticado.
   * Requer JWT válido. Cria uma solicitação PENDING para análise administrativa.
   */
  @Post('physicians/me/crm-verification')
  @UseGuards(JwtAuthGuard)
  async requestVerification(@Request() req: AuthedRequest) {
    return this.crmVerificationService.requestVerification(req.user.physicianId, req.ip);
  }

  /**
   * Retorna a solicitação de verificação mais recente do médico autenticado.
   */
  @Get('physicians/me/crm-verification')
  @UseGuards(JwtAuthGuard)
  async getLatestRequest(@Request() req: AuthedRequest) {
    return this.crmVerificationService.getLatestRequest(req.user.physicianId);
  }

  // ── Admin/Compliance endpoints (RBAC: COMPLIANCE, ADMIN) ────────────────

  /**
   * Lista solicitações de verificação de CRM.
   * Filtro opcional por status: PENDING (default), APPROVED, REJECTED.
   * Acesso restrito a COMPLIANCE e ADMIN via JWT + RolesGuard.
   */
  @Get('admin/crm-verifications')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('COMPLIANCE', 'ADMIN')
  async listRequests(@Query('status') status?: string) {
    return this.crmVerificationService.listByStatus(status);
  }

  /**
   * Aprova ou rejeita uma solicitação de verificação de CRM.
   * O resolvedBy é extraído do JWT (physicianId), garantindo trilha de auditoria.
   *
   * Body: { action: 'approve' | 'reject', notes?: string }
   */
  @Patch('admin/crm-verifications/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('COMPLIANCE', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  async resolve(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(resolveVerificationSchema)) body: ResolveVerificationInput,
    @Request() req: AuthedRequest,
  ) {
    const resolvedBy = req.user.physicianId;

    if (body.action === 'approve') {
      return this.crmVerificationService.approve(id, resolvedBy, body.notes);
    }

    return this.crmVerificationService.reject(id, resolvedBy, body.notes);
  }
}
