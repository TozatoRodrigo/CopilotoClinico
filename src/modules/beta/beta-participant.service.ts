import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { BetaParticipant } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BETA_TERMS, type BetaMe, type BetaProfile } from '../../shared/contracts/beta';
import { betaProfileSchema, type BetaProfileInput } from './schemas/beta.schemas';

export const BETA_TERMS_OUTDATED_MESSAGE =
  'O termo do beta mudou. Recarregue a página e leia a versão nova antes de aceitar.';

function completeProfile(participant: BetaParticipant): BetaProfile | null {
  const parsed = betaProfileSchema.safeParse({
    training: participant.training,
    facilityType: participant.facilityType,
    uf: participant.uf,
    cityType: participant.cityType,
  });
  return parsed.success ? parsed.data : null;
}

export function toBetaMe(participant: BetaParticipant | null): BetaMe {
  if (!participant) return { participant: false };
  const profile = completeProfile(participant);
  const upToDate = participant.termsVersion === BETA_TERMS.version;
  return {
    participant: true,
    joinedAt: participant.joinedAt.toISOString(),
    terms: {
      currentVersion: BETA_TERMS.version,
      acceptedVersion: participant.termsVersion,
      acceptedAt: participant.termsAcceptedAt?.toISOString() ?? null,
      upToDate,
    },
    profile,
    needsOnboarding: !upToDate || profile === null,
  };
}

/**
 * CC-702 — onboarding de quem entrou por convite: aceite do termo do beta
 * (versionado; texto provisório até o parecer jurídico) e o perfil mínimo.
 * Só existe para participantes: cadastro aberto (sem convite) não passa por
 * aqui.
 */
@Injectable()
export class BetaParticipantService {
  private readonly logger = new Logger(BetaParticipantService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  async me(physicianId: string): Promise<BetaMe> {
    const participant = await this.prisma.betaParticipant.findUnique({ where: { physicianId } });
    return toBetaMe(participant);
  }

  /**
   * Só a versão em vigor é aceita: quem leu uma versão antiga (aba aberta
   * antes da troca) recebe 409 e relê. A versão aceita e a data ficam no
   * participante; a trilha de auditoria guarda cada aceite.
   */
  async acceptTerms(physicianId: string, version: string, ip?: string): Promise<BetaMe> {
    if (version !== BETA_TERMS.version) {
      throw new ConflictException(BETA_TERMS_OUTDATED_MESSAGE);
    }
    const participant = await this.requireParticipant(physicianId);

    const updated = await this.prisma.betaParticipant.update({
      where: { physicianId },
      data: { termsVersion: version, termsAcceptedAt: new Date() },
    });

    this.logger.log(`BETA_TERMS_ACCEPTED version=${version}`);
    await this.auditSilently({
      actorId: physicianId,
      action: 'BETA_TERMS_ACCEPTED',
      entity: 'BetaParticipant',
      entityId: participant.id,
      payload: { version, provisional: BETA_TERMS.provisional },
      ip,
    });
    return toBetaMe(updated);
  }

  /**
   * Perfil mínimo (formação, local e porte, UF, capital/interior).
   *
   * Ponto de integração com o CC-602 (perfil do local de plantão, PR #184):
   * quando ele estiver na base, criar aqui também o local padrão do médico
   * com `facilityType` (mesmos valores), para o primeiro caso já sair com o
   * contexto do plantão.
   */
  async saveProfile(physicianId: string, profile: BetaProfileInput): Promise<BetaMe> {
    const participant = await this.requireParticipant(physicianId);

    const updated = await this.prisma.betaParticipant.update({
      where: { physicianId },
      data: { ...profile, profileUpdatedAt: new Date() },
    });

    await this.auditSilently({
      actorId: physicianId,
      action: 'BETA_PROFILE_UPDATED',
      entity: 'BetaParticipant',
      entityId: participant.id,
      payload: { fields: Object.keys(profile) },
    });
    return toBetaMe(updated);
  }

  private async requireParticipant(physicianId: string): Promise<BetaParticipant> {
    const participant = await this.prisma.betaParticipant.findUnique({ where: { physicianId } });
    if (!participant) throw new NotFoundException('Esta conta não entrou no beta por convite');
    return participant;
  }

  private async auditSilently(params: Parameters<AuditService['log']>[0]): Promise<void> {
    await this.auditService.log(params).catch((err: unknown) => {
      this.logger.error(
        `BETA_AUDIT_FAILED action=${params.action}: ${err instanceof Error ? err.message : 'erro'}`,
      );
    });
  }
}
