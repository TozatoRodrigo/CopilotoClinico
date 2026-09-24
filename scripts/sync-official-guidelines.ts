/**
 * ADR-010 — Sincroniza a base oficial da Conitec (PCDT, DDT, Diretrizes
 * Brasileiras e Protocolos de Uso) com o banco.
 *
 * Os chunks entram como `official_unreviewed`: fonte oficial do MS, ainda não
 * revisada pela equipe clínica. Uma versão nova de um documento substitui a
 * anterior na mesma transação.
 *
 * Uso:
 *   pnpm sync:official-guidelines --dry-run            # baixa e recorta, não grava
 *   pnpm sync:official-guidelines                      # sincroniza tudo
 *   pnpm sync:official-guidelines --only asma          # filtra por documentKey
 *   pnpm sync:official-guidelines --kind pcdt --limit 5
 *   pnpm sync:official-guidelines --reclassify         # refaz a classificação
 *   pnpm sync:official-guidelines --json relatorio.json
 *
 * Código de saída 1 quando a listagem falha (nada gravado) ou algum documento
 * dá erro — para o agendamento alertar.
 */
import { writeFileSync } from 'fs';
import { parseArgs } from 'util';
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import type { OfficialGuidelineKind } from '@prisma/client';
import { PrismaModule } from '../src/config/prisma.module';
import { OfficialGuidelinesModule } from '../src/modules/guidelines/official/official-guidelines.module';
import {
  OfficialGuidelinesSyncService,
  countOutcomes,
  type SyncReport,
} from '../src/modules/guidelines/official/official-guidelines-sync.service';

const KINDS: readonly OfficialGuidelineKind[] = [
  'pcdt',
  'ddt',
  'diretriz_brasileira',
  'protocolo_uso',
];

const LOW_INCLUDED_SHARE = 0.05;

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env.local', '.env'] }),
    PrismaModule,
    OfficialGuidelinesModule,
  ],
})
class SyncOfficialGuidelinesModule {}

function parseKinds(values: string[] | undefined): OfficialGuidelineKind[] | undefined {
  if (!values?.length) return undefined;
  const invalid = values.filter((value) => !(KINDS as readonly string[]).includes(value));
  if (invalid.length > 0) {
    throw new Error(`--kind inválido: ${invalid.join(', ')} (use ${KINDS.join(', ')})`);
  }
  return values as OfficialGuidelineKind[];
}

function printReport(report: SyncReport): void {
  console.log(`\n=== Sincronização da base oficial${report.dryRun ? ' (dry-run)' : ''} ===`);
  console.log(
    'Listados: ' +
      Object.entries(report.listed)
        .map(([kind, count]) => `${kind}=${count}`)
        .join(' '),
  );

  for (const doc of report.documents.filter((d) => d.outcome !== 'unchanged')) {
    const extras = [
      doc.sectioning === 'fallback' ? 'SEM SEÇÕES (texto integral)' : null,
      // Recorte muito pequeno costuma ser estrutura mal reconhecida: revisar.
      doc.includedShare !== undefined && doc.includedShare < LOW_INCLUDED_SHARE
        ? `RECORTE BAIXO (${Math.round(doc.includedShare * 100)}% do PDF)`
        : null,
      doc.chunks !== undefined ? `${doc.chunks} chunks` : null,
      doc.classification
        ? `${doc.classification.careSetting}/${doc.classification.source}` +
          (doc.classification.cenarios.length ? ` [${doc.classification.cenarios.join(', ')}]` : '')
        : null,
      doc.detail ?? null,
    ].filter(Boolean);
    console.log(
      `${doc.outcome.padEnd(12)} ${doc.documentKey}${extras.length ? ' — ' + extras.join(' · ') : ''}`,
    );
  }

  if (report.missingFromListing.length > 0) {
    console.log(`\nAtivos no banco que sumiram da lista (nada foi removido):`);
    for (const key of report.missingFromListing) console.log(`  ${key}`);
  }

  console.log(
    '\nResumo: ' +
      Object.entries(countOutcomes(report.documents))
        .map(([outcome, count]) => `${outcome}=${count}`)
        .join(' '),
  );
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      'dry-run': { type: 'boolean', default: false },
      kind: { type: 'string', multiple: true },
      only: { type: 'string' },
      limit: { type: 'string' },
      reclassify: { type: 'boolean', default: false },
      json: { type: 'string' },
    },
  });

  const app = await NestFactory.createApplicationContext(SyncOfficialGuidelinesModule, {
    logger: ['log', 'error', 'warn'],
  });

  try {
    const report = await app.get(OfficialGuidelinesSyncService).sync({
      dryRun: values['dry-run'] ?? false,
      kinds: parseKinds(values.kind),
      only: values.only,
      limit: values.limit ? Number(values.limit) : undefined,
      reclassify: values.reclassify ?? false,
    });

    printReport(report);
    if (values.json) writeFileSync(values.json, JSON.stringify(report, null, 2));
    if (report.documents.some((doc) => doc.outcome === 'error')) process.exitCode = 1;
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
