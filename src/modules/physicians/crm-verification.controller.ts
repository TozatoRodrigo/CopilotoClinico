import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CrmVerificationService } from './crm-verification.service';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { InternalServiceGuard } from '../../shared/guards/internal-service.guard';
import { ZodValidationPipe } from '../../shared/pipes/zod-validation.pipe';
import { resolveVerificationSchema } from './schemas/crm-verification.schemas';
import type { ResolveVerificationInput } from './schemas/crm-verification.schemas';

@Controller('v1')
export class CrmVerificationController {
  constructor(private readonly crmVerificationService: CrmVerificationService) {}

  // ── Physician-facing endpoints ───────────────────────────────────────────

  /**
   * Solicita verificação de CRM para o médico autenticado.
   * Requer JWT válido. Cria uma solicitação PENDING para análise administrativa.
   */
  @Post('physicians/me/crm-verification')
  @UseGuards(JwtAuthGuard)
  async requestVerification(@Request() req: { user: { physicianId: string }; ip?: string }) {
    return this.crmVerificationService.requestVerification(req.user.physicianId, req.ip);
  }

  /**
   * Retorna a solicitação de verificação mais recente do médico autenticado.
   */
  @Get('physicians/me/crm-verification')
  @UseGuards(JwtAuthGuard)
  async getLatestRequest(@Request() req: { user: { physicianId: string } }) {
    return this.crmVerificationService.getLatestRequest(req.user.physicianId);
  }

  // ── Admin endpoints (x-internal-token) ──────────────────────────────────

  /**
   * Lista todas as solicitações de verificação pendentes.
   * Requer header `x-internal-token`.
   */
  @Get('admin/crm-verifications')
  @UseGuards(InternalServiceGuard)
  async listPending() {
    return this.crmVerificationService.listPending();
  }

  /**
   * Aprova ou rejeita uma solicitação de verificação de CRM.
   * Requer header `x-internal-token`.
   *
   * Body: { action: 'approve' | 'reject', notes?: string }
   */
  @Patch('admin/crm-verifications/:id')
  @UseGuards(InternalServiceGuard)
  @HttpCode(HttpStatus.OK)
  async resolve(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(resolveVerificationSchema)) body: ResolveVerificationInput,
    @Request() req: { headers: Record<string, string | undefined> },
  ) {
    const resolvedBy = req.headers['x-resolved-by'] ?? 'admin';

    if (body.action === 'approve') {
      return this.crmVerificationService.approve(id, resolvedBy, body.notes);
    }

    return this.crmVerificationService.reject(id, resolvedBy, body.notes);
  }
}
