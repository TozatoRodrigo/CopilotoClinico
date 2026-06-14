import { Injectable, Inject, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { CrmVerificationRequest } from '@prisma/client';

@Injectable()
export class CrmVerificationService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  /**
   * Cria uma solicitação de verificação de CRM para o médico autenticado.
   *
   * Regras:
   * - Não pode haver uma solicitação PENDING em aberto.
   * - Se já verificado (crm_verified=true), retorna erro informativo.
   */
  async requestVerification(physicianId: string, ip?: string): Promise<CrmVerificationRequest> {
    const physician = await this.prisma.physician.findUnique({
      where: { id: physicianId },
      select: { id: true, crmUf: true, crmNumber: true, crmVerified: true },
    });

    if (!physician) throw new NotFoundException('Physician not found');

    if (physician.crmVerified) {
      throw new BadRequestException('CRM já está verificado');
    }

    const pending = await this.prisma.crmVerificationRequest.findFirst({
      where: { physicianId, status: 'PENDING' },
    });

    if (pending) {
      throw new BadRequestException(
        'Já existe uma solicitação de verificação pendente. Aguarde a análise.',
      );
    }

    const request = await this.prisma.crmVerificationRequest.create({
      data: { physicianId },
    });

    await this.auditSilently({
      actorId: physicianId,
      action: 'CRM_VERIFICATION_REQUESTED',
      entity: 'CrmVerificationRequest',
      entityId: request.id,
      payload: { crmUf: physician.crmUf, crmNumber: physician.crmNumber },
      ip,
    });

    return request;
  }

  /**
   * Retorna a solicitação de verificação mais recente do médico.
   */
  async getLatestRequest(physicianId: string): Promise<CrmVerificationRequest | null> {
    return this.prisma.crmVerificationRequest.findFirst({
      where: { physicianId },
      orderBy: { requestedAt: 'desc' },
    });
  }

  /**
   * Lista solicitações de verificação filtradas por status.
   * Usado pelo console admin (E2) com abas PENDING/APPROVED/REJECTED.
   * @param status - 'PENDING' | 'APPROVED' | 'REJECTED'. Default: 'PENDING'.
   */
  async listByStatus(
    status?: string,
  ): Promise<
    (CrmVerificationRequest & {
      physician: {
        id: string;
        name: string | null;
        crmUf: string;
        crmNumber: string;
        email: string;
      };
    })[]
  > {
    const validStatuses = ['PENDING', 'APPROVED', 'REJECTED'];
    const filter = status && validStatuses.includes(status) ? (status as 'PENDING' | 'APPROVED' | 'REJECTED') : 'PENDING';

    const orderBy = filter === 'PENDING' ? { requestedAt: 'asc' as const } : { resolvedAt: 'desc' as const };

    return this.prisma.crmVerificationRequest.findMany({
      where: { status: filter },
      include: {
        physician: {
          select: { id: true, name: true, crmUf: true, crmNumber: true, email: true },
        },
      },
      orderBy,
    });
  }

  /**
   * Aprova uma solicitação de verificação.
   *
   * Em transação:
   * 1. Atualiza status da solicitação para APPROVED
   * 2. Seta crm_verified=true no médico
   */
  async approve(
    requestId: string,
    resolvedBy: string,
    notes?: string,
  ): Promise<CrmVerificationRequest> {
    const request = await this.prisma.crmVerificationRequest.findUnique({
      where: { id: requestId },
    });

    if (!request) throw new NotFoundException('Solicitação não encontrada');
    if (request.status !== 'PENDING') {
      throw new BadRequestException(`Solicitação já foi resolvida com status: ${request.status}`);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const resolved = await tx.crmVerificationRequest.update({
        where: { id: requestId },
        data: {
          status: 'APPROVED',
          resolvedBy,
          resolvedAt: new Date(),
          notes: notes ?? null,
        },
      });

      await tx.physician.update({
        where: { id: request.physicianId },
        data: { crmVerified: true },
      });

      return resolved;
    });

    await this.auditSilently({
      actorId: resolvedBy,
      action: 'CRM_VERIFICATION_APPROVED',
      entity: 'CrmVerificationRequest',
      entityId: requestId,
      payload: { physicianId: request.physicianId, notes },
    });

    return updated;
  }

  /**
   * Rejeita uma solicitação de verificação.
   */
  async reject(
    requestId: string,
    resolvedBy: string,
    notes?: string,
  ): Promise<CrmVerificationRequest> {
    const request = await this.prisma.crmVerificationRequest.findUnique({
      where: { id: requestId },
    });

    if (!request) throw new NotFoundException('Solicitação não encontrada');
    if (request.status !== 'PENDING') {
      throw new BadRequestException(`Solicitação já foi resolvida com status: ${request.status}`);
    }

    const updated = await this.prisma.crmVerificationRequest.update({
      where: { id: requestId },
      data: {
        status: 'REJECTED',
        resolvedBy,
        resolvedAt: new Date(),
        notes: notes ?? null,
      },
    });

    await this.auditSilently({
      actorId: resolvedBy,
      action: 'CRM_VERIFICATION_REJECTED',
      entity: 'CrmVerificationRequest',
      entityId: requestId,
      payload: { physicianId: request.physicianId, notes },
    });

    return updated;
  }

  private async auditSilently(params: Parameters<AuditService['log']>[0]): Promise<void> {
    await this.auditService.log(params).catch(() => undefined);
  }
}
