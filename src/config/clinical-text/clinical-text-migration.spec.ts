import { describe, expect, it } from 'vitest';
import {
  SEALED_PREFIX,
  loadFieldKeyring,
  openJson,
  openText,
  sealText,
  sealedKeyId,
  type FieldKeyring,
} from '../../shared/crypto/field-cipher';
import { SEALED_COLUMNS, type SealedColumn } from './clinical-text-fields';
import {
  decryptClinicalText,
  encryptClinicalText,
  verifyClinicalText,
  type ClinicalTextStore,
  type ColumnCensus,
  type PendingValue,
} from './clinical-text-migration';

const OLD_KEY = '1'.repeat(64);
const NEW_KEY = '2'.repeat(64);
const STRANGER_KEY = '3'.repeat(64);

function ring(current: string, previous?: string): FieldKeyring {
  return loadFieldKeyring((name) =>
    name === 'FIELD_ENCRYPTION_KEY'
      ? current
      : name === 'FIELD_ENCRYPTION_KEY_PREVIOUS'
        ? previous
        : undefined,
  );
}

function column(model: string, field: string): SealedColumn {
  const found = SEALED_COLUMNS.find((c) => c.model === model && c.field === field);
  if (!found) throw new Error(`${model}.${field} not in inventory`);
  return found;
}

const TEXT = column('AiInteraction', 'inputRedacted');
const JSON_COLUMN = column('AiInteraction', 'rawOutput');
const COLUMNS = [TEXT, JSON_COLUMN];

/**
 * Banco em memória com a mesma semântica do PrismaClinicalTextStore: texto
 * guardado como string; Json guardado como o texto do jsonb.
 */
class FakeStore implements ClinicalTextStore {
  readonly rows = new Map<SealedColumn, Map<string, string | null>>();
  writes = 0;
  pendingCalls = 0;
  /** Simula queda no meio da rodada: lança na escrita de número N (1-based). */
  failOnWrite: number | null = null;
  /** Simula a API editando a linha entre a leitura e a gravação do script. */
  beforeReplace: ((column: SealedColumn, id: string) => void) | null = null;

  set(col: SealedColumn, id: string, stored: string | null): void {
    if (!this.rows.has(col)) this.rows.set(col, new Map());
    this.rows.get(col)!.set(id, stored);
  }

  get(col: SealedColumn, id: string): string | null | undefined {
    return this.rows.get(col)?.get(id);
  }

  /** O valor lógico (o que a aplicação leria), aberto com o keyring. */
  read(col: SealedColumn, id: string, keyring: FieldKeyring): unknown {
    const stored = this.get(col, id) ?? null;
    if (stored === null) return null;
    if (col.kind === 'text') return openText(keyring, stored);
    return openJson(keyring, JSON.parse(stored));
  }

  private present(col: SealedColumn): Array<{ id: string; raw: string; text: string | null }> {
    return [...(this.rows.get(col) ?? new Map<string, string | null>()).entries()]
      .filter(([, stored]) => stored !== null && !(col.kind === 'json' && stored === 'null'))
      .filter(([, stored]) => !(col.kind === 'text' && col.markers.includes(stored as string)))
      .map(([id, stored]) => {
        const raw = stored as string;
        if (col.kind === 'text') return { id, raw, text: raw };
        const parsed: unknown = JSON.parse(raw);
        return { id, raw, text: typeof parsed === 'string' ? parsed : null };
      })
      .sort((a, b) => (a.id < b.id ? -1 : 1));
  }

  async pendingBatch(col: SealedColumn, keyId: string, afterId: string | null, limit: number) {
    this.pendingCalls++;
    return this.present(col)
      .filter((row) => row.text === null || !row.text.startsWith(`${SEALED_PREFIX}${keyId}:`))
      .filter((row) => afterId === null || row.id > afterId)
      .slice(0, limit)
      .map((row): PendingValue => ({ id: row.id, raw: row.raw, text: row.text ?? row.raw }));
  }

  async sealedBatch(col: SealedColumn, afterId: string | null, limit: number) {
    return this.present(col)
      .filter((row) => row.text?.startsWith(SEALED_PREFIX))
      .filter((row) => afterId === null || row.id > afterId)
      .slice(0, limit)
      .map((row): PendingValue => ({ id: row.id, raw: row.raw, text: row.text! }));
  }

  async replaceIfUnchanged(col: SealedColumn, id: string, raw: string, sealed: string) {
    this.writes++;
    if (this.failOnWrite !== null && this.writes === this.failOnWrite) {
      throw new Error('connection lost');
    }
    this.beforeReplace?.(col, id);
    if (this.get(col, id) !== raw) return false;
    this.set(col, id, col.kind === 'text' ? sealed : JSON.stringify(sealed));
    return true;
  }

  async restoreIfUnchanged(col: SealedColumn, id: string, raw: string, plaintext: string) {
    this.writes++;
    if (this.get(col, id) !== raw) return false;
    // Json: o texto JSON vira o próprio valor do jsonb.
    this.set(col, id, plaintext);
    return true;
  }

  async census(col: SealedColumn): Promise<ColumnCensus> {
    const rows = this.present(col);
    const sealedByKey: Record<string, number> = {};
    for (const row of rows) {
      const keyId = row.text?.startsWith(SEALED_PREFIX) ? row.text.slice(7, 15) : null;
      if (keyId) sealedByKey[keyId] = (sealedByKey[keyId] ?? 0) + 1;
    }
    return {
      total: rows.length,
      plaintext: rows.filter((row) => !row.text?.startsWith(SEALED_PREFIX)).length,
      sealedByKey,
    };
  }
}

function seedPlaintext(store: FakeStore, count: number): void {
  for (let i = 0; i < count; i++) {
    const id = `id-${String(i).padStart(3, '0')}`;
    store.set(TEXT, id, `Caso ${i}: febre há ${i} dias`);
    store.set(JSON_COLUMN, id, JSON.stringify({ reasoning: `Caso ${i}`, confidence: 0.1 + 0.2 }));
  }
  store.set(TEXT, 'id-null', null);
  store.set(JSON_COLUMN, 'id-null', 'null');
}

describe('CC-207 — migração em lote do texto clínico', () => {
  it('dry-run counts what would be sealed and writes nothing', async () => {
    const store = new FakeStore();
    seedPlaintext(store, 5);
    const keyring = ring(NEW_KEY);

    const report = await encryptClinicalText(store, keyring, {
      batchSize: 2,
      dryRun: true,
      columns: COLUMNS,
    });

    expect(report.dryRun).toBe(true);
    expect(report.columns.map((c) => [c.column, c.pending, c.sealed])).toEqual([
      ['input_redacted', 5, 5],
      ['raw_output', 5, 5],
    ]);
    expect(store.writes).toBe(0);
    expect(store.get(TEXT, 'id-000')).toBe('Caso 0: febre há 0 dias');
  });

  it('seals every value in batches, keeps NULL / JSON null, and is idempotent', async () => {
    const store = new FakeStore();
    seedPlaintext(store, 5);
    const keyring = ring(NEW_KEY);

    const first = await encryptClinicalText(store, keyring, {
      batchSize: 2,
      dryRun: false,
      columns: COLUMNS,
    });
    expect(first.columns.map((c) => c.sealed)).toEqual([5, 5]);
    // 5 valores em lotes de 2 = 3 lotes + a consulta vazia, por coluna.
    expect(store.pendingCalls).toBe(8);

    for (let i = 0; i < 5; i++) {
      const id = `id-${String(i).padStart(3, '0')}`;
      expect(store.get(TEXT, id)!.startsWith(`${SEALED_PREFIX}${keyring.current.id}:`)).toBe(true);
      expect(store.get(TEXT, id)).not.toContain('febre');
      expect(store.read(TEXT, id, keyring)).toBe(`Caso ${i}: febre há ${i} dias`);
      // Json: o mesmo valor, números exatos.
      expect(store.read(JSON_COLUMN, id, keyring)).toEqual({
        reasoning: `Caso ${i}`,
        confidence: 0.30000000000000004,
      });
    }
    expect(store.get(TEXT, 'id-null')).toBeNull();
    expect(store.get(JSON_COLUMN, 'id-null')).toBe('null');

    const again = await encryptClinicalText(store, keyring, {
      batchSize: 2,
      dryRun: false,
      columns: COLUMNS,
    });
    expect(again.columns.map((c) => [c.pending, c.sealed])).toEqual([
      [0, 0],
      [0, 0],
    ]);

    const verify = await verifyClinicalText(store, keyring, { batchSize: 2, columns: COLUMNS });
    expect(verify.ok).toBe(true);
    expect(verify.columns.map((c) => [c.total, c.plaintext, c.sealedCurrentKey])).toEqual([
      [5, 0, 5],
      [5, 0, 5],
    ]);
  });

  it('resumes after an interruption: the rerun seals only what is left', async () => {
    const store = new FakeStore();
    seedPlaintext(store, 6);
    const keyring = ring(NEW_KEY);
    store.failOnWrite = 4;

    await expect(
      encryptClinicalText(store, keyring, { batchSize: 2, dryRun: false, columns: COLUMNS }),
    ).rejects.toThrow('connection lost');

    const halfway = await verifyClinicalText(store, keyring, { batchSize: 10, columns: COLUMNS });
    expect(halfway.ok).toBe(false);
    expect(halfway.columns[0]).toMatchObject({ sealedCurrentKey: 3, plaintext: 3 });
    expect(halfway.columns[1]).toMatchObject({ sealedCurrentKey: 0, plaintext: 6 });

    store.failOnWrite = null;
    const resumed = await encryptClinicalText(store, keyring, {
      batchSize: 2,
      dryRun: false,
      columns: COLUMNS,
    });
    expect(resumed.columns.map((c) => c.sealed)).toEqual([3, 6]);
    expect((await verifyClinicalText(store, keyring, { batchSize: 10, columns: COLUMNS })).ok).toBe(
      true,
    );
  });

  it('never overwrites a row the API changed meanwhile; the next run picks it up', async () => {
    const store = new FakeStore();
    seedPlaintext(store, 3);
    const keyring = ring(NEW_KEY);
    store.beforeReplace = (col, id) => {
      if (col === TEXT && id === 'id-001') store.set(TEXT, id, 'Caso 1 editado pela API');
    };

    const report = await encryptClinicalText(store, keyring, {
      batchSize: 10,
      dryRun: false,
      columns: [TEXT],
    });
    expect(report.columns[0]).toMatchObject({ pending: 3, sealed: 2, skippedConcurrent: 1 });
    expect(store.get(TEXT, 'id-001')).toBe('Caso 1 editado pela API');

    store.beforeReplace = null;
    const rerun = await encryptClinicalText(store, keyring, {
      batchSize: 10,
      dryRun: false,
      columns: [TEXT],
    });
    expect(rerun.columns[0]).toMatchObject({ pending: 1, sealed: 1, skippedConcurrent: 0 });
    expect(store.read(TEXT, 'id-001', keyring)).toBe('Caso 1 editado pela API');
  });

  it('rotates values sealed with the previous key to the current key', async () => {
    const store = new FakeStore();
    const oldRing = ring(OLD_KEY);
    store.set(TEXT, 'a', sealText(oldRing, 'Caso antigo'));
    store.set(TEXT, 'b', 'Caso em claro');
    store.set(JSON_COLUMN, 'a', JSON.stringify(sealText(oldRing, JSON.stringify({ x: 1.5 }))));
    const rotating = ring(NEW_KEY, OLD_KEY);

    const before = await verifyClinicalText(store, rotating, { batchSize: 10, columns: COLUMNS });
    expect(before.columns[0]).toMatchObject({ sealedPreviousKey: 1, plaintext: 1 });

    const report = await encryptClinicalText(store, rotating, {
      batchSize: 10,
      dryRun: false,
      columns: COLUMNS,
    });
    expect(report.columns[0]).toMatchObject({ sealed: 2, rotated: 1 });
    expect(report.columns[1]).toMatchObject({ sealed: 1, rotated: 1 });
    expect(sealedKeyId(store.get(TEXT, 'a')!)).toBe(rotating.current.id);
    // Depois da rotação, a chave anterior pode sair do ambiente.
    const newOnly = ring(NEW_KEY);
    expect(store.read(TEXT, 'a', newOnly)).toBe('Caso antigo');
    expect(store.read(JSON_COLUMN, 'a', newOnly)).toEqual({ x: 1.5 });

    const after = await verifyClinicalText(store, newOnly, { batchSize: 10, columns: COLUMNS });
    expect(after.ok).toBe(true);
    expect(after.columns[0]).toMatchObject({ sealedCurrentKey: 2, sealedPreviousKey: 0 });
  });

  it('reports — and does not touch — values it cannot open', async () => {
    const store = new FakeStore();
    store.set(TEXT, 'a', sealText(ring(STRANGER_KEY), 'chave de outro ambiente'));
    store.set(TEXT, 'b', 'Caso em claro');
    const keyring = ring(NEW_KEY);

    const report = await encryptClinicalText(store, keyring, {
      batchSize: 10,
      dryRun: false,
      columns: [TEXT],
    });
    expect(report.columns[0]).toMatchObject({ sealed: 1, failed: 1, failedIds: ['a'] });
    expect(sealedKeyId(store.get(TEXT, 'a')!)).toBe(ring(STRANGER_KEY).current.id);

    const verify = await verifyClinicalText(store, keyring, { batchSize: 10, columns: [TEXT] });
    expect(verify.ok).toBe(false);
    expect(verify.columns[0]).toMatchObject({
      plaintext: 0,
      sealedUnknownKey: 1,
      undecryptable: 0,
    });
  });

  it('verify fails on plaintext and on sealed values that do not open', async () => {
    const store = new FakeStore();
    const keyring = ring(NEW_KEY);
    const good = sealText(keyring, 'ok');
    const payload = Buffer.from(good.split(':').at(-1)!, 'base64');
    payload.writeUInt8(payload.readUInt8(payload.length - 1) ^ 0x01, payload.length - 1);
    store.set(TEXT, 'a', good);
    store.set(TEXT, 'b', `${SEALED_PREFIX}${keyring.current.id}:${payload.toString('base64')}`);
    store.set(TEXT, 'c', 'Caso em claro');

    const verify = await verifyClinicalText(store, keyring, { batchSize: 1, columns: [TEXT] });
    expect(verify.ok).toBe(false);
    expect(verify.columns[0]).toMatchObject({
      total: 3,
      plaintext: 1,
      sealedCurrentKey: 2,
      undecryptable: 1,
      undecryptableIds: ['b'],
    });
  });

  it('decrypt (escape hatch for an older API) restores the exact plaintext, idempotently', async () => {
    const store = new FakeStore();
    seedPlaintext(store, 3);
    const keyring = ring(NEW_KEY);
    const original = new Map(store.rows.get(JSON_COLUMN));
    await encryptClinicalText(store, keyring, { batchSize: 2, dryRun: false, columns: COLUMNS });

    const dryRun = await decryptClinicalText(store, keyring, {
      batchSize: 2,
      dryRun: true,
      columns: COLUMNS,
    });
    expect(dryRun.columns.map((c) => [c.found, c.restored])).toEqual([
      [3, 3],
      [3, 3],
    ]);
    expect(store.get(TEXT, 'id-000')!.startsWith(SEALED_PREFIX)).toBe(true);

    const report = await decryptClinicalText(store, keyring, {
      batchSize: 2,
      dryRun: false,
      columns: COLUMNS,
    });
    expect(report.columns.map((c) => c.restored)).toEqual([3, 3]);
    expect(store.get(TEXT, 'id-002')).toBe('Caso 2: febre há 2 dias');
    for (const [id, raw] of original) {
      expect(JSON.parse(store.get(JSON_COLUMN, id)!)).toEqual(JSON.parse(raw!));
    }

    const again = await decryptClinicalText(store, keyring, {
      batchSize: 2,
      dryRun: false,
      columns: COLUMNS,
    });
    expect(again.columns.map((c) => c.found)).toEqual([0, 0]);
  });

  it('leaves system markers (PLAINTEXT_MARKERS) in clear and out of the counts', async () => {
    const reason = column('AiInteraction', 'uncertaintyReason');
    expect(reason.markers).toEqual(['Output validation failed']);
    const store = new FakeStore();
    store.set(reason, 'a', 'Output validation failed');
    store.set(reason, 'b', 'Diretriz não cobre gestante com 34 semanas');
    const keyring = ring(NEW_KEY);

    const report = await encryptClinicalText(store, keyring, {
      batchSize: 10,
      dryRun: false,
      columns: [reason],
    });
    expect(report.columns[0]).toMatchObject({ pending: 1, sealed: 1 });
    expect(store.get(reason, 'a')).toBe('Output validation failed');
    expect(store.get(reason, 'b')!.startsWith(SEALED_PREFIX)).toBe(true);

    const verify = await verifyClinicalText(store, keyring, { batchSize: 10, columns: [reason] });
    expect(verify.ok).toBe(true);
    expect(verify.columns[0]).toMatchObject({ total: 1, plaintext: 0, sealedCurrentKey: 1 });
  });
});
