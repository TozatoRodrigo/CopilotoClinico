import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { generateSecret, generateSync } from 'otplib';
import { MfaService } from './mfa.service';
import { PrismaService } from '../../config/prisma.service';
import { CryptoService } from '../../shared/crypto/crypto.service';
import { AuditService } from '../audit/audit.service';

// ── helpers ─────────────────────────────────────────────────────────────────

const PHYSICIAN_ID = 'phy-uuid-001';
const REAL_SECRET = generateSecret();

function buildMocks() {
  const prisma = {
    physician: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    mfaBackupCode: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma)),
  } as unknown as PrismaService;

  const crypto = {
    encrypt: vi.fn((v: string) => `enc:${v}`),
    decrypt: vi.fn((v: string) => v.replace(/^enc:/, '')),
  } as unknown as CryptoService;

  const audit = { log: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;

  const service = new MfaService(prisma, crypto, audit);
  return { service, prisma, crypto, audit };
}

// ── setupMfa ────────────────────────────────────────────────────────────────

describe('MfaService.setupMfa', () => {
  it('throws NotFoundException when physician does not exist', async () => {
    const { service, prisma } = buildMocks();
    vi.mocked(prisma.physician.findUnique).mockResolvedValue(null);
    await expect(service.setupMfa(PHYSICIAN_ID)).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequestException when MFA is already enabled', async () => {
    const { service, prisma } = buildMocks();
    vi.mocked(prisma.physician.findUnique).mockResolvedValue({
      id: PHYSICIAN_ID,
      email: 'dr@example.com',
      mfaEnabled: true,
    } as never);
    await expect(service.setupMfa(PHYSICIAN_ID)).rejects.toThrow(BadRequestException);
  });

  it('returns otpauthUri, 8 backup codes and qrCode', async () => {
    const { service, prisma, crypto } = buildMocks();
    vi.mocked(prisma.physician.findUnique).mockResolvedValue({
      id: PHYSICIAN_ID,
      email: 'dr@example.com',
      mfaEnabled: false,
    } as never);
    vi.mocked(prisma.physician.update).mockResolvedValue({} as never);
    vi.mocked(prisma.mfaBackupCode.deleteMany).mockResolvedValue({ count: 0 } as never);
    vi.mocked(prisma.mfaBackupCode.createMany).mockResolvedValue({ count: 8 } as never);

    const result = await service.setupMfa(PHYSICIAN_ID);

    expect(result.otpauthUri).toMatch(/^otpauth:\/\/totp\//);
    expect(result.backupCodes).toHaveLength(8);
    result.backupCodes.forEach((code) => expect(code).toMatch(/^[0-9a-f]{8}$/));
    expect(result.qrCode).toMatch(/^data:image\/png;base64,/);
    expect(crypto.encrypt).toHaveBeenCalledOnce();
  });

  it('encrypts the TOTP secret before storing', async () => {
    const { service, prisma, crypto } = buildMocks();
    vi.mocked(prisma.physician.findUnique).mockResolvedValue({
      id: PHYSICIAN_ID,
      email: 'dr@example.com',
      mfaEnabled: false,
    } as never);
    vi.mocked(prisma.physician.update).mockResolvedValue({} as never);
    vi.mocked(prisma.mfaBackupCode.deleteMany).mockResolvedValue({ count: 0 } as never);
    vi.mocked(prisma.mfaBackupCode.createMany).mockResolvedValue({ count: 8 } as never);

    await service.setupMfa(PHYSICIAN_ID);

    const updateCall = vi.mocked(prisma.physician.update).mock.calls[0];
    expect((updateCall?.[0] as { data: { mfaSecret: string } }).data.mfaSecret).toMatch(/^enc:/);
  });
});

// ── enableMfa ───────────────────────────────────────────────────────────────

describe('MfaService.enableMfa', () => {
  it('throws NotFoundException when physician does not exist', async () => {
    const { service, prisma } = buildMocks();
    vi.mocked(prisma.physician.findUnique).mockResolvedValue(null);
    await expect(service.enableMfa(PHYSICIAN_ID, '123456')).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequestException when MFA already enabled', async () => {
    const { service, prisma } = buildMocks();
    vi.mocked(prisma.physician.findUnique).mockResolvedValue({
      mfaEnabled: true,
      mfaSecret: 'enc:secret',
    } as never);
    await expect(service.enableMfa(PHYSICIAN_ID, '123456')).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException when no secret stored', async () => {
    const { service, prisma } = buildMocks();
    vi.mocked(prisma.physician.findUnique).mockResolvedValue({
      mfaEnabled: false,
      mfaSecret: null,
    } as never);
    await expect(service.enableMfa(PHYSICIAN_ID, '123456')).rejects.toThrow(BadRequestException);
  });

  it('throws UnauthorizedException for invalid TOTP code', async () => {
    const { service, prisma } = buildMocks();
    vi.mocked(prisma.physician.findUnique).mockResolvedValue({
      mfaEnabled: false,
      mfaSecret: `enc:${REAL_SECRET}`,
    } as never);
    await expect(service.enableMfa(PHYSICIAN_ID, '000000')).rejects.toThrow(UnauthorizedException);
  });

  it('enables MFA when TOTP code is valid', async () => {
    const { service, prisma } = buildMocks();
    vi.mocked(prisma.physician.findUnique).mockResolvedValue({
      mfaEnabled: false,
      mfaSecret: `enc:${REAL_SECRET}`,
    } as never);
    vi.mocked(prisma.physician.update).mockResolvedValue({} as never);

    const validCode = generateSync({ secret: REAL_SECRET });
    await service.enableMfa(PHYSICIAN_ID, validCode);

    expect(prisma.physician.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { mfaEnabled: true } }),
    );
  });
});

// ── verifyMfaCode ────────────────────────────────────────────────────────────

describe('MfaService.verifyMfaCode', () => {
  it('throws UnauthorizedException when MFA not configured', async () => {
    const { service, prisma } = buildMocks();
    vi.mocked(prisma.physician.findUnique).mockResolvedValue({
      mfaEnabled: false,
      mfaSecret: null,
    } as never);
    await expect(service.verifyMfaCode(PHYSICIAN_ID, '123456')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('accepts valid TOTP code', async () => {
    const { service, prisma } = buildMocks();
    vi.mocked(prisma.physician.findUnique).mockResolvedValue({
      mfaEnabled: true,
      mfaSecret: `enc:${REAL_SECRET}`,
    } as never);

    const validCode = generateSync({ secret: REAL_SECRET });
    await expect(service.verifyMfaCode(PHYSICIAN_ID, validCode)).resolves.toBeUndefined();
  });

  it('accepts valid backup code', async () => {
    const { service, prisma } = buildMocks();
    vi.mocked(prisma.physician.findUnique).mockResolvedValue({
      mfaEnabled: true,
      mfaSecret: `enc:${REAL_SECRET}`,
    } as never);
    // TOTP will fail, backup code will succeed
    vi.mocked(prisma.mfaBackupCode.findFirst).mockResolvedValue({
      id: 'bkp-uuid-001',
      codeHash: 'any',
    } as never);
    vi.mocked(prisma.mfaBackupCode.update).mockResolvedValue({} as never);

    await expect(service.verifyMfaCode(PHYSICIAN_ID, 'wrong-totp-uses-backup')).resolves.toBeUndefined();
    expect(prisma.mfaBackupCode.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ usedAt: expect.any(Date) }) }),
    );
  });

  it('throws UnauthorizedException when both TOTP and backup code fail', async () => {
    const { service, prisma } = buildMocks();
    vi.mocked(prisma.physician.findUnique).mockResolvedValue({
      mfaEnabled: true,
      mfaSecret: `enc:${REAL_SECRET}`,
    } as never);
    vi.mocked(prisma.mfaBackupCode.findFirst).mockResolvedValue(null);

    await expect(service.verifyMfaCode(PHYSICIAN_ID, 'invalid')).rejects.toThrow(
      UnauthorizedException,
    );
  });
});

// ── disableMfa ───────────────────────────────────────────────────────────────

describe('MfaService.disableMfa', () => {
  it('throws NotFoundException when physician does not exist', async () => {
    const { service, prisma } = buildMocks();
    vi.mocked(prisma.physician.findUnique).mockResolvedValue(null);
    await expect(service.disableMfa(PHYSICIAN_ID, '123456')).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequestException when MFA not enabled', async () => {
    const { service, prisma } = buildMocks();
    vi.mocked(prisma.physician.findUnique).mockResolvedValue({
      mfaEnabled: false,
      mfaSecret: null,
    } as never);
    await expect(service.disableMfa(PHYSICIAN_ID, '123456')).rejects.toThrow(BadRequestException);
  });

  it('throws UnauthorizedException for invalid TOTP code', async () => {
    const { service, prisma } = buildMocks();
    vi.mocked(prisma.physician.findUnique).mockResolvedValue({
      mfaEnabled: true,
      mfaSecret: `enc:${REAL_SECRET}`,
    } as never);
    await expect(service.disableMfa(PHYSICIAN_ID, '000000')).rejects.toThrow(UnauthorizedException);
  });

  it('clears mfaEnabled, mfaSecret and backup codes on valid TOTP', async () => {
    const { service, prisma } = buildMocks();
    vi.mocked(prisma.physician.findUnique).mockResolvedValue({
      mfaEnabled: true,
      mfaSecret: `enc:${REAL_SECRET}`,
    } as never);
    vi.mocked(prisma.physician.update).mockResolvedValue({} as never);
    vi.mocked(prisma.mfaBackupCode.deleteMany).mockResolvedValue({ count: 8 } as never);

    const validCode = generateSync({ secret: REAL_SECRET });
    await service.disableMfa(PHYSICIAN_ID, validCode);

    const updateCall = vi.mocked(prisma.physician.update).mock.calls[0];
    expect((updateCall?.[0] as { data: unknown }).data).toEqual({
      mfaEnabled: false,
      mfaSecret: null,
    });
    expect(prisma.mfaBackupCode.deleteMany).toHaveBeenCalledWith({ where: { physicianId: PHYSICIAN_ID } });
  });
});

// ── resetMfa (admin) ─────────────────────────────────────────────────────────

describe('MfaService.resetMfa', () => {
  const ADMIN_ID = 'admin-uuid-001';

  it('throws NotFoundException when physician does not exist', async () => {
    const { service, prisma } = buildMocks();
    vi.mocked(prisma.physician.findUnique).mockResolvedValue(null);
    await expect(service.resetMfa(PHYSICIAN_ID, ADMIN_ID)).rejects.toThrow(NotFoundException);
  });

  it('clears mfaEnabled, mfaSecret and backup codes for any physician', async () => {
    const { service, prisma } = buildMocks();
    vi.mocked(prisma.physician.findUnique).mockResolvedValue({
      id: PHYSICIAN_ID,
      mfaEnabled: true,
    } as never);
    vi.mocked(prisma.physician.update).mockResolvedValue({} as never);
    vi.mocked(prisma.mfaBackupCode.deleteMany).mockResolvedValue({ count: 8 } as never);

    await service.resetMfa(PHYSICIAN_ID, ADMIN_ID);

    const updateCall = vi.mocked(prisma.physician.update).mock.calls[0];
    expect((updateCall?.[0] as { data: unknown }).data).toEqual({
      mfaEnabled: false,
      mfaSecret: null,
    });
    expect(prisma.mfaBackupCode.deleteMany).toHaveBeenCalledWith({ where: { physicianId: PHYSICIAN_ID } });
  });

  it('dispatches audit event with adminId as actorId', async () => {
    const { service, prisma, audit } = buildMocks();
    vi.mocked(prisma.physician.findUnique).mockResolvedValue({
      id: PHYSICIAN_ID,
      mfaEnabled: true,
    } as never);
    vi.mocked(prisma.physician.update).mockResolvedValue({} as never);
    vi.mocked(prisma.mfaBackupCode.deleteMany).mockResolvedValue({ count: 0 } as never);

    await service.resetMfa(PHYSICIAN_ID, ADMIN_ID);

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: ADMIN_ID,
        action: 'AUTH_MFA_ADMIN_RESET',
        entity: 'Physician',
        entityId: PHYSICIAN_ID,
      }),
    );
  });
});

// ── resetAllMfa (admin bulk) ─────────────────────────────────────────────────

describe('MfaService.resetAllMfa', () => {
  const ADMIN_ID = 'admin:admin-uuid-001';

  function withFindMany(prisma: ReturnType<typeof buildMocks>['prisma']) {
    (prisma as unknown as { physician: { findMany: ReturnType<typeof vi.fn> } }).physician
      .findMany = vi.fn();
    return prisma as unknown as { physician: { findMany: ReturnType<typeof vi.fn> } };
  }

  it('returns count 0 and touches nothing when no one has MFA enabled', async () => {
    const mocks = buildMocks();
    const { service, prisma, audit } = mocks;
    const withMany = withFindMany(prisma);
    withMany.physician.findMany.mockResolvedValue([]);

    const result = await service.resetAllMfa(ADMIN_ID);

    expect(result).toEqual({ count: 0, physicianIds: [] });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('clears mfaEnabled, mfaSecret and backup codes for every enabled physician', async () => {
    const mocks = buildMocks();
    const { service, prisma } = mocks;
    const withMany = withFindMany(prisma);
    withMany.physician.findMany.mockResolvedValue([{ id: 'phy-1' }, { id: 'phy-2' }]);
    (prisma as unknown as { physician: { updateMany: ReturnType<typeof vi.fn> } }).physician
      .updateMany = vi.fn().mockResolvedValue({ count: 2 });
    vi.mocked(prisma.mfaBackupCode.deleteMany).mockResolvedValue({ count: 4 } as never);

    const result = await service.resetAllMfa(ADMIN_ID);

    expect(result).toEqual({ count: 2, physicianIds: ['phy-1', 'phy-2'] });
    const updateManyMock = (
      prisma as unknown as { physician: { updateMany: ReturnType<typeof vi.fn> } }
    ).physician.updateMany;
    expect(updateManyMock).toHaveBeenCalledWith({
      where: { id: { in: ['phy-1', 'phy-2'] } },
      data: { mfaEnabled: false, mfaSecret: null },
    });
    expect(prisma.mfaBackupCode.deleteMany).toHaveBeenCalledWith({
      where: { physicianId: { in: ['phy-1', 'phy-2'] } },
    });
  });

  it('dispatches one audit event per affected physician with adminId as actorId', async () => {
    const mocks = buildMocks();
    const { service, prisma, audit } = mocks;
    const withMany = withFindMany(prisma);
    withMany.physician.findMany.mockResolvedValue([{ id: 'phy-1' }, { id: 'phy-2' }]);
    (prisma as unknown as { physician: { updateMany: ReturnType<typeof vi.fn> } }).physician
      .updateMany = vi.fn().mockResolvedValue({ count: 2 });
    vi.mocked(prisma.mfaBackupCode.deleteMany).mockResolvedValue({ count: 0 } as never);

    await service.resetAllMfa(ADMIN_ID);

    expect(audit.log).toHaveBeenCalledTimes(2);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: ADMIN_ID,
        action: 'AUTH_MFA_ADMIN_BULK_RESET',
        entity: 'Physician',
        entityId: 'phy-1',
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: ADMIN_ID,
        action: 'AUTH_MFA_ADMIN_BULK_RESET',
        entity: 'Physician',
        entityId: 'phy-2',
      }),
    );
  });
});

// ── regenerateBackupCodes (S24-MFA-03) ───────────────────────────────────────

describe('S24-MFA-03 — MfaService.regenerateBackupCodes', () => {
  it('throws NotFoundException when physician does not exist', async () => {
    const { service, prisma } = buildMocks();
    vi.mocked(prisma.physician.findUnique).mockResolvedValue(null);
    await expect(service.regenerateBackupCodes(PHYSICIAN_ID, '123456')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws BadRequestException when MFA is not enabled', async () => {
    const { service, prisma } = buildMocks();
    vi.mocked(prisma.physician.findUnique).mockResolvedValue({
      mfaEnabled: false,
      mfaSecret: null,
    } as never);
    await expect(service.regenerateBackupCodes(PHYSICIAN_ID, '123456')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('throws UnauthorizedException for invalid TOTP code', async () => {
    const { service, prisma } = buildMocks();
    vi.mocked(prisma.physician.findUnique).mockResolvedValue({
      mfaEnabled: true,
      mfaSecret: `enc:${REAL_SECRET}`,
    } as never);
    await expect(service.regenerateBackupCodes(PHYSICIAN_ID, '000000')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('returns 8 new backup codes when TOTP is valid', async () => {
    const { service, prisma } = buildMocks();
    vi.mocked(prisma.physician.findUnique).mockResolvedValue({
      mfaEnabled: true,
      mfaSecret: `enc:${REAL_SECRET}`,
    } as never);
    vi.mocked(prisma.mfaBackupCode.deleteMany).mockResolvedValue({ count: 8 } as never);
    vi.mocked(prisma.mfaBackupCode.createMany).mockResolvedValue({ count: 8 } as never);

    const validCode = generateSync({ secret: REAL_SECRET });
    const result = await service.regenerateBackupCodes(PHYSICIAN_ID, validCode);

    expect(result.backupCodes).toHaveLength(8);
    result.backupCodes.forEach((code) => expect(code).toMatch(/^[0-9a-f]{8}$/));
  });

  it('invalidates previous backup codes before creating new ones', async () => {
    const { service, prisma } = buildMocks();
    vi.mocked(prisma.physician.findUnique).mockResolvedValue({
      mfaEnabled: true,
      mfaSecret: `enc:${REAL_SECRET}`,
    } as never);
    vi.mocked(prisma.mfaBackupCode.deleteMany).mockResolvedValue({ count: 8 } as never);
    vi.mocked(prisma.mfaBackupCode.createMany).mockResolvedValue({ count: 8 } as never);

    const validCode = generateSync({ secret: REAL_SECRET });
    await service.regenerateBackupCodes(PHYSICIAN_ID, validCode);

    // Delete (invalidação) acontece antes do create na transação.
    expect(prisma.mfaBackupCode.deleteMany).toHaveBeenCalledWith({
      where: { physicianId: PHYSICIAN_ID },
    });
    expect(prisma.mfaBackupCode.createMany).toHaveBeenCalled();
  });

  it('does NOT touch the TOTP secret (only backup codes)', async () => {
    const { service, prisma } = buildMocks();
    vi.mocked(prisma.physician.findUnique).mockResolvedValue({
      mfaEnabled: true,
      mfaSecret: `enc:${REAL_SECRET}`,
    } as never);
    vi.mocked(prisma.mfaBackupCode.deleteMany).mockResolvedValue({ count: 8 } as never);
    vi.mocked(prisma.mfaBackupCode.createMany).mockResolvedValue({ count: 8 } as never);

    const validCode = generateSync({ secret: REAL_SECRET });
    await service.regenerateBackupCodes(PHYSICIAN_ID, validCode);

    // Médico continua com o mesmo app autenticador — secret não é alterado.
    expect(prisma.physician.update).not.toHaveBeenCalled();
  });

  it('generates different codes each call (no reuse)', async () => {
    const { service, prisma } = buildMocks();
    vi.mocked(prisma.physician.findUnique).mockResolvedValue({
      mfaEnabled: true,
      mfaSecret: `enc:${REAL_SECRET}`,
    } as never);
    vi.mocked(prisma.mfaBackupCode.deleteMany).mockResolvedValue({ count: 8 } as never);
    vi.mocked(prisma.mfaBackupCode.createMany).mockResolvedValue({ count: 8 } as never);

    const validCode = generateSync({ secret: REAL_SECRET });
    const r1 = await service.regenerateBackupCodes(PHYSICIAN_ID, validCode);
    const r2 = await service.regenerateBackupCodes(PHYSICIAN_ID, validCode);

    // Probabilidade de colisão de 8 códigos hex de 4 bytes é ~0.
    expect(r1.backupCodes).not.toEqual(r2.backupCodes);
  });

  it('dispatches AUTH_MFA_BACKUPS_REGENERATED audit event', async () => {
    const { service, prisma, audit } = buildMocks();
    vi.mocked(prisma.physician.findUnique).mockResolvedValue({
      mfaEnabled: true,
      mfaSecret: `enc:${REAL_SECRET}`,
    } as never);
    vi.mocked(prisma.mfaBackupCode.deleteMany).mockResolvedValue({ count: 8 } as never);
    vi.mocked(prisma.mfaBackupCode.createMany).mockResolvedValue({ count: 8 } as never);

    const validCode = generateSync({ secret: REAL_SECRET });
    await service.regenerateBackupCodes(PHYSICIAN_ID, validCode);

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: PHYSICIAN_ID,
        action: 'AUTH_MFA_BACKUPS_REGENERATED',
        entity: 'Physician',
        entityId: PHYSICIAN_ID,
      }),
    );
  });
});
