/**
 * Testes de integração — CC-207: texto clínico cifrado em repouso.
 *
 * Requisito: PostgreSQL via DATABASE_URL com as migrations aplicadas (inclusive
 * 20261015180000_cc207_chief_complaint_text) e a role `copiloto_app` da AUD-002.
 *
 * Cobre o que os testes unitários não alcançam: a extensão do Prisma contra o
 * banco de verdade (jsonb, include/select aninhados, transações), o "dump sem
 * a chave", o SQL da migração em lote com a role de runtime, e o selo do
 * documento e a trilha de auditoria calculados sobre o texto em claro.
 *
 * A migração em lote roda sobre o banco inteiro (é o que ela faz em produção):
 * as outras specs criam os próprios dados a cada teste, então cifrar sobras
 * delas não muda nenhum resultado.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createHash } from 'crypto';
import type { ConfigService } from '@nestjs/config';
import type { PrismaClient } from '@prisma/client';
import { connectTestDb, disconnectTestDb, clearAuditLog } from './helpers/db';
import { PrismaService } from '../../src/config/prisma.service';
import { SEALED_COLUMNS } from '../../src/config/clinical-text/clinical-text-fields';
import { ClinicalTextQueryError } from '../../src/config/clinical-text/clinical-text.extension';
import {
  PrismaClinicalTextStore,
  decryptClinicalText,
  encryptClinicalText,
  verifyClinicalText,
} from '../../src/config/clinical-text/clinical-text-migration';
import { SEALED_PREFIX, loadFieldKeyring, sealedKeyId } from '../../src/shared/crypto/field-cipher';
import { AuditService } from '../../src/modules/audit/audit.service';
import { DocumentsService } from '../../src/modules/documents/documents.service';
import type { StorageService } from '../../src/modules/storage/storage.service';
import type { InstitutionsService } from '../../src/modules/institutions/institutions.service';

const KEY = 'e'.repeat(64);
const OLD_KEY = 'f'.repeat(64);
const EMAIL_DOMAIN = '@cc207.test';
/** Aparece em todo texto clínico gravado: num dump cifrado, não pode aparecer. */
const MARKER = 'MARCADORCLINICO';
const RUNTIME_ROLE = 'copiloto_app';

function fakeConfig(values: Record<string, string>): ConfigService {
  return { get: (name: string) => values[name] } as unknown as ConfigService;
}

function clientWith(values: Record<string, string>): PrismaService {
  return new PrismaService(fakeConfig(values));
}

const keyring = loadFieldKeyring((name) => (name === 'FIELD_ENCRYPTION_KEY' ? KEY : undefined));

/** Mesmo hash de documents.service.ts (chaves de topo ordenadas). */
function canonicalHashOf(content: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(content, Object.keys(content as object).sort()))
    .digest('hex');
}

const COPILOT_OUTPUT = {
  reasoning: `${MARKER} Dor torácica típica há 2h, supra de ST em parede inferior.`,
  recommendations: [
    {
      action: `${MARKER} AAS 300 mg mastigado`,
      rationale: 'IAM com supra',
      citationChunkId: 'chunk-1',
      confidence: 0.85,
    },
  ],
  uncertainty: true,
  uncertaintyReason: `${MARKER} diretriz não cobre o tempo porta-balão local`,
  differentials: [{ hypothesis: 'IAM inferior', whyConsider: MARKER, whatDistinguishes: 'ECG' }],
  redFlags: [{ finding: `${MARKER} hipotensão`, severity: 'critical', action: 'Volume' }],
  clarifyingQuestions: [],
};

describe('CC-207 — texto clínico cifrado em repouso (integration)', () => {
  let raw: PrismaClient;
  let sealing: PrismaService;
  let plain: PrismaService;
  let physicianId: string;

  beforeAll(async () => {
    raw = await connectTestDb();
    sealing = clientWith({ FIELD_ENCRYPTION_KEY: KEY, CLINICAL_TEXT_ENCRYPTION: 'on' });
    plain = clientWith({ FIELD_ENCRYPTION_KEY: KEY });
  });

  afterAll(async () => {
    await raw.physician.deleteMany({ where: { email: { endsWith: EMAIL_DOMAIN } } });
    await raw.protocol.deleteMany({ where: { name: { startsWith: 'CC-207' } } });
    await clearAuditLog(raw);
    await sealing.$disconnect();
    await plain.$disconnect();
    await disconnectTestDb();
  });

  beforeEach(async () => {
    await raw.physician.deleteMany({ where: { email: { endsWith: EMAIL_DOMAIN } } });
    await clearAuditLog(raw);
    const physician = await raw.physician.create({
      data: {
        email: `medico-${Date.now()}${EMAIL_DOMAIN}`,
        passwordHash: 'x',
        crmUf: 'SP',
        crmNumber: '000207',
      },
    });
    physicianId = physician.id;
  });

  /** Um registro em cada tabela do inventário, com MARKER em todo campo cifrável. */
  async function writeEveryClinicalField(client: PrismaService) {
    const encounter = await client.encounter.create({
      data: { physicianId, patientRef: 'CC207-001', chiefComplaint: `${MARKER} dor torácica` },
    });
    const interaction = await client.aiInteraction.create({
      data: {
        encounterId: encounter.id,
        model: 'test-model',
        latencyMs: 1,
        inputRedacted: `${MARKER} homem 54 anos, dor torácica`,
        rawOutput: COPILOT_OUTPUT,
        citations: { recommendations: COPILOT_OUTPUT.recommendations, sources: [] },
        answeredQuestions: [{ questionId: 'q1', question: 'Dor irradia?', answer: MARKER }],
        uncertainty: true,
        uncertaintyReason: COPILOT_OUTPUT.uncertaintyReason,
        params: { demoCase: 'cc207' },
      },
    });
    await client.caseIntake.create({
      data: {
        encounterId: encounter.id,
        physicianId,
        caseTextRedacted: `${MARKER} caso do intake`,
        context: { hasCT: true },
        redFlags: {},
        path: 'ask',
        status: 'asking',
        reading: { problemRepresentation: MARKER },
        questions: [{ id: 'q1', question: `${MARKER} PA?` }],
        answers: [{ questionId: 'q1', answer: `${MARKER} 90/60` }],
      },
    });
    await client.encounterAttachment.create({
      data: {
        encounterId: encounter.id,
        physicianId,
        filename: 'laudo.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 10,
        text: `${MARKER} laudo do ECG`,
      },
    });
    await client.audioCapture.create({
      data: {
        encounterId: encounter.id,
        physicianId,
        encryptedContent: 'iv:tag:ct',
        mimeType: 'audio/webm',
        sizeBytes: 10,
        transcribedText: `${MARKER} transcrição`,
        retainUntil: new Date(Date.now() + 86_400_000),
      },
    });
    await client.document.create({
      data: {
        encounterId: encounter.id,
        physicianId,
        type: 'soap',
        content: { subjective: MARKER },
        physicianEdits: { subjective: `${MARKER} editado` },
      },
    });
    await client.recommendationDecision.create({
      data: {
        encounterId: encounter.id,
        interactionId: interaction.id,
        physicianId,
        recommendationIndex: 0,
        recommendationKey: '0-abcdef123456',
        decision: 'modified',
        note: `${MARKER} reduzi a dose`,
      },
    });
    await client.copilotFeedback.create({
      data: {
        encounterId: encounter.id,
        interactionId: interaction.id,
        physicianId,
        kind: 'wrong_recommendation',
        comment: `${MARKER} era dengue`,
        triageNote: `${MARKER} triado`,
      },
    });
    const protocol = await raw.protocol.create({
      data: { name: `CC-207 ${Date.now()}`, specialty: 'emergencia', createdBy: physicianId },
    });
    await client.protocolRun.create({
      data: {
        encounterId: encounter.id,
        protocolId: protocol.id,
        protocolVersion: 1,
        currentNodeId: protocol.id,
        startedBy: physicianId,
        answers: [{ nodeId: 'n1', answerType: 'text', answer: MARKER }],
        abandonReason: `${MARKER} paciente transferido`,
      },
    });
    // CC-707 — caso e plano enviados ao mentor, dúvida e resposta.
    await client.mentoringRequest.create({
      data: {
        encounterId: encounter.id,
        requesterId: physicianId,
        interactionId: interaction.id,
        status: 'answered',
        caseSnapshot: { caseText: `${MARKER} caso mascarado` },
        question: `${MARKER} transfiro agora?`,
        termsVersion: 'cc207-teste',
        termsAcceptedAt: new Date(),
        answer: `${MARKER} sim, com a regulação`,
        answeredAt: new Date(),
      },
    });
    return { encounterId: encounter.id, interactionId: interaction.id };
  }

  /** Cada valor das colunas do inventário, como o banco guarda (texto do jsonb para Json). */
  async function storedValues(
    encounterId: string,
  ): Promise<Array<{ column: string; value: string }>> {
    const values: Array<{ column: string; value: string }> = [];
    for (const column of SEALED_COLUMNS) {
      const scope = column.table === 'encounters' ? 'id' : 'encounter_id';
      const rows = await raw.$queryRawUnsafe<Array<{ value: string | null }>>(
        `SELECT "${column.column}"::text AS value FROM "${column.table}" WHERE "${scope}" = $1::uuid`,
        encounterId,
      );
      for (const row of rows) {
        if (row.value !== null)
          values.push({ column: `${column.table}.${column.column}`, value: row.value });
      }
    }
    return values;
  }

  it('flag on: every inventoried column reaches the database sealed — a dump without the key shows no clinical text', async () => {
    const { encounterId } = await writeEveryClinicalField(sealing);

    const values = await storedValues(encounterId);
    expect(values.map((v) => v.column).sort()).toEqual(
      SEALED_COLUMNS.map((c) => `${c.table}.${c.column}`).sort(),
    );
    for (const { column, value } of values) {
      expect(value, column).not.toContain(MARKER);
      // Json vira UMA string JSON: "enc:v1:…"
      const text = value.startsWith('"') ? (JSON.parse(value) as string) : value;
      expect(text.startsWith(`${SEALED_PREFIX}${keyring.current.id}:`), column).toBe(true);
    }

    // "Dump": a linha inteira, como pg_dump a veria.
    for (const table of new Set(SEALED_COLUMNS.map((c) => c.table))) {
      const scope = table === 'encounters' ? 'id' : 'encounter_id';
      const dump = await raw.$queryRawUnsafe<Array<{ row: string }>>(
        `SELECT t::text AS row FROM "${table}" t WHERE "${scope}" = $1::uuid`,
        encounterId,
      );
      for (const { row } of dump) expect(row, table).not.toContain(MARKER);
    }
    // Metadado filtrável continua em claro.
    const [params] = await raw.$queryRaw<Array<{ demo: string }>>`
      SELECT params->>'demoCase' AS demo FROM ai_interactions WHERE encounter_id = ${encounterId}::uuid`;
    expect(params?.demo).toBe('cc207');
  });

  it('reads back plaintext through the extension — top level, nested select/include and transactions', async () => {
    const { encounterId, interactionId } = await writeEveryClinicalField(sealing);

    const interaction = await plain.aiInteraction.findUniqueOrThrow({
      where: { id: interactionId },
    });
    expect(interaction.inputRedacted).toBe(`${MARKER} homem 54 anos, dor torácica`);
    expect(interaction.rawOutput).toEqual(COPILOT_OUTPUT);
    expect(interaction.uncertaintyReason).toBe(COPILOT_OUTPUT.uncertaintyReason);
    expect(interaction.answeredQuestions).toEqual([
      { questionId: 'q1', question: 'Dor irradia?', answer: MARKER },
    ]);

    const feedback = await plain.copilotFeedback.findFirstOrThrow({
      where: { encounterId },
      select: { comment: true, interaction: { select: { inputRedacted: true, rawOutput: true } } },
    });
    expect(feedback.comment).toBe(`${MARKER} era dengue`);
    expect(feedback.interaction.inputRedacted).toBe(`${MARKER} homem 54 anos, dor torácica`);
    expect(feedback.interaction.rawOutput).toEqual(COPILOT_OUTPUT);

    const encounter = await plain.encounter.findUniqueOrThrow({
      where: { id: encounterId },
      include: { aiInteractions: true, documents: true, caseIntakes: true, protocolRuns: true },
    });
    expect(encounter.chiefComplaint).toBe(`${MARKER} dor torácica`);
    expect(encounter.aiInteractions[0]!.citations).toEqual({
      recommendations: COPILOT_OUTPUT.recommendations,
      sources: [],
    });
    expect(encounter.documents[0]!.physicianEdits).toEqual({ subjective: `${MARKER} editado` });
    expect(encounter.caseIntakes[0]!.answers).toEqual([
      { questionId: 'q1', answer: `${MARKER} 90/60` },
    ]);
    expect(encounter.protocolRuns[0]!.abandonReason).toBe(`${MARKER} paciente transferido`);

    const inTransaction = await plain.$transaction((tx) =>
      tx.encounterAttachment.findFirstOrThrow({ where: { encounterId }, select: { text: true } }),
    );
    expect(inTransaction.text).toBe(`${MARKER} laudo do ECG`);
  });

  it('flag off: writes plaintext, and the dual read serves sealed and plaintext rows side by side', async () => {
    const sealedRow = await writeEveryClinicalField(sealing);
    const plainEncounter = await plain.encounter.create({ data: { physicianId } });
    await plain.aiInteraction.create({
      data: {
        encounterId: plainEncounter.id,
        model: 'm',
        latencyMs: 1,
        inputRedacted: 'texto em claro',
        rawOutput: { reasoning: 'em claro' },
      },
    });

    const [stored] = await raw.$queryRaw<Array<{ input: string }>>`
      SELECT input_redacted AS input FROM ai_interactions WHERE encounter_id = ${plainEncounter.id}::uuid`;
    expect(stored?.input).toBe('texto em claro');

    const both = await sealing.aiInteraction.findMany({
      where: { encounterId: { in: [sealedRow.encounterId, plainEncounter.id] } },
      select: { inputRedacted: true },
      orderBy: { createdAt: 'asc' },
    });
    expect(both.map((row) => row.inputRedacted)).toEqual([
      `${MARKER} homem 54 anos, dor torácica`,
      'texto em claro',
    ]);
  });

  it('rejects filtering by the content of a sealed column; null checks still work', async () => {
    await writeEveryClinicalField(sealing);
    await expect(
      sealing.aiInteraction.findMany({ where: { inputRedacted: { contains: MARKER } } }),
    ).rejects.toBeInstanceOf(ClinicalTextQueryError);
    const withText = await sealing.aiInteraction.count({
      where: { inputRedacted: { not: null }, encounter: { physicianId } },
    });
    expect(withText).toBe(1);
  });

  it('keeps the validation-failure marker filterable: "latest analysis" still skips failures', async () => {
    const encounter = await sealing.encounter.create({ data: { physicianId } });
    const base = {
      encounterId: encounter.id,
      model: 'm',
      latencyMs: 1,
      inputRedacted: MARKER,
      uncertainty: true,
    };
    const analysis = await sealing.aiInteraction.create({
      data: {
        ...base,
        rawOutput: COPILOT_OUTPUT,
        uncertaintyReason: COPILOT_OUTPUT.uncertaintyReason,
      },
    });
    await sealing.aiInteraction.create({
      data: {
        ...base,
        rawOutput: { raw: 'x', validationErrors: ['schema'] },
        uncertaintyReason: 'Output validation failed',
        createdAt: new Date(Date.now() + 1000),
      },
    });

    const stored = await raw.$queryRaw<Array<{ reason: string }>>`
      SELECT uncertainty_reason AS reason FROM ai_interactions
      WHERE encounter_id = ${encounter.id}::uuid ORDER BY created_at`;
    expect(stored[0]!.reason.startsWith(SEALED_PREFIX)).toBe(true);
    expect(stored[1]!.reason).toBe('Output validation failed');

    const latest = await sealing.aiInteraction.findFirst({
      where: {
        encounterId: encounter.id,
        OR: [
          { uncertaintyReason: null },
          { uncertaintyReason: { not: 'Output validation failed' } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, uncertaintyReason: true },
    });
    // Linha de modelo com campo computado volta como proxy do Prisma (com um
    // símbolo de inspect): compare os campos, não o objeto inteiro.
    expect(latest?.id).toBe(analysis.id);
    expect(latest?.uncertaintyReason).toBe(COPILOT_OUTPUT.uncertaintyReason);

    // A migração em lote também deixa o marcador em claro e fora da contagem.
    const reasonColumn = SEALED_COLUMNS.find((c) => c.column === 'uncertainty_reason')!;
    const store = new PrismaClinicalTextStore(raw);
    await encryptClinicalText(store, keyring, {
      batchSize: 10,
      dryRun: false,
      columns: [reasonColumn],
    });
    const afterMigration = await raw.$queryRaw<Array<{ reason: string }>>`
      SELECT uncertainty_reason AS reason FROM ai_interactions
      WHERE encounter_id = ${encounter.id}::uuid ORDER BY created_at`;
    expect(afterMigration[1]!.reason).toBe('Output validation failed');
    const verify = await verifyClinicalText(store, keyring, {
      batchSize: 10,
      columns: [reasonColumn],
    });
    expect(verify.columns[0]!.plaintext).toBe(0);
  });

  describe('migração em lote (pnpm crypto:encrypt-clinical-text)', () => {
    it('dry-run changes nothing; the run seals everything as the runtime role; the rerun is a no-op; verify passes', async () => {
      const { encounterId, interactionId } = await writeEveryClinicalField(plain);
      // Número não inteiro gravado exato (sem passar pelo Prisma).
      await raw.$executeRaw`
        UPDATE ai_interactions SET raw_output = ${JSON.stringify({ ...COPILOT_OUTPUT, cost: 0.1 + 0.2 })}::jsonb
        WHERE id = ${interactionId}::uuid`;
      const store = new PrismaClinicalTextStore(raw);

      const before = await verifyClinicalText(store, keyring, { batchSize: 3 });
      expect(before.ok).toBe(false);

      const dryRun = await encryptClinicalText(store, keyring, { batchSize: 3, dryRun: true });
      expect(dryRun.columns.every((c) => c.sealed >= 1)).toBe(true);
      expect((await storedValues(encounterId)).some((v) => v.value.includes(MARKER))).toBe(true);

      // A role de runtime (a do DATABASE_URL de produção) consegue cifrar.
      await raw.$transaction(
        async (tx) => {
          await tx.$executeRawUnsafe(`SET LOCAL ROLE ${RUNTIME_ROLE}`);
          const report = await encryptClinicalText(new PrismaClinicalTextStore(tx), keyring, {
            batchSize: 3,
            dryRun: false,
          });
          expect(report.columns.every((c) => c.failed === 0 && c.skippedConcurrent === 0)).toBe(
            true,
          );
        },
        { timeout: 60_000 },
      );

      for (const { column, value } of await storedValues(encounterId)) {
        expect(value, column).not.toContain(MARKER);
      }
      const rerun = await encryptClinicalText(store, keyring, { batchSize: 3, dryRun: false });
      expect(rerun.columns.map((c) => c.pending)).toEqual(SEALED_COLUMNS.map(() => 0));

      const after = await verifyClinicalText(store, keyring, { batchSize: 3 });
      expect(after.ok).toBe(true);
      expect(after.columns.every((c) => c.plaintext === 0 && c.undecryptable === 0)).toBe(true);

      // A aplicação lê igual — e o número volta exato.
      const interaction = await plain.aiInteraction.findUniqueOrThrow({
        where: { id: interactionId },
      });
      expect(interaction.rawOutput).toEqual({ ...COPILOT_OUTPUT, cost: 0.30000000000000004 });
      expect(interaction.inputRedacted).toBe(`${MARKER} homem 54 anos, dor torácica`);
    });

    it('--decrypt (escape hatch for an older API) restores exactly what was stored before', async () => {
      const { encounterId } = await writeEveryClinicalField(plain);
      const original = await storedValues(encounterId);
      const store = new PrismaClinicalTextStore(raw);

      await encryptClinicalText(store, keyring, { batchSize: 4, dryRun: false });
      expect((await storedValues(encounterId)).some((v) => v.value.includes(MARKER))).toBe(false);

      const report = await decryptClinicalText(store, keyring, { batchSize: 4, dryRun: false });
      expect(report.columns.every((c) => c.failed === 0)).toBe(true);
      expect(await storedValues(encounterId)).toEqual(original);
    });

    it('compare-and-set: does not overwrite a value changed after it was read', async () => {
      const { interactionId } = await writeEveryClinicalField(plain);
      const store = new PrismaClinicalTextStore(raw);
      const column = SEALED_COLUMNS.find((c) => c.column === 'input_redacted')!;
      const written = await store.replaceIfUnchanged(
        column,
        interactionId,
        'valor antigo',
        'enc:v1:x',
      );
      expect(written).toBe(false);
      const jsonColumn = SEALED_COLUMNS.find((c) => c.column === 'raw_output')!;
      const jsonWritten = await store.replaceIfUnchanged(
        jsonColumn,
        interactionId,
        '{"a": 1}',
        'x',
      );
      expect(jsonWritten).toBe(false);
    });

    it('rotates values sealed with FIELD_ENCRYPTION_KEY_PREVIOUS to the current key', async () => {
      const oldClient = clientWith({
        FIELD_ENCRYPTION_KEY: OLD_KEY,
        CLINICAL_TEXT_ENCRYPTION: 'on',
      });
      try {
        const { interactionId } = await writeEveryClinicalField(oldClient);
        const rotating = loadFieldKeyring((name) =>
          name === 'FIELD_ENCRYPTION_KEY'
            ? KEY
            : name === 'FIELD_ENCRYPTION_KEY_PREVIOUS'
              ? OLD_KEY
              : undefined,
        );
        const rotatingClient = clientWith({
          FIELD_ENCRYPTION_KEY: KEY,
          FIELD_ENCRYPTION_KEY_PREVIOUS: OLD_KEY,
        });
        try {
          const before = await rotatingClient.aiInteraction.findUniqueOrThrow({
            where: { id: interactionId },
          });
          expect(before.inputRedacted).toBe(`${MARKER} homem 54 anos, dor torácica`);

          const store = new PrismaClinicalTextStore(raw);
          const report = await encryptClinicalText(store, rotating, {
            batchSize: 50,
            dryRun: false,
          });
          expect(report.columns.every((c) => c.rotated >= 1 && c.failed === 0)).toBe(true);

          const [stored] = await raw.$queryRaw<Array<{ input: string }>>`
            SELECT input_redacted AS input FROM ai_interactions WHERE id = ${interactionId}::uuid`;
          expect(sealedKeyId(stored!.input)).toBe(rotating.current.id);
          const verify = await verifyClinicalText(store, keyring, { batchSize: 50 });
          expect(verify.ok).toBe(true);
          expect(verify.columns.every((c) => c.sealedPreviousKey === 0)).toBe(true);
        } finally {
          await rotatingClient.$disconnect();
        }
      } finally {
        await oldClient.$disconnect();
      }
    });
  });

  describe('selo do documento (contentHash) e trilha de auditoria (ADR-015)', () => {
    function documentsService(client: PrismaService, audit: AuditService): DocumentsService {
      return new DocumentsService(
        client,
        audit,
        { isAvailable: () => false } as unknown as StorageService,
        { listForPhysician: async () => [] } as unknown as InstitutionsService,
      );
    }

    async function generateAndConfirm(client: PrismaService) {
      const audit = new AuditService(client);
      const encounter = await client.encounter.create({
        data: { physicianId, patientRef: 'CC207-DOC' },
      });
      await client.aiInteraction.create({
        data: {
          encounterId: encounter.id,
          model: 'm',
          latencyMs: 1,
          inputRedacted: MARKER,
          rawOutput: COPILOT_OUTPUT,
          uncertainty: true,
          uncertaintyReason: COPILOT_OUTPUT.uncertaintyReason,
        },
      });
      const service = documentsService(client, audit);
      const generated = await service.generate(physicianId, encounter.id, { type: 'soap' });
      const confirmed = await service.confirm(physicianId, generated.id);
      return { generated, confirmed };
    }

    it('hashes the plaintext: same contentHash with and without the cipher, and it matches the content', async () => {
      const withCipher = await generateAndConfirm(sealing);
      const withoutCipher = await generateAndConfirm(plain);

      // O conteúdo foi gravado cifrado…
      const [stored] = await raw.$queryRaw<Array<{ content: string }>>`
        SELECT content::text AS content FROM documents WHERE id = ${withCipher.generated.id}::uuid`;
      expect(stored!.content).not.toContain(MARKER);
      expect(stored!.content.startsWith(`"${SEALED_PREFIX}`)).toBe(true);

      // …e o selo é o do texto em claro, na geração e na confirmação.
      expect(withCipher.generated.content).toEqual(withoutCipher.generated.content);
      expect(withCipher.generated.contentHash).toBe(canonicalHashOf(withCipher.generated.content));
      expect(withCipher.confirmed.contentHash).toBe(withCipher.generated.contentHash);
      expect(withCipher.confirmed.contentHash).toBe(withoutCipher.confirmed.contentHash);
    });

    it('keeps the audit chain valid and writes the plaintext (never the ciphertext) into its payload', async () => {
      await generateAndConfirm(sealing);
      const audit = new AuditService(sealing);

      const chain = await audit.verifyChain();
      expect(chain.valid).toBe(true);

      const confirmedEntry = await raw.auditLog.findFirstOrThrow({
        where: { action: 'DOCUMENT_CONFIRMED', actorId: physicianId },
      });
      const payload = confirmedEntry.payload as { uncertaintyReason: string };
      expect(payload.uncertaintyReason).toBe(COPILOT_OUTPUT.uncertaintyReason);
      expect(JSON.stringify(confirmedEntry.payload)).not.toContain(SEALED_PREFIX);
    });
  });
});
