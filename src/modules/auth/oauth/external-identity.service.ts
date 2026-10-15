import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Physician } from '@prisma/client';
import { PrismaService } from '../../../config/prisma.service';
import { AuditService } from '../../audit/audit.service';
import type { OAuthProviderId } from '../../../shared/contracts/oauth';

/** Conta externa a vincular: o que o id_token garantiu. */
export interface ExternalIdentityClaim {
  provider: OAuthProviderId;
  subject: string;
  email: string;
}

/**
 * CC-334 — leitura e gravação de `external_identities`. A regra de quando
 * vincular fica no OAuthService/AuthService; aqui só o acesso ao banco e a
 * entrada na trilha.
 */
@Injectable()
export class ExternalIdentityService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  /** Médico já vinculado a esta conta externa, marcando o último login. */
  async signInBySubject(provider: OAuthProviderId, subject: string): Promise<Physician | null> {
    const identity = await this.prisma.externalIdentity.findUnique({
      where: { provider_subject: { provider, subject } },
      include: { physician: true },
    });
    if (!identity) return null;

    await this.prisma.externalIdentity.update({
      where: { id: identity.id },
      data: { lastLoginAt: new Date() },
    });
    return identity.physician;
  }

  /**
   * Vincula a conta externa ao médico. Idempotente para o mesmo médico (duplo
   * clique, MFA repetido); conta externa já ligada a OUTRO médico é conflito
   * — nunca se troca o dono de um vínculo.
   */
  async link(physicianId: string, claim: ExternalIdentityClaim, ip?: string): Promise<void> {
    try {
      await this.prisma.externalIdentity.create({
        data: {
          physicianId,
          provider: claim.provider,
          subject: claim.subject,
          emailAtLink: claim.email,
          lastLoginAt: new Date(),
        },
      });
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') {
        throw err;
      }
      const existing = await this.prisma.externalIdentity.findUnique({
        where: { provider_subject: { provider: claim.provider, subject: claim.subject } },
        select: { physicianId: true },
      });
      if (existing?.physicianId === physicianId) return;
      throw new ConflictException('Esta conta externa já está vinculada a outro cadastro');
    }

    // Sem e-mail nem `sub` no payload: a trilha é append-only e a eliminação
    // LGPD não a alcança (ver docs/compliance/LGPD.md). O vínculo em si fica
    // em external_identities, que a eliminação apaga.
    await this.auditService
      .log({
        actorId: physicianId,
        action: 'AUTH_OAUTH_LINKED',
        entity: 'Physician',
        entityId: physicianId,
        payload: { provider: claim.provider },
        ip,
      })
      .catch(() => undefined);
  }
}
