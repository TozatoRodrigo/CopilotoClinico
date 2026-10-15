/**
 * CC-207 / ADR-020 — cifra em lote o texto clínico gravado em claro (antes de
 * CLINICAL_TEXT_ENCRYPTION=on) e confere que nada ficou em claro.
 *
 * Uso:
 *   DATABASE_URL=... FIELD_ENCRYPTION_KEY=... pnpm crypto:encrypt-clinical-text --dry-run
 *   DATABASE_URL=... FIELD_ENCRYPTION_KEY=... pnpm crypto:encrypt-clinical-text --batch 500
 *   DATABASE_URL=... FIELD_ENCRYPTION_KEY=... pnpm crypto:encrypt-clinical-text --verify
 *   DATABASE_URL=... FIELD_ENCRYPTION_KEY=... pnpm crypto:encrypt-clinical-text --decrypt [--dry-run]
 *
 * Idempotente e retomável: só toca no que ainda não está cifrado com a chave
 * atual. Com FIELD_ENCRYPTION_KEY_PREVIOUS, também refaz com a chave atual o
 * que foi cifrado com a anterior (rotação). `--decrypt` é o caminho de volta,
 * só para voltar a API a uma versão anterior ao CC-207. Nunca imprime texto
 * clínico.
 *
 * Saída: 0 = ok; 2 = sobrou valor em claro, com chave desconhecida ou que não
 * abre (ver docs/runbook.md, "Texto clínico cifrado em repouso"); 1 = erro.
 */
import { PrismaClient } from '@prisma/client';
import { loadFieldKeyring, type FieldKeyring } from '../src/shared/crypto/field-cipher';
import {
  PrismaClinicalTextStore,
  decryptClinicalText,
  encryptClinicalText,
  verifyClinicalText,
  type ClinicalTextStore,
} from '../src/config/clinical-text/clinical-text-migration';

const DEFAULT_BATCH_SIZE = 500;

type Mode = 'encrypt' | 'verify' | 'decrypt';

interface CliOptions {
  mode: Mode;
  batchSize: number;
  dryRun: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { mode: 'encrypt', batchSize: DEFAULT_BATCH_SIZE, dryRun: false };
  const modes = new Set<Mode>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--') continue;
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--verify') modes.add('verify');
    else if (arg === '--decrypt') modes.add('decrypt');
    else if (arg === '--batch') {
      const value = Number(argv[++i]);
      if (!Number.isInteger(value) || value < 1 || value > 10_000) {
        throw new Error('--batch precisa ser um inteiro entre 1 e 10000');
      }
      options.batchSize = value;
    } else {
      throw new Error(`Argumento desconhecido: ${arg}`);
    }
  }
  if (modes.size > 1) throw new Error('Use --verify ou --decrypt, não os dois');
  options.mode = [...modes][0] ?? 'encrypt';
  if (options.mode === 'verify' && options.dryRun) {
    throw new Error('--verify já é só leitura; não combine com --dry-run');
  }
  return options;
}

function databaseHost(): string {
  try {
    const url = new URL(process.env.DATABASE_URL ?? '');
    return `${url.hostname}:${url.port || '5432'}${url.pathname}`;
  } catch {
    return '(DATABASE_URL inválida ou ausente)';
  }
}

async function runVerify(
  store: ClinicalTextStore,
  keyring: FieldKeyring,
  options: CliOptions,
): Promise<number> {
  const report = await verifyClinicalText(store, keyring, { batchSize: options.batchSize });
  console.table(
    report.columns.map((column) => ({
      coluna: `${column.table}.${column.column}`,
      total: column.total,
      emClaro: column.plaintext,
      chaveAtual: column.sealedCurrentKey,
      chaveAnterior: column.sealedPreviousKey,
      chaveDesconhecida: column.sealedUnknownKey,
      naoAbre: column.undecryptable,
    })),
  );
  console.log(JSON.stringify(report, null, 2));
  console.log(report.ok ? 'OK: nenhum texto clínico em claro.' : 'FALHA: ver colunas acima.');
  return report.ok ? 0 : 2;
}

async function runEncrypt(
  store: ClinicalTextStore,
  keyring: FieldKeyring,
  options: CliOptions,
): Promise<number> {
  const sealedLabel = options.dryRun ? 'seriamCifrados' : 'cifrados';
  const report = await encryptClinicalText(store, keyring, {
    batchSize: options.batchSize,
    dryRun: options.dryRun,
    onBatch: (column) =>
      console.log(
        `  ${column.table}.${column.column}: lidos=${column.pending} ${sealedLabel}=${column.sealed} ` +
          `concorrentes=${column.skippedConcurrent} falhas=${column.failed}`,
      ),
  });
  console.table(
    report.columns.map((column) => ({
      coluna: `${column.table}.${column.column}`,
      lidos: column.pending,
      [sealedLabel]: column.sealed,
      rotacionados: column.rotated,
      concorrentes: column.skippedConcurrent,
      falhas: column.failed,
    })),
  );
  console.log(JSON.stringify(report, null, 2));
  if (report.columns.some((column) => column.skippedConcurrent > 0)) {
    console.log('Linhas alteradas durante a rodada: rode de novo para cifrá-las.');
  }
  if (!options.dryRun) console.log('Confira com --verify.');
  return report.columns.some((column) => column.failed > 0) ? 2 : 0;
}

async function runDecrypt(
  store: ClinicalTextStore,
  keyring: FieldKeyring,
  options: CliOptions,
): Promise<number> {
  const restoredLabel = options.dryRun ? 'seriamDecifrados' : 'decifrados';
  const report = await decryptClinicalText(store, keyring, {
    batchSize: options.batchSize,
    dryRun: options.dryRun,
  });
  console.table(
    report.columns.map((column) => ({
      coluna: `${column.table}.${column.column}`,
      cifrados: column.found,
      [restoredLabel]: column.restored,
      concorrentes: column.skippedConcurrent,
      falhas: column.failed,
    })),
  );
  console.log(JSON.stringify(report, null, 2));
  return report.columns.some((column) => column.failed > 0) ? 2 : 0;
}

const MODE_LABEL: Record<Mode, string> = {
  encrypt: 'cifrando',
  verify: 'verificação (só leitura)',
  decrypt: 'DECIFRANDO (grava texto em claro)',
};

const REMINDER: Partial<Record<Mode, string>> = {
  encrypt:
    'Lembrete: rode com a API já em CLINICAL_TEXT_ENCRYPTION=on, senão ela segue gravando em claro.',
  decrypt:
    'Lembrete: só para voltar a API a uma versão anterior ao CC-207, com CLINICAL_TEXT_ENCRYPTION=off.',
};

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const keyring = loadFieldKeyring((name) => process.env[name]);

  const dryRun = options.dryRun ? ' — dry-run (só leitura)' : '';
  console.log(`Banco: ${databaseHost()} — ${MODE_LABEL[options.mode]}${dryRun}`);
  console.log(
    `Chave atual: ${keyring.current.id}` +
      (keyring.previous ? ` · chave anterior (rotação): ${keyring.previous.id}` : ''),
  );
  const reminder = REMINDER[options.mode];
  if (reminder) console.log(reminder);

  const prisma = new PrismaClient();
  try {
    const store = new PrismaClinicalTextStore(prisma);
    const run = { encrypt: runEncrypt, verify: runVerify, decrypt: runDecrypt }[options.mode];
    process.exitCode = await run(store, keyring, options);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  // Sem stack nem objeto do erro: só nome e mensagem (conexão, SQL, chave).
  console.error(err instanceof Error ? `${err.name}: ${err.message}` : 'Erro desconhecido');
  process.exit(1);
});
