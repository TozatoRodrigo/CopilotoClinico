import { afterEach, describe, expect, it, vi } from 'vitest';
import { CrmVerificationController } from './crm-verification.controller';
import { CrmVerificationService } from './crm-verification.service';

// CC-026 — o pedido de verificação de CRM vai para a trilha com o IP do
// médico (o que o Traefik acrescentou ao XFF), não com `req.ip`, que é o Traefik.
describe('CC-026 — CrmVerificationController: IP gravado na auditoria', () => {
  const originalHops = process.env.TRUSTED_PROXY_HOPS;

  afterEach(() => {
    if (originalHops === undefined) delete process.env.TRUSTED_PROXY_HOPS;
    else process.env.TRUSTED_PROXY_HOPS = originalHops;
  });

  it('XFF forjado à esquerda não muda o IP gravado', async () => {
    delete process.env.TRUSTED_PROXY_HOPS;
    const service = { requestVerification: vi.fn().mockResolvedValue({}) };
    const controller = new CrmVerificationController(service as unknown as CrmVerificationService);

    await controller.requestVerification({
      user: { physicianId: 'phy-1', role: 'PHYSICIAN' },
      ip: '172.18.0.5',
      headers: { 'x-forwarded-for': '6.6.6.6, 203.0.113.7' },
    });

    expect(service.requestVerification).toHaveBeenCalledWith('phy-1', '203.0.113.7');
  });
});
