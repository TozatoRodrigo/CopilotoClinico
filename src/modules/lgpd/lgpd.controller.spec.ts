import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LgpdController } from './lgpd.controller';
import { LgpdService } from './lgpd.service';

describe('LgpdController', () => {
  let controller: LgpdController;
  let lgpdServiceMock: {
    grantConsent: ReturnType<typeof vi.fn>;
    listConsentScopes: ReturnType<typeof vi.fn>;
    revokeConsent: ReturnType<typeof vi.fn>;
    exportPhysicianData: ReturnType<typeof vi.fn>;
    requestErasure: ReturnType<typeof vi.fn>;
  };

  const req = { user: { sub: 'physician-001' } };

  beforeEach(() => {
    vi.clearAllMocks();
    lgpdServiceMock = {
      grantConsent: vi.fn(),
      listConsentScopes: vi.fn(),
      revokeConsent: vi.fn(),
      exportPhysicianData: vi.fn(),
      requestErasure: vi.fn(),
    };
    controller = new LgpdController(lgpdServiceMock as unknown as LgpdService);
  });

  it('delegates consent grant with authenticated physician id', async () => {
    const consent = { id: 'consent-001', scope: 'ai_processing' };
    lgpdServiceMock.grantConsent.mockResolvedValue(consent);

    const result = await controller.grantConsent(req, { scope: 'ai_processing' });

    expect(lgpdServiceMock.grantConsent).toHaveBeenCalledWith(
      'physician-001',
      'ai_processing',
    );
    expect(result).toBe(consent);
  });

  it('delegates consent scope listing for authenticated physician', async () => {
    const scopes = [{ scope: 'ai_processing', granted: true }];
    lgpdServiceMock.listConsentScopes.mockResolvedValue(scopes);

    const result = await controller.listConsentScopes(req);

    expect(lgpdServiceMock.listConsentScopes).toHaveBeenCalledWith('physician-001');
    expect(result).toBe(scopes);
  });

  it('delegates consent revoke with requested scope', async () => {
    const revoked = { ok: true };
    lgpdServiceMock.revokeConsent.mockResolvedValue(revoked);

    const result = await controller.revokeConsent(req, 'analytics');

    expect(lgpdServiceMock.revokeConsent).toHaveBeenCalledWith('physician-001', 'analytics');
    expect(result).toBe(revoked);
  });

  it('delegates data export for authenticated physician', async () => {
    const exportedData = { physicianId: 'physician-001', records: [] };
    lgpdServiceMock.exportPhysicianData.mockResolvedValue(exportedData);

    const result = await controller.exportData(req);

    expect(lgpdServiceMock.exportPhysicianData).toHaveBeenCalledWith('physician-001');
    expect(result).toBe(exportedData);
  });

  it('delegates erasure requests for authenticated physician', async () => {
    const erasure = { id: 'erasure-001', status: 'PENDING' };
    lgpdServiceMock.requestErasure.mockResolvedValue(erasure);

    const result = await controller.requestErasure(req, { reason: 'requested by user' });

    expect(lgpdServiceMock.requestErasure).toHaveBeenCalledWith('physician-001');
    expect(result).toBe(erasure);
  });
});
