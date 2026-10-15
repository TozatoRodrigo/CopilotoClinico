import { Logger } from '@nestjs/common';
import type { BetaInvite } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeFavoritesToken } from '../../shared/any-migration/any-favorites';
import type { AnyImportDeps, AnyImportOptions } from './any-users-import';
import {
  ANY_BATCH_LABEL,
  ANY_IMPORT_AUDIT_ACTION,
  ANY_SEND_FILE_COLUMNS,
  AnyImportRefusedError,
  importAnyUsers,
  renderSendFile,
} from './any-users-import';

const now = new Date('2026-10-15T12:00:00.000Z');
const adminId = '99999999-9999-4999-8999-999999999999';
const SHA = 'a'.repeat(64);

const CSV = [
  'email,provedor,cadastro,ultimo_acesso',
  'ana@example.com,google,2026-03-01 10:00:00+00,2026-10-01 08:00:00+00',
  'Beto@Example.com,azure,2026-03-02 10:00:00+00,2026-01-01 08:00:00+00',
  'ANA@example.com,azure,2026-03-03 10:00:00+00,',
  'carla@example.com,google,2026-04-01 10:00:00+00,',
].join('\n');

const CODES = ['K3MQ9XPT', 'H7RW2ZNC', 'TP4Y8MQX'];

function inviteRow(index: number, data: { expiresAt: Date; createdById: string }): BetaInvite {
  return {
    id: `0000000${index}-0000-4000-8000-000000000000`,
    code: CODES[index] ?? 'ZZZZZZZZ',
    batchLabel: ANY_BATCH_LABEL,
    maxUses: 1,
    usesCount: 0,
    expiresAt: data.expiresAt,
    revokedAt: null,
    createdById: data.createdById,
    waitlistEntryId: null,
    createdAt: now,
  };
}

function build(
  options: {
    existing?: string[];
    previous?: { fileSha256: string }[];
    admin?: boolean;
    auditFails?: boolean;
  } = {},
) {
  const existing = options.existing ?? [];
  const queryRaw = vi.fn(async (_sql: TemplateStringsArray, emails: string[]) =>
    existing.filter((email) => emails.includes(email)).map((email) => ({ email })),
  );
  const prisma = {
    $queryRaw: queryRaw,
    physician: {
      findFirst: vi.fn().mockResolvedValue(options.admin === false ? null : { id: adminId }),
    },
    auditLog: {
      findMany: vi.fn().mockResolvedValue((options.previous ?? []).map((payload) => ({ payload }))),
    },
  };
  const invites = {
    insertInvites: vi.fn(async (data: { expiresAt: Date; createdById: string }, quantity: number) =>
      Array.from({ length: quantity }, (_, i) => inviteRow(i, data)),
    ),
  };
  const audit = {
    log: options.auditFails
      ? vi.fn().mockRejectedValue(new Error('trilha fora do ar'))
      : vi.fn().mockResolvedValue({ id: 'audit-1' }),
  };
  const deps = { prisma, invites, audit } as unknown as AnyImportDeps;
  return { deps, prisma, invites, audit };
}

function opts(overrides: Partial<AnyImportOptions> = {}): AnyImportOptions {
  return {
    legalBasis: 'Legítimo interesse (art. 7º, IX) — cessão do ANY ao Copiloto (CC-301)',
    changeDate: '2026-11-01',
    site: 'https://copiloto.exemplo.test',
    adminEmail: 'admin@copiloto.test',
    fileSha256: SHA,
    ...overrides,
  };
}

describe('CC-335 — importAnyUsers', () => {
  let logged: string[];

  beforeEach(() => {
    logged = [];
    const capture = (message: unknown) => {
      logged.push(String(message));
    };
    vi.spyOn(Logger.prototype, 'log').mockImplementation(capture);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(capture);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('dry-run: relatório completo e nada gravado', async () => {
    const { deps, invites, audit } = build({ existing: ['beto@example.com'] });

    const { report, deliveries } = await importAnyUsers(deps, CSV, opts({ dryRun: true }), now);

    expect(report).toMatchObject({
      dryRun: true,
      rows: 4,
      invalid: [],
      duplicatesInFile: 1,
      existingAccounts: 1,
      invites: 2,
      activeUsers: 1,
      providers: { google: 2, microsoft: 1, desconhecido: 0 },
      blocked: null,
      batchLabel: 'base ANY',
      changeDate: '2026-11-01',
      importId: null,
    });
    expect(deliveries).toEqual([]);
    expect(invites.insertInvites).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('quem já tem conta (sem diferenciar maiúsculas) só recebe aviso, sem convite nem vínculo', async () => {
    const { deps, invites } = build({ existing: ['beto@example.com'] });

    const { deliveries } = await importAnyUsers(deps, CSV, opts(), now);

    expect(invites.insertInvites).toHaveBeenCalledWith(expect.anything(), 2);
    const beto = deliveries.find(({ email }) => email === 'beto@example.com');
    expect(beto).toEqual({
      email: 'beto@example.com',
      kind: 'aviso',
      provider: 'microsoft',
      link: 'https://copiloto.exemplo.test/ferramentas',
      inviteCode: null,
      changeDate: '2026-11-01',
      inviteValidUntil: null,
    });
  });

  it('cria o lote "base ANY": um convite de uso único por pessoa nova', async () => {
    const { deps, invites } = build();

    const { report, deliveries } = await importAnyUsers(deps, CSV, opts(), now);

    expect(invites.insertInvites).toHaveBeenCalledTimes(1);
    expect(invites.insertInvites).toHaveBeenCalledWith(
      {
        batchLabel: 'base ANY',
        maxUses: 1,
        expiresAt: new Date('2027-01-13T12:00:00.000Z'),
        createdById: adminId,
      },
      3,
    );
    expect(report.invites).toBe(3);
    expect(deliveries.map(({ kind, link, inviteCode }) => ({ kind, link, inviteCode }))).toEqual([
      {
        kind: 'convite',
        link: 'https://copiloto.exemplo.test/register?convite=K3MQ-9XPT',
        inviteCode: 'K3MQ-9XPT',
      },
      {
        kind: 'convite',
        link: 'https://copiloto.exemplo.test/register?convite=H7RW-2ZNC',
        inviteCode: 'H7RW-2ZNC',
      },
      {
        kind: 'convite',
        link: 'https://copiloto.exemplo.test/register?convite=TP4Y-8MQX',
        inviteCode: 'TP4Y-8MQX',
      },
    ]);
    expect(deliveries.every(({ inviteValidUntil }) => inviteValidUntil === '2027-01-13')).toBe(
      true,
    );
  });

  it('registra a base legal na trilha antes de criar qualquer convite', async () => {
    const { deps, invites, audit } = build({ existing: ['beto@example.com'] });

    const { report } = await importAnyUsers(deps, CSV, opts(), now);

    const [first, second] = audit.log.mock.calls.map(([entry]) => entry);
    expect(first).toMatchObject({
      actorId: adminId,
      action: ANY_IMPORT_AUDIT_ACTION,
      entity: 'AnyImport',
      entityId: report.importId,
      payload: {
        legalBasis: 'Legítimo interesse (art. 7º, IX) — cessão do ANY ao Copiloto (CC-301)',
        fileSha256: SHA,
        batchLabel: 'base ANY',
        changeDate: '2026-11-01',
        validDays: 90,
        invites: 2,
        existingAccounts: 1,
      },
    });
    expect(second).toMatchObject({
      action: 'BETA_INVITES_CREATED',
      payload: { batchLabel: 'base ANY', quantity: 2, maxUses: 1, importId: report.importId },
    });
    expect(audit.log.mock.invocationCallOrder[0]).toBeLessThan(
      invites.insertInvites.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('sem registro da base legal, nenhum convite é criado', async () => {
    const { deps, invites } = build({ auditFails: true });

    await expect(importAnyUsers(deps, CSV, opts(), now)).rejects.toThrow('trilha fora do ar');
    expect(invites.insertInvites).not.toHaveBeenCalled();
  });

  it('nenhum e-mail na trilha nem no log', async () => {
    const { deps, audit } = build({ existing: ['beto@example.com'] });

    await importAnyUsers(deps, CSV, opts(), now);

    expect(JSON.stringify(audit.log.mock.calls)).not.toContain('@');
    expect(logged.length).toBeGreaterThan(0);
    expect(logged.join('\n')).not.toContain('@');
  });

  it('linha inválida bloqueia a gravação e aparece só pelo número', async () => {
    const { deps, invites, audit } = build();
    const csv = `${CSV}\nquebrado,google,2026-03-01,`;

    const { report, deliveries } = await importAnyUsers(deps, csv, opts(), now);

    expect(report.blocked).toBe('linhas_invalidas');
    expect(report.invalid).toEqual([{ line: 6, reason: 'email_invalido' }]);
    expect(deliveries).toEqual([]);
    expect(invites.insertInvites).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('o mesmo export não entra duas vezes', async () => {
    const { deps, invites } = build({ previous: [{ fileSha256: SHA }] });

    const { report } = await importAnyUsers(deps, CSV, opts({ complementary: true }), now);

    expect(report.blocked).toBe('mesmo_arquivo_ja_importado');
    expect(invites.insertInvites).not.toHaveBeenCalled();
  });

  it('depois de um import, outro só com --complementar', async () => {
    const previous = [{ fileSha256: 'b'.repeat(64) }];

    const blocked = await importAnyUsers(build({ previous }).deps, CSV, opts(), now);
    expect(blocked.report).toMatchObject({
      blocked: 'import_anterior_sem_complementar',
      previousImports: 1,
    });

    const { deps, invites } = build({ previous });
    const complementary = await importAnyUsers(deps, CSV, opts({ complementary: true }), now);
    expect(complementary.report.blocked).toBeNull();
    expect(invites.insertInvites).toHaveBeenCalled();
  });

  it('leva os favoritos no link, num parâmetro opaco', async () => {
    const { deps } = build({ existing: ['beto@example.com'] });
    const csv = [
      'email,provedor,cadastro,ultimo_acesso,favoritos',
      'ana@example.com,google,2026-03-01,,gcs|fórmula-winters',
      'beto@example.com,google,2026-03-01,,acls',
      'carla@example.com,google,2026-03-01,,',
    ].join('\n');

    const { deliveries, report } = await importAnyUsers(deps, csv, opts(), now);

    const token = (link: string) => new URL(link).searchParams.get('favoritos');
    const [ana, carla, beto] = deliveries;
    expect(decodeFavoritesToken(token(ana?.link ?? ''))).toEqual([
      'calc:gcs',
      'calc:formula-winters',
    ]);
    expect(new URL(ana?.link ?? '').searchParams.get('convite')).toBe('K3MQ-9XPT');
    expect(token(carla?.link ?? '')).toBeNull();
    expect(decodeFavoritesToken(token(beto?.link ?? ''))).toEqual(['tool:acls']);
    expect(report.favorites).toEqual({ column: true, usersWithFavorites: 2, unknownIds: 0 });
  });

  describe('recusa antes de gravar', () => {
    it.each([
      ['base legal com e-mail', { legalBasis: 'Consentimento pedido por dpo@empresa.com' }],
      ['base legal curta', { legalBasis: 'LGPD' }],
      ['data inexistente', { changeDate: '2026-02-30' }],
      ['data fora do formato', { changeDate: '01/11/2026' }],
      ['site com caminho', { site: 'https://copiloto.exemplo.test/app' }],
      ['site sem https', { site: 'http://copiloto.exemplo.test' }],
      ['validade acima do teto do beta', { validDays: 181 }],
      ['convite vencendo antes da mudança', { validDays: 10, changeDate: '2026-11-01' }],
    ])('%s', async (_case, overrides) => {
      const { deps, invites } = build();
      await expect(importAnyUsers(deps, CSV, opts(overrides), now)).rejects.toBeInstanceOf(
        AnyImportRefusedError,
      );
      expect(invites.insertInvites).not.toHaveBeenCalled();
    });

    it('data de mudança no passado', async () => {
      const { deps } = build();
      await expect(
        importAnyUsers(deps, CSV, opts({ changeDate: '2026-10-14' }), now),
      ).rejects.toMatchObject({ reason: 'data_de_mudanca_no_passado' });
    });

    it('--admin sem conta ADMIN', async () => {
      const { deps } = build({ admin: false });
      await expect(importAnyUsers(deps, CSV, opts(), now)).rejects.toMatchObject({
        reason: 'admin_nao_encontrado',
      });
    });
  });

  it('o arquivo de envio tem uma linha por pessoa, com a data de mudança', async () => {
    const { deps } = build({ existing: ['beto@example.com'] });
    const { deliveries } = await importAnyUsers(deps, CSV, opts(), now);

    const lines = renderSendFile(deliveries).trimEnd().split('\n');

    expect(lines[0]).toBe(ANY_SEND_FILE_COLUMNS.join(','));
    expect(lines.slice(1)).toEqual([
      'ana@example.com,convite,google,https://copiloto.exemplo.test/register?convite=K3MQ-9XPT,K3MQ-9XPT,2026-11-01,01/11/2026,2027-01-13',
      'carla@example.com,convite,google,https://copiloto.exemplo.test/register?convite=H7RW-2ZNC,H7RW-2ZNC,2026-11-01,01/11/2026,2027-01-13',
      'beto@example.com,aviso,microsoft,https://copiloto.exemplo.test/ferramentas,,2026-11-01,01/11/2026,',
    ]);
  });
});
