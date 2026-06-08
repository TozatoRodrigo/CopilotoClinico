import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CrmVerificationService } from './crm-verification.service';
import { PrismaService } from '../../config/prisma.service';
import { AuditService } from '../audit/audit.service';

// ── helpers ─────────────────────────────────────────────────────────────────

const PHYSICIAN_ID = 'phy-uuid-001';
const REQUEST_ID = 'req-uuid-001';

const mockPhysician = {
  id: PHYSICIAN_ID,
  name: 'Dr. Test',
  email: 'dr@example.com',
  crmUf: 'SP',
  crmNumber: '123456',
  crmVerified: false,
};

const mockPendingRequest = {
  id: REQUEST_ID,
  physicianId: PHYSICIAN_ID,
  status: 'PENDING' as const,
  notes: null,
  resolvedBy: null,
  resolvedAt: null,
  requestedAt: new Date('2026-06-08T12:00:00Z'),
};

function buildMocks() {
  const prisma = {
    physician: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    crmVerificationRequest: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn(async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma)),
  } as unknown as PrismaService;

  const audit = { log: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;

  const service = new CrmVerificationService(prisma, audit);
  return { service, prisma, audit };
}

// ── requestVerification ──────────────────────────────────────────────────────

describe('CrmVerificationService.requestVerification', () => {
  it('throws NotFoundException when physician does not exist', async () => {
    const { service, prisma } = buildMocks();
    vi.mocked(prisma.physician.findUnique).mockResolvedValue(null);
    await expect(service.requestVerification(PHYSICIAN_ID)).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequestException when CRM is already verified', async () => {
    const { service, prisma } = buildMocks();
    vi.mocked(prisma.physician.findUnique).mockResolvedValue({
      ...mockPhysician,
      crmVerified: true,
    } as never);
    await expect(service.requestVerification(PHYSICIAN_ID)).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException when a PENDING request already exists', async () => {
    const { service, prisma } = buildMocks();
    vi.mocked(prisma.physician.findUnique).mockResolvedValue(mockPhysician as never);
    vi.mocked(prisma.crmVerificationRequest.findFirst).mockResolvedValue(
      mockPendingRequest as never,
    );
    await expect(service.requestVerification(PHYSICIAN_ID)).rejects.toThrow(BadRequestException);
  });

  it('creates a PENDING request when no prior request exists', async () => {
    const { service, prisma } = buildMocks();
    vi.mocked(prisma.physician.findUnique).mockResolvedValue(mockPhysician as never);
    vi.mocked(prisma.crmVerificationRequest.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.crmVerificationRequest.create).mockResolvedValue(mockPendingRequest as never);

    const result = await service.requestVerification(PHYSICIAN_ID);

    expect(prisma.crmVerificationRequest.create).toHaveBeenCalledWith({
      data: { physicianId: PHYSICIAN_ID },
    });
    expect(result.status).toBe('PENDING');
  });

  it('logs CRM_VERIFICATION_REQUESTED audit event', async () => {
    const { service, prisma, audit } = buildMocks();
    vi.mocked(prisma.physician.findUnique).mockResolvedValue(mockPhysician as never);
    vi.mocked(prisma.crmVerificationRequest.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.crmVerificationRequest.create).mockResolvedValue(mockPendingRequest as never);

    await service.requestVerification(PHYSICIAN_ID);

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CRM_VERIFICATION_REQUESTED' }),
    );
  });
});

// ── getLatestRequest ─────────────────────────────────────────────────────────

describe('CrmVerificationService.getLatestRequest', () => {
  it('returns null when no request exists', async () => {
    const { service, prisma } = buildMocks();
    vi.mocked(prisma.crmVerificationRequest.findFirst).mockResolvedValue(null);
    const result = await service.getLatestRequest(PHYSICIAN_ID);
    expect(result).toBeNull();
  });

  it('returns the latest request ordered by requestedAt desc', async () => {
    const { service, prisma } = buildMocks();
    vi.mocked(prisma.crmVerificationRequest.findFirst).mockResolvedValue(
      mockPendingRequest as never,
    );
    const result = await service.getLatestRequest(PHYSICIAN_ID);
    expect(prisma.crmVerificationRequest.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { requestedAt: 'desc' } }),
    );
    expect(result).toEqual(mockPendingRequest);
  });
});

// ── listPending ──────────────────────────────────────────────────────────────

describe('CrmVerificationService.listPending', () => {
  it('returns all PENDING requests with physician data', async () => {
    const { service, prisma } = buildMocks();
    const pendingWithPhysician = { ...mockPendingRequest, physician: mockPhysician };
    vi.mocked(prisma.crmVerificationRequest.findMany).mockResolvedValue([
      pendingWithPhysician,
    ] as never);

    const result = await service.listPending();

    expect(prisma.crmVerificationRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'PENDING' } }),
    );
    expect(result).toHaveLength(1);
  });
});

// ── approve ──────────────────────────────────────────────────────────────────

describe('CrmVerificationService.approve', () => {
  it('throws NotFoundException when request does not exist', async () => {
    const { service, prisma } = buildMocks();
    vi.mocked(prisma.crmVerificationRequest.findUnique).mockResolvedValue(null);
    await expect(service.approve(REQUEST_ID, 'admin')).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequestException when request is already resolved', async () => {
    const { service, prisma } = buildMocks();
    vi.mocked(prisma.crmVerificationRequest.findUnique).mockResolvedValue({
      ...mockPendingRequest,
      status: 'APPROVED',
    } as never);
    await expect(service.approve(REQUEST_ID, 'admin')).rejects.toThrow(BadRequestException);
  });

  it('updates request to APPROVED and sets crm_verified=true in a transaction', async () => {
    const { service, prisma } = buildMocks();
    vi.mocked(prisma.crmVerificationRequest.findUnique).mockResolvedValue(
      mockPendingRequest as never,
    );
    vi.mocked(prisma.crmVerificationRequest.update).mockResolvedValue({
      ...mockPendingRequest,
      status: 'APPROVED',
      resolvedBy: 'admin',
    } as never);
    vi.mocked(prisma.physician.update).mockResolvedValue({} as never);

    await service.approve(REQUEST_ID, 'admin', 'Verified via CFM portal');

    expect(prisma.crmVerificationRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'APPROVED', resolvedBy: 'admin' }),
      }),
    );
    expect(prisma.physician.update).toHaveBeenCalledWith({
      where: { id: PHYSICIAN_ID },
      data: { crmVerified: true },
    });
  });

  it('logs CRM_VERIFICATION_APPROVED audit event', async () => {
    const { service, prisma, audit } = buildMocks();
    vi.mocked(prisma.crmVerificationRequest.findUnique).mockResolvedValue(
      mockPendingRequest as never,
    );
    vi.mocked(prisma.crmVerificationRequest.update).mockResolvedValue({
      ...mockPendingRequest,
      status: 'APPROVED',
    } as never);
    vi.mocked(prisma.physician.update).mockResolvedValue({} as never);

    await service.approve(REQUEST_ID, 'admin');

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CRM_VERIFICATION_APPROVED' }),
    );
  });
});

// ── reject ───────────────────────────────────────────────────────────────────

describe('CrmVerificationService.reject', () => {
  it('throws NotFoundException when request does not exist', async () => {
    const { service, prisma } = buildMocks();
    vi.mocked(prisma.crmVerificationRequest.findUnique).mockResolvedValue(null);
    await expect(service.reject(REQUEST_ID, 'admin', 'CRM não encontrado')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws BadRequestException when request is already resolved', async () => {
    const { service, prisma } = buildMocks();
    vi.mocked(prisma.crmVerificationRequest.findUnique).mockResolvedValue({
      ...mockPendingRequest,
      status: 'REJECTED',
    } as never);
    await expect(service.reject(REQUEST_ID, 'admin', 'motivo')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('updates request to REJECTED without touching crm_verified', async () => {
    const { service, prisma } = buildMocks();
    vi.mocked(prisma.crmVerificationRequest.findUnique).mockResolvedValue(
      mockPendingRequest as never,
    );
    vi.mocked(prisma.crmVerificationRequest.update).mockResolvedValue({
      ...mockPendingRequest,
      status: 'REJECTED',
      notes: 'Dados incorretos',
      resolvedBy: 'admin',
    } as never);

    await service.reject(REQUEST_ID, 'admin', 'Dados incorretos');

    expect(prisma.crmVerificationRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'REJECTED', resolvedBy: 'admin' }),
      }),
    );
    expect(prisma.physician.update).not.toHaveBeenCalled();
  });

  it('logs CRM_VERIFICATION_REJECTED audit event', async () => {
    const { service, prisma, audit } = buildMocks();
    vi.mocked(prisma.crmVerificationRequest.findUnique).mockResolvedValue(
      mockPendingRequest as never,
    );
    vi.mocked(prisma.crmVerificationRequest.update).mockResolvedValue({
      ...mockPendingRequest,
      status: 'REJECTED',
    } as never);

    await service.reject(REQUEST_ID, 'admin', 'motivo');

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CRM_VERIFICATION_REJECTED' }),
    );
  });
});
