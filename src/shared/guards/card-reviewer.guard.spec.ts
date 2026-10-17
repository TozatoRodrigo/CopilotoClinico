import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CARD_REVIEWER_CRM_REQUIRED_MESSAGE,
  CARD_REVIEWER_REQUIRED_MESSAGE,
  CardReviewerGuard,
} from './card-reviewer.guard';
import type { PrismaService } from '../../config/prisma.service';

function buildContext(user?: { physicianId: string; role?: string }): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('CardReviewerGuard', () => {
  let guard: CardReviewerGuard;
  let prisma: { physician: { findUnique: ReturnType<typeof vi.fn> } };

  beforeEach(() => {
    prisma = { physician: { findUnique: vi.fn() } };
    guard = new CardReviewerGuard(prisma as unknown as PrismaService);
  });

  it('libera o médico revisor com CRM verificado, qualquer que seja o papel', async () => {
    prisma.physician.findUnique.mockResolvedValue({ isCardReviewer: true, crmVerified: true });

    await expect(
      guard.canActivate(buildContext({ physicianId: 'phys-1', role: 'PHYSICIAN' })),
    ).resolves.toBe(true);
    expect(prisma.physician.findUnique).toHaveBeenCalledWith({
      where: { id: 'phys-1' },
      select: { isCardReviewer: true, crmVerified: true },
    });
  });

  it('recusa quem não é revisor, mesmo admin curador', async () => {
    prisma.physician.findUnique.mockResolvedValue({ isCardReviewer: false, crmVerified: true });

    await expect(
      guard.canActivate(buildContext({ physicianId: 'phys-1', role: 'ADMIN' })),
    ).rejects.toThrow(new ForbiddenException(CARD_REVIEWER_REQUIRED_MESSAGE));
  });

  it('recusa o revisor sem CRM verificado', async () => {
    prisma.physician.findUnique.mockResolvedValue({ isCardReviewer: true, crmVerified: false });

    await expect(guard.canActivate(buildContext({ physicianId: 'phys-1' }))).rejects.toThrow(
      new ForbiddenException(CARD_REVIEWER_CRM_REQUIRED_MESSAGE),
    );
  });

  it('recusa médico inexistente', async () => {
    prisma.physician.findUnique.mockResolvedValue(null);

    await expect(guard.canActivate(buildContext({ physicianId: 'phys-1' }))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('exige usuário autenticado', async () => {
    await expect(guard.canActivate(buildContext(undefined))).rejects.toThrow(UnauthorizedException);
    expect(prisma.physician.findUnique).not.toHaveBeenCalled();
  });
});
