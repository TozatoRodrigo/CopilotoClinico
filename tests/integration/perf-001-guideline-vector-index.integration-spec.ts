/**
 * PERF-001 — índice vetorial ivfflat efetivo.
 *
 * Garante que migrations provisionem um índice pgvector real para a coluna
 * `guideline_chunks.embedding`, usando a mesma métrica da query semântica.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { connectTestDb, disconnectTestDb } from './helpers/db';

describe('PERF-001 — guideline_chunks vector index (integration)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = await connectTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  it('provisions an ivfflat cosine index for guideline embeddings', async () => {
    const indexes = await prisma.$queryRaw<
      Array<{
        indexName: string;
        accessMethod: string;
        operatorClass: string;
        predicate: string | null;
      }>
    >`
      SELECT
        index_rel.relname AS "indexName",
        am.amname AS "accessMethod",
        opc.opcname AS "operatorClass",
        pg_get_expr(idx.indpred, idx.indrelid) AS "predicate"
      FROM pg_index idx
      JOIN pg_class table_rel ON table_rel.oid = idx.indrelid
      JOIN pg_class index_rel ON index_rel.oid = idx.indexrelid
      JOIN pg_am am ON am.oid = index_rel.relam
      JOIN pg_opclass opc ON opc.oid = idx.indclass[0]
      WHERE table_rel.relname = 'guideline_chunks'
        AND index_rel.relname = 'guideline_chunks_embedding_ivfflat_idx'
    `;

    expect(indexes).toEqual([
      {
        indexName: 'guideline_chunks_embedding_ivfflat_idx',
        accessMethod: 'ivfflat',
        operatorClass: 'vector_cosine_ops',
        predicate: '(embedding IS NOT NULL)',
      },
    ]);
  });
});
