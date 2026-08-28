/**
 * OPS — Reset em massa do MFA de todos os médicos que estão com ele
 * habilitado agora (medida temporária, ver PR #124 / MfaService.resetAllMfa).
 *
 * Roda exatamente a mesma lógica usada por POST /auth/admin/users/mfa-reset-all
 * (mesma transação, mesmo efeito, mesma auditoria por médico afetado —
 * AUTH_MFA_ADMIN_BULK_RESET), só que instanciando os services diretamente
 * contra o Prisma em vez de passar pelo endpoint HTTP. Serve para disparar a
 * operação por script/ops sem precisar de uma sessão de admin autenticada.
 *
 * CryptoService não é usado por resetAllMfa (não decripta nenhum secret),
 * então passamos um stub — mesmo padrão usado em mfa.service.spec.ts.
 *
 * Uso:
 *   DATABASE_URL=... tsx scripts/ops-bulk-mfa-reset.ts
 */
import { PrismaClient } from '@prisma/client';
import { MfaService } from '../src/modules/auth/mfa.service';
import { AuditService } from '../src/modules/audit/audit.service';
import type { PrismaService } from '../src/config/prisma.service';
import type { CryptoService } from '../src/shared/crypto/crypto.service';

const ACTOR_ID = process.env.OPS_ACTOR_ID ?? 'ops:bulk-mfa-reset-script';

function unusedCrypto(): CryptoService {
  const stub = {
    encrypt: () => {
      throw new Error('resetAllMfa não usa CryptoService — encrypt não deveria ser chamado');
    },
    decrypt: () => {
      throw new Error('resetAllMfa não usa CryptoService — decrypt não deveria ser chamado');
    },
  };
  return stub as unknown as CryptoService;
}

async function main() {
  const prisma = new PrismaClient();
  const audit = new AuditService(prisma as unknown as PrismaService);
  const mfaService = new MfaService(prisma as unknown as PrismaService, unusedCrypto(), audit);

  try {
    const result = await mfaService.resetAllMfa(ACTOR_ID);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
