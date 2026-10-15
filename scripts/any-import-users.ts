/**
 * CC-335 — Convida os usuários do ANY para o Copiloto: um convite de uso
 * único por pessoa no lote "base ANY" do beta (CC-702) e o arquivo de envio
 * (e-mail + link + data de mudança). Quem já tem conta recebe só o aviso.
 * Passo a passo, formato do export e cuidados: docs/any/migracao-e-desligamento.md.
 *
 * Uso:
 *   pnpm any:import-users --file export.csv --base-legal "<texto>" \
 *     --data-mudanca 2027-02-15 --admin <e-mail de um ADMIN> [--dry-run]
 *
 * Opcionais: --site <origem do web> (padrão: WEB_PUBLIC_URL),
 * --validade-dias <1–180> (padrão 90), --saida <arquivo de envio> (padrão: ao
 * lado do export), --complementar (já houve um import antes).
 *
 * Sai com 0 quando gravou (ou o dry-run passou), 2 quando o import foi
 * bloqueado (linha inválida, arquivo repetido) e 1 em erro. Nada aqui imprime
 * e-mail: só contagens e números de linha. O arquivo de envio é criado com
 * permissão 600 e precisa ser APAGADO depois do envio.
 */
import { createHash } from 'crypto';
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { parseArgs } from 'util';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../src/config/prisma.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { BetaInviteService } from '../src/modules/beta/beta-invite.service';
import {
  AnyImportRefusedError,
  importAnyUsers,
  renderSendFile,
} from '../src/modules/any-migration/any-users-import';
import { AnyExportFormatError } from '../src/modules/any-migration/any-users-export';

function databaseHost(): string {
  try {
    const url = new URL(process.env.DATABASE_URL ?? '');
    return `${url.hostname}:${url.port || '5432'}${url.pathname}`;
  } catch {
    return '(DATABASE_URL inválida ou ausente)';
  }
}

function defaultSendFile(exportPath: string, now: Date): string {
  const stamp = now.toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
  return join(dirname(exportPath), `any-envio-${stamp}.csv`);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      file: { type: 'string' },
      'base-legal': { type: 'string' },
      'data-mudanca': { type: 'string' },
      admin: { type: 'string' },
      site: { type: 'string' },
      'validade-dias': { type: 'string' },
      saida: { type: 'string' },
      complementar: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
    },
  });
  if (!values.file) throw new Error('Informe --file <export.csv>');

  const exportPath = resolve(values.file);
  const raw = readFileSync(exportPath);
  const dryRun = values['dry-run'] ?? false;
  const now = new Date();

  console.log(`Banco: ${databaseHost()} — ${dryRun ? 'dry-run (nada é gravado)' : 'GRAVANDO'}`);

  const prisma = new PrismaClient();
  try {
    const db = prisma as unknown as PrismaService;
    const audit = new AuditService(db);
    const { report, deliveries } = await importAnyUsers(
      {
        prisma,
        audit,
        invites: new BetaInviteService(db, new ConfigService(), audit),
      },
      raw.toString('utf8'),
      {
        legalBasis: values['base-legal'] ?? '',
        changeDate: values['data-mudanca'] ?? '',
        site: values.site ?? process.env.WEB_PUBLIC_URL ?? '',
        adminEmail: values.admin ?? '',
        validDays: values['validade-dias'] ? Number(values['validade-dias']) : undefined,
        fileSha256: createHash('sha256').update(raw).digest('hex'),
        dryRun,
        complementary: values.complementar ?? false,
      },
      now,
    );
    console.log(JSON.stringify(report, null, 2));

    if (report.blocked) {
      console.error(`Bloqueado: ${report.blocked}. Ver docs/any/migracao-e-desligamento.md.`);
      process.exitCode = 2;
      return;
    }
    if (deliveries.length === 0) return;

    const sendPath = resolve(values.saida ?? defaultSendFile(exportPath, now));
    // `wx`: nunca sobrescreve um envio anterior; 600: só o dono lê.
    writeFileSync(sendPath, renderSendFile(deliveries), { flag: 'wx', mode: 0o600 });
    console.log(`Arquivo de envio: ${sendPath} (${deliveries.length} linhas).`);
    console.log(
      'Depois do envio: apague o arquivo e o export, e registre com ' +
        '`pnpm any:decommission-log --etapa arquivo_envio_apagado`.',
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  if (err instanceof AnyImportRefusedError || err instanceof AnyExportFormatError) {
    console.error(err.message);
  } else {
    console.error(err);
  }
  process.exit(1);
});
