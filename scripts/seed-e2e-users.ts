/**
 * F4 — Seed de usuários para E2E por perfil (Playwright).
 *
 * Cria, de forma idempotente:
 *   - ADMIN      admin@copiloto.test
 *   - COMPLIANCE compliance@copiloto.test (curador, CRM verificado)
 *   - PHYSICIAN  medico@copiloto.test (CRM NÃO verificado + solicitação PENDING)
 *
 * Todos com a senha `Copiloto@E2E123` (bcryptjs). Pensado para rodar contra o
 * banco de teste antes da suíte Playwright. Uso:
 *   DATABASE_URL=... ts-node --project tsconfig.json -r tsconfig-paths/register scripts/seed-e2e-users.ts
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const TEST_PASSWORD = 'Copiloto@E2E123';

async function main() {
  const prisma = new PrismaClient();
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);

  try {
    const admin = await prisma.physician.upsert({
      where: { email: 'admin@copiloto.test' },
      update: { role: 'ADMIN', passwordHash, crmVerified: true },
      create: {
        email: 'admin@copiloto.test',
        name: 'Admin E2E',
        crmUf: 'SP',
        crmNumber: '000001',
        passwordHash,
        role: 'ADMIN',
        crmVerified: true,
      },
      select: { id: true, email: true, role: true },
    });

    const compliance = await prisma.physician.upsert({
      where: { email: 'compliance@copiloto.test' },
      update: { role: 'COMPLIANCE', isCurator: true, passwordHash, crmVerified: true },
      create: {
        email: 'compliance@copiloto.test',
        name: 'Compliance E2E',
        crmUf: 'SP',
        crmNumber: '000002',
        passwordHash,
        role: 'COMPLIANCE',
        isCurator: true,
        crmVerified: true,
      },
      select: { id: true, email: true, role: true },
    });

    const physician = await prisma.physician.upsert({
      where: { email: 'medico@copiloto.test' },
      update: { passwordHash, crmVerified: false },
      create: {
        email: 'medico@copiloto.test',
        name: 'Médico E2E',
        crmUf: 'SP',
        crmNumber: '000003',
        passwordHash,
        role: 'PHYSICIAN',
        crmVerified: false,
      },
      select: { id: true, email: true, role: true },
    });

    // Pending CRM verification request for the compliance flow.
    const pending = await prisma.crmVerificationRequest.findFirst({
      where: { physicianId: physician.id, status: 'PENDING' },
      select: { id: true },
    });
    let requestId = pending?.id;
    if (!requestId) {
      const created = await prisma.crmVerificationRequest.create({
        data: { physicianId: physician.id },
        select: { id: true },
      });
      requestId = created.id;
    }

    // eslint-disable-next-line no-console
    console.log('[seed-e2e-users] ok', {
      admin: admin.id,
      compliance: compliance.id,
      physician: physician.id,
      pendingCrmRequest: requestId,
    });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[seed-e2e-users] failed', err);
  process.exit(1);
});
