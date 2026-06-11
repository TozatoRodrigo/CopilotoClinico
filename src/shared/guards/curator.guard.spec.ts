import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CuratorGuard } from './curator.guard';
import { PrismaService } from '../../config/prisma.service';

function buildContext(user?: { physicianId: string }): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('CuratorGuard', () => {
  let guard: CuratorGuard;
  let prisma: { physician: { findUnique: ReturnType<typeof vi.fn> } };

  beforeEach(() => {
    prisma = { physician: { findUnique: vi.fn() } };
    guard = new CuratorGuard(prisma as unknown as PrismaService);
  });

  it('allows access when the physician has isCurator enabled', async () => {
    prisma.physician.findUnique.mockResolvedValue({ isCurator: true });

    await expect(guard.canActivate(buildContext({ physicianId: 'phys-1' }))).resolves.toBe(true);
    expect(prisma.physician.findUnique).toHaveBeenCalledWith({
      where: { id: 'phys-1' },
      select: { isCurator: true },
    });
  });

  it('throws ForbiddenException when the physician is not a curator', async () => {
    prisma.physician.findUnique.mockResolvedValue({ isCurator: false });

    await expect(guard.canActivate(buildContext({ physicianId: 'phys-1' }))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('throws ForbiddenException when the physician does not exist', async () => {
    prisma.physician.findUnique.mockResolvedValue(null);

    await expect(guard.canActivate(buildContext({ physicianId: 'phys-1' }))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('throws UnauthorizedException when there is no authenticated user', async () => {
    await expect(guard.canActivate(buildContext(undefined))).rejects.toThrow(UnauthorizedException);
    expect(prisma.physician.findUnique).not.toHaveBeenCalled();
  });
});
