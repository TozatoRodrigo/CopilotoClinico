import { describe, expect, it, vi } from 'vitest';
import type { AnyDecommissionDeps } from './any-decommission-log';
import {
  ANY_DECOMMISSION_AUDIT_ACTION,
  AnyDecommissionRefusedError,
  parseCounts,
  recordAnyDecommissionStep,
} from './any-decommission-log';

const adminId = '99999999-9999-4999-8999-999999999999';

function build(admin = true) {
  const audit = { log: vi.fn().mockResolvedValue({ id: 'audit-9' }) };
  const prisma = {
    physician: { findFirst: vi.fn().mockResolvedValue(admin ? { id: adminId } : null) },
  };
  return { deps: { prisma, audit } as unknown as AnyDecommissionDeps, audit };
}

describe('CC-336 — registro do desligamento do ANY', () => {
  it('grava o passo na trilha com as contagens conferidas', async () => {
    const { deps, audit } = build();

    const result = await recordAnyDecommissionStep(deps, {
      step: 'dados_supabase_apagados',
      adminEmail: 'Admin@Copiloto.test',
      note: 'Usuários e pageviews apagados; projeto pausado',
      counts: { 'auth.users': 0, 'public.pageviews': 0 },
    });

    expect(result).toEqual({ auditId: 'audit-9' });
    expect(audit.log).toHaveBeenCalledWith({
      actorId: adminId,
      action: ANY_DECOMMISSION_AUDIT_ACTION,
      entity: 'AnyApp',
      entityId: 'dados_supabase_apagados',
      payload: {
        step: 'dados_supabase_apagados',
        note: 'Usuários e pageviews apagados; projeto pausado',
        counts: { 'auth.users': 0, 'public.pageviews': 0 },
      },
    });
  });

  it.each([
    ['dados apagados sem contagem', { step: 'dados_supabase_apagados' as const }],
    [
      'dados apagados com sobra',
      { step: 'dados_supabase_apagados' as const, counts: { 'auth.users': 3 } },
    ],
    ['nota com e-mail', { step: 'arquivo_envio_apagado' as const, note: 'enviado por x@y.com' }],
    ['etapa desconhecida', { step: 'apagar_tudo' as never }],
  ])('recusa: %s', async (_case, overrides) => {
    const { deps, audit } = build();
    await expect(
      recordAnyDecommissionStep(deps, {
        adminEmail: 'admin@copiloto.test',
        note: 'feito',
        ...overrides,
      }),
    ).rejects.toBeInstanceOf(AnyDecommissionRefusedError);
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('recusa sem conta ADMIN', async () => {
    const { deps } = build(false);
    await expect(
      recordAnyDecommissionStep(deps, {
        step: 'projeto_netlify_desligado',
        adminEmail: 'admin@copiloto.test',
        note: 'projeto apagado',
      }),
    ).rejects.toBeInstanceOf(AnyDecommissionRefusedError);
  });

  it('lê as contagens do SQL de verificação', () => {
    expect(parseCounts('auth.users=0, public.pageviews=0')).toEqual({
      'auth.users': 0,
      'public.pageviews': 0,
    });
    expect(parseCounts('auth.users=zero')).toBeNull();
    expect(parseCounts('')).toBeNull();
  });
});
