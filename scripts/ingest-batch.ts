/**
 * KB-002 — Ingestão em lote de diretrizes com aprovação de curador.
 *
 * Lê um diretório de arquivos `.md`/`.txt` (front-matter com source, version,
 * specialty e evidenceLevel opcional + corpo do texto), gera embeddings e
 * grava os chunks como `pending_review`. Nada entra em produção (retrieval)
 * sem aprovação via `POST /v1/guidelines/chunks/:id/approve`.
 *
 * Uso:
 *   pnpm ingest:guidelines <diretório>
 */
import { readdirSync, readFileSync } from 'fs';
import { extname, join } from 'path';
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../src/config/prisma.module';
import { GuidelinesModule } from '../src/modules/guidelines/guidelines.module';
import { GuidelinesService, type BatchIngestResult } from '../src/modules/guidelines/guidelines.service';
import { parseGuidelineDocument } from '../src/modules/guidelines/ingestion/front-matter';

const SUPPORTED_EXTENSIONS = new Set(['.md', '.txt']);

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env.local', '.env'] }),
    PrismaModule,
    GuidelinesModule,
  ],
})
class IngestBatchModule {}

function listGuidelineFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((file) => SUPPORTED_EXTENSIONS.has(extname(file).toLowerCase()))
    .sort()
    .map((file) => join(dir, file));
}

async function main(): Promise<void> {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Uso: pnpm ingest:guidelines <diretório>');
    process.exitCode = 1;
    return;
  }

  const files = listGuidelineFiles(dir);
  if (files.length === 0) {
    console.log(`Nenhum arquivo .md/.txt encontrado em ${dir}`);
    return;
  }

  const app = await NestFactory.createApplicationContext(IngestBatchModule, {
    logger: ['error', 'warn'],
  });

  try {
    const guidelinesService = app.get(GuidelinesService);
    const results: Array<BatchIngestResult & { file: string }> = [];
    const errors: Array<{ file: string; error: string }> = [];

    for (const filePath of files) {
      try {
        const raw = readFileSync(filePath, 'utf-8');
        const { meta, body } = parseGuidelineDocument(raw);

        const result = await guidelinesService.ingestForReview({
          text: body,
          source: meta.source,
          sourceVersion: meta.sourceVersion,
          specialty: meta.specialty,
          evidenceLevel: meta.evidenceLevel,
          institutionId: meta.institutionId,
        });

        results.push({ ...result, file: filePath });
      } catch (err) {
        errors.push({ file: filePath, error: err instanceof Error ? err.message : String(err) });
      }
    }

    console.log('\n=== Relatório de ingestão em lote (KB-002) ===');
    for (const result of results) {
      console.log(
        `${result.file}: ${result.chunksCreated} chunk(s) criado(s) como pending_review` +
          ` — fonte "${result.source}" v${result.sourceVersion}` +
          (result.superseded > 0 ? ` (${result.superseded} chunk(s) anterior(es) marcado(s) como superseded)` : ''),
      );
    }

    for (const error of errors) {
      console.error(`${error.file}: ERRO — ${error.error}`);
    }

    const totalChunks = results.reduce((sum, r) => sum + r.chunksCreated, 0);
    console.log(
      `\n${results.length}/${files.length} arquivo(s) processado(s) com sucesso, ${totalChunks} chunk(s) pendente(s) de revisão.`,
    );

    if (errors.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
