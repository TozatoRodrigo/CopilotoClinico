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

  it('returns otpauthUri and 8 backup codes', async () => {
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
