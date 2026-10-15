/**
 * CC-405 — importa o conteúdo clínico das ferramentas do ANY como cartões
 * revisados "em revisão", com o revisor indicado (o Dr. Gustavo Moreira).
 *
 * Sem IA: cada dose ou protocolo do motor das Ferramentas
 * (src/shared/clinical-tools) vira cartão por mapeamento determinístico, com
 * a referência e a procedência do ANY como fonte, e passa pela mesma checagem
 * de citação de todo cartão. Os achados da revisão clínica (CC-310) vão junto,
 * para o revisor ver antes de assinar. Reimportar não duplica.
 *
 * Uso: ver IMPORT_CLI_USAGE (pnpm cards:import-any --help).
 *
 * Código de saída 1 quando algum item não passa na checagem — o lote não
 * esconde o que ficou de fora.
 */
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../src/config/prisma.module';
import { AuditModule } from '../../src/modules/audit/audit.module';
import { KnowledgeCardsModule } from '../../src/modules/knowledge-cards/knowledge-cards.module';
import { AnyCardImportService } from '../../src/modules/knowledge-cards/any-import/any-card-import.service';
import {
  prepareAnyCards,
  type AnyCardRejection,
  type PreparedAnyImport,
} from '../../src/modules/knowledge-cards/any-import/any-card-import';
import {
  IMPORT_CLI_USAGE,
  parseImportCli,
} from '../../src/modules/knowledge-cards/any-import/import-cli';
import { loadReviewFindings } from '../../src/modules/knowledge-cards/any-import/review-findings';
import type { AnyCardToolId } from '../../src/shared/contracts/knowledge-cards';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env.local', '.env'] }),
    PrismaModule,
    AuditModule,
    KnowledgeCardsModule,
  ],
})
class CardImportCliModule {}

function printRejections(rejections: readonly AnyCardRejection[]): void {
  for (const rejection of rejections) {
    console.log(`  ✗ ${rejection.itemId}`);
    for (const issue of rejection.issues) {
      console.log(`      - ${issue.path || '(cartão)'}: ${issue.message}`);
    }
  }
}

function printDryRun(prepared: PreparedAnyImport, print: boolean): void {
  const byTool = new Map<AnyCardToolId, { cards: number; doses: number; flags: number }>();
  for (const card of prepared.cards) {
    const stats = byTool.get(card.draft.toolId) ?? { cards: 0, doses: 0, flags: 0 };
    stats.cards += 1;
    stats.doses += card.content.claims.filter((claim) => claim.dose).length;
    stats.flags += card.reviewFlags.length;
    byTool.set(card.draft.toolId, stats);
  }
  console.log(
    `ANY ${prepared.anyCommits.join(', ') || '(commit não informado)'} — simulação, nada gravado`,
  );
  for (const [toolId, stats] of byTool) {
    console.log(
      `  ${toolId}: ${stats.cards} cartão(ões), ${stats.doses} dose(s) estruturada(s), ${stats.flags} achado(s) para o revisor`,
    );
  }
  console.log(
    `  total: ${prepared.cards.length} cartão(ões), ${prepared.rejections.length} recusado(s)`,
  );
  printRejections(prepared.rejections);
  if (!print) return;
  for (const card of prepared.cards) {
    console.log(`\n${card.sourceKey} — ${card.content.question}`);
    console.log(`  resposta: ${card.content.answer}`);
    for (const claim of card.content.claims) {
      if (!claim.dose) continue;
      const { drug, amount, route, frequency, maxDose } = claim.dose;
      console.log(
        `  dose: ${[`${drug} ${amount}`, route, frequency, maxDose ? `máx. ${maxDose}` : null].filter(Boolean).join(' · ')}`,
      );
    }
    for (const flag of card.reviewFlags) console.log(`  achado: ${flag.ref} — ${flag.title}`);
  }
}

async function main(): Promise<number> {
  const cli = parseImportCli(process.argv.slice(2));
  if (cli.kind === 'help') {
    console.log(IMPORT_CLI_USAGE);
    return 0;
  }
  if (cli.kind === 'error') {
    console.error(`${cli.message}\n\n${IMPORT_CLI_USAGE}`);
    return 1;
  }

  const findings = loadReviewFindings(process.cwd());
  if (cli.dryRun) {
    const prepared = prepareAnyCards(cli.toolId, findings);
    printDryRun(prepared, cli.print);
    return prepared.rejections.length > 0 ? 1 : 0;
  }

  const app = await NestFactory.createApplicationContext(CardImportCliModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const importer = app.get(AnyCardImportService);
    const reviewer = await importer.findReviewer(cli.reviewerCrm);
    console.log(
      `Revisor indicado: ${reviewer.name ?? '(sem nome)'}, CRM ${reviewer.crmNumber}/${reviewer.crmUf}` +
        (reviewer.crmVerified
          ? ''
          : ' — CRM ainda não verificado: o lote só pode ser assinado depois'),
    );
    const result = await importer.import({
      toolId: cli.toolId,
      reviewerId: reviewer.id,
      findings,
      requestedBy: null,
    });
    console.log(
      `Importação ${result.importId} (ANY ${result.anyCommits.join(', ')}): ` +
        `${result.created.length} criado(s), ${result.updated.length} com versão nova, ` +
        `${result.unchanged.length} sem mudança, ${result.skipped.length} arquivado(s) mantido(s), ` +
        `${result.rejections.length} recusado(s)`,
    );
    printRejections(result.rejections);
    return result.rejections.length > 0 ? 1 : 0;
  } finally {
    await app.close();
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
