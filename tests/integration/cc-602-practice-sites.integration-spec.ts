/**
 * Testes de integração — CC-602: locais de plantão do médico.
 *
 * Requisito: banco PostgreSQL acessível via DATABASE_URL com a migration
 * 20261014120000_cc_602_practice_sites aplicada e a role `copiloto_app` da
 * AUD-002.
 *
 * Cobre o que os testes unitários (com Prisma simulado) não alcançam: os
 * GRANTs reais para a role de runtime, o índice único parcial que segura um
 * padrão por médico, a troca de padrão na transação do serviço e o CASCADE
 * ao apagar o médico.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { connectTestDb, disconnectTestDb, clearAuditLog } from './helpers/db';
import { PracticeSitesService } from '../../src/modules/practice-sites/practice-sites.service';
import { AuditService } from '../../src/modules/audit/audit.service';
import type { PrismaService } from '../../src/config/prisma.service';
import type { PracticeSiteInput } from '../../src/shared/contracts/practice-site';

const RUNTIME_ROLE = 'copiloto_app';
const EMAIL_DOMAIN = '@cc602.test';

const upa: PracticeSiteInput = {
  name: 'UPA Centro',
  facilityType: 'upa_porte_1',
  hasCT: false,
  hasLab: true,
  hasICU: false,
  isSus: true,
  specialists: ['pediatria'],
  referenceTravelMinutes: 90,
  referenceDistanceKm: 70,
  isDefault: false,
};

describe('CC-602 — locais de plantão (integration)', () => {
  let prisma: PrismaClient;
  let service: PracticeSitesService;
  let physicianId: string;

  beforeAll(async () => {
    prisma = await connectTestDb();
    service = new PracticeSitesService(
      prisma as unknown as PrismaService,
      new AuditService(prisma as unknown as PrismaService),
    );
  });

  afterAll(async () => {
    await prisma.physician.deleteMany({ where: { email: { endsWith: EMAIL_DOMAIN } } });
    await clearAuditLog(prisma);
    await disconnectTestDb();
  });

  beforeEach(async () => {
    await prisma.physician.deleteMany({ where: { email: { endsWith: EMAIL_DOMAIN } } });
    await clearAuditLog(prisma);
    const physician = await prisma.physician.create({
      data: {
        email: `medico-${Date.now()}${EMAIL_DOMAIN}`,
        passwordHash: 'x',
        crmUf: 'SP',
        crmNumber: '000602',
      },
    });
    physicianId = physician.id;
  });

  it('practice_sites: DML liberado para a role de runtime, TRUNCATE negado', async () => {
    const rows = await prisma.$queryRawUnsafe<Array<{ privilege: string; granted: boolean }>>(
      `SELECT p AS privilege, has_table_privilege($1, 'practice_sites', p) AS granted
         FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']) AS p`,
      RUNTIME_ROLE,
    );

    expect(Object.fromEntries(rows.map((row) => [row.privilege, row.granted]))).toEqual({
      SELECT: true,
      INSERT: true,
      UPDATE: true,
      DELETE: true,
      TRUNCATE: false,
    });
  });

  it('o índice parcial recusa um segundo padrão para o mesmo médico', async () => {
    await prisma.practiceSite.create({ data: { ...upa, physicianId, isDefault: true } });

    await expect(
      prisma.practiceSite.create({
        data: { ...upa, name: 'UPA Norte', physicianId, isDefault: true },
      }),
    ).rejects.toThrow();
    // Locais não padrão não colidem.
    await prisma.practiceSite.create({ data: { ...upa, name: 'UPA Sul', physicianId } });
    await prisma.practiceSite.create({ data: { ...upa, name: 'UPA Leste', physicianId } });
  });

  it('o serviço move o padrão sem violar o índice e promove outro ao apagar o padrão', async () => {
    const first = await service.create(physicianId, upa);
    const second = await service.create(physicianId, {
      ...upa,
      name: 'UPA Norte',
      isDefault: true,
    });

    let sites = await service.list(physicianId);
    expect(sites.map((site) => [site.name, site.isDefault])).toEqual([
      ['UPA Norte', true],
      ['UPA Centro', false],
    ]);

    await service.remove(physicianId, second.id);
    sites = await service.list(physicianId);
    expect(sites).toEqual([expect.objectContaining({ id: first.id, isDefault: true })]);
  });

  it('apagar o médico apaga os locais dele (CASCADE)', async () => {
    await service.create(physicianId, upa);

    await prisma.physician.delete({ where: { id: physicianId } });

    expect(await prisma.practiceSite.count({ where: { physicianId } })).toBe(0);
  });
});
