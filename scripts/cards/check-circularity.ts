/**
 * CC-412 — confere que nenhum caso do gabarito (`evals/clinical/cases` e
 * `cases-blind`) tem a mesma origem de rascunho de um cartão no banco: mesmo
 * id de rascunho ou mesmo hash dos trechos de fonte entregues ao modelo.
 *
 * Só leitura. Código de saída 1 quando há caso circular — para o CI e para o
 * passo de release que roda o gabarito com cartões (CC-408).
 *
 * Uso:
 *   pnpm cards:check-circularity
 */
import { PrismaClient } from '@prisma/client';
import { describeCircularOrigin } from '../../src/modules/knowledge-cards/domain/draft-provenance';
import { findCardCircularity, loadGoldCaseOrigins } from '../../evals/clinical/card-circularity';

async function main(): Promise<number> {
  const goldOrigins = loadGoldCaseOrigins();
  console.log(`Gabarito: ${goldOrigins.length} caso(s) com rascunho de origem registrado.`);

  const prisma = new PrismaClient();
  try {
    const circular = await findCardCircularity(prisma, goldOrigins);
    if (circular.length === 0) {
      console.log('Nenhum caso do gabarito tem a origem de um cartão.');
      return 0;
    }
    console.error(`${circular.length} caso(s) circular(es) (CC-412):`);
    for (const item of circular) console.error(`  - ${describeCircularOrigin(item)}`);
    return 1;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
