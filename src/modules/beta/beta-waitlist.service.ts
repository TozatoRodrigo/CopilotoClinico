import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, type BetaWaitlistStatus } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  BETA_INVITE_LIMITS,
  type ApproveBetaWaitlistResponse,
  type BetaProfile,
  type BetaWaitlistEntryView,
  type BetaWaitlistListResponse,
  type BetaWaitlistResponse,
} from '../../shared/contracts/beta';
import { BetaInviteService, addDays, inviteWithUses, toInviteView } from './beta-invite.service';
import { betaProfileSchema } from './schemas/beta.schemas';
import type {
  ApproveWaitlistInput,
  WaitlistQuery,
  WaitlistRequestInput,
} from './schemas/beta.schemas';

const entryWithLatestInvite = {
  invites: { include: inviteWithUses, orderBy: { createdAt: 'desc' }, take: 1 },
} satisfies Prisma.BetaWaitlistEntryInclude;

type EntryWithLatestInvite = Prisma.BetaWaitlistEntryGetPayload<{
  include: typeof entryWithLatestInvite;
}>;

const RECEIVED: BetaWaitlistResponse = { status: 'received' };

/** Só os campos do perfil que vieram e são válidos (o que está no banco também passa por aqui). */
export function pickProfile(source: {
  training?: string | null;
  facilityType?: string | null;
  uf?: string | null;
  cityType?: string | null;
}): Partial<BetaProfile> {
  const parsed = betaProfileSchema.partial().safeParse({
    training: source.training ?? undefined,
    facilityType: source.facilityType ?? undefined,
    uf: source.uf ?? undefined,
    cityType: source.cityType ?? undefined,
  });
  if (!parsed.success) return {};
  return Object.fromEntries(
    Object.entries(parsed.data).filter(([, value]) => value !== undefined),
  ) as Partial<BetaProfile>;
}

function toEntryView(entry: EntryWithLatestInvite, now: Date): BetaWaitlistEntryView {
  const latest = entry.invites[0];
  return {
    id: entry.id,
    email: entry.email,
    profile: pickProfile(entry),
    contactConsentAt: entry.contactConsentAt.toISOString(),
    status: entry.status,
    createdAt: entry.createdAt.toISOString(),
    invite: latest ? toInviteView(latest, now) : null,
  };
}

/**
 * CC-702 — lista de espera de quem chegou ao cadastro sem convite durante o
 * beta. Guarda só o e-mail, o perfil mínimo opcional e a data do
 * consentimento explícito para contato. Nada disso vai para log nem para a
 * trilha de auditoria (só o id da entrada).
 */
@Injectable()
export class BetaWaitlistService {
  private readonly logger = new Logger(BetaWaitlistService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(BetaInviteService) private readonly invites: BetaInviteService,
  ) {}

  /**
   * Público. A resposta é sempre a mesma: a lista não confirma se um e-mail
   * já tem conta ou já está na fila. Pedido repetido renova o consentimento e
   * completa o perfil, sem apagar o que já havia.
   */
  async join(input: WaitlistRequestInput, ip?: string): Promise<BetaWaitlistResponse> {
    const email = input.email.trim().toLowerCase();
    const profile = pickProfile(input.profile ?? {});

    const account = await this.prisma.physician.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true },
    });
    if (account) {
      // Já tem conta: não há o que guardar (minimização).
      this.logger.log('BETA_WAITLIST_SKIPPED reason=account_exists');
      return RECEIVED;
    }

    const now = new Date();
    let entryId: string;
    try {
      const entry = await this.prisma.betaWaitlistEntry.upsert({
        where: { email },
        create: { email, ...profile, contactConsentAt: now },
        update: { ...profile, contactConsentAt: now },
        select: { id: true },
      });
      entryId = entry.id;
    } catch (err) {
      // Dois envios simultâneos do mesmo e-mail: o outro já gravou.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return RECEIVED;
      }
      throw err;
    }

    this.logger.log(`BETA_WAITLIST_JOINED profileFields=${Object.keys(profile).length}`);
    await this.auditSilently({
      actorId: 'anonymous',
      action: 'BETA_WAITLIST_JOINED',
      entity: 'BetaWaitlistEntry',
      entityId: entryId,
      payload: { profileFields: Object.keys(profile) },
      ip,
    });
    return RECEIVED;
  }

  async list(query: WaitlistQuery): Promise<BetaWaitlistListResponse> {
    const now = new Date();
    const [entries, grouped] = await Promise.all([
      this.prisma.betaWaitlistEntry.findMany({
        where: query.status ? { status: query.status } : {},
        include: entryWithLatestInvite,
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
      this.prisma.betaWaitlistEntry.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);

    const counts: Record<BetaWaitlistStatus, number> = { waiting: 0, invited: 0, registered: 0 };
    for (const row of grouped) counts[row.status] = row._count._all;

    return { entries: entries.map((entry) => toEntryView(entry, now)), counts };
  }

  /**
   * Gera um convite de uso único para a pessoa. Não envia nada: o admin
   * copia o link e manda (não há envio de e-mail no projeto, CC-015).
   */
  async approve(
    adminId: string,
    entryId: string,
    input: ApproveWaitlistInput,
  ): Promise<ApproveBetaWaitlistResponse> {
    const entry = await this.prisma.betaWaitlistEntry.findUnique({ where: { id: entryId } });
    if (!entry) throw new NotFoundException('Pessoa não encontrada na lista de espera');
    if (entry.status === 'registered') {
      throw new ConflictException('Esta pessoa já criou a conta');
    }

    const now = new Date();
    const batchLabel = input.batchLabel ?? BETA_INVITE_LIMITS.waitlistBatchLabelDefault;
    const validDays = input.validDays ?? BETA_INVITE_LIMITS.waitlistValidDaysDefault;
    const [invite] = await this.invites.insertInvites(
      {
        batchLabel,
        maxUses: 1,
        expiresAt: addDays(now, validDays),
        createdById: adminId,
        waitlistEntryId: entry.id,
      },
      1,
    );
    if (!invite) throw new Error('Convite não gerado');

    const updated = await this.prisma.betaWaitlistEntry.update({
      where: { id: entry.id },
      data: { status: 'invited' },
      include: entryWithLatestInvite,
    });

    await this.auditSilently({
      actorId: adminId,
      action: 'BETA_WAITLIST_APPROVED',
      entity: 'BetaWaitlistEntry',
      entityId: entry.id,
      payload: { inviteId: invite.id, batchLabel, validDays },
    });

    return {
      entry: toEntryView(updated, now),
      invite: toInviteView({ ...invite, participants: [] }, now),
    };
  }

  /** A pedido da pessoa (LGPD): apaga a entrada; o convite gerado, se houver, perde o vínculo. */
  async remove(adminId: string, entryId: string): Promise<void> {
    const deleted = await this.prisma.betaWaitlistEntry.deleteMany({ where: { id: entryId } });
    if (deleted.count === 0)
      throw new NotFoundException('Pessoa não encontrada na lista de espera');

    this.logger.log('BETA_WAITLIST_DELETED');
    await this.auditSilently({
      actorId: adminId,
      action: 'BETA_WAITLIST_DELETED',
      entity: 'BetaWaitlistEntry',
      entityId: entryId,
      payload: { reason: 'data_subject_request' },
    });
  }

  private async auditSilently(params: Parameters<AuditService['log']>[0]): Promise<void> {
    await this.auditService.log(params).catch((err: unknown) => {
      this.logger.error(
        `BETA_AUDIT_FAILED action=${params.action}: ${err instanceof Error ? err.message : 'erro'}`,
      );
    });
  }
}
