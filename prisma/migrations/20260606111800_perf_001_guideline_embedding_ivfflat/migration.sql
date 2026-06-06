-- PERF-001 — Índice vetorial ivfflat efetivo para busca semântica.
--
-- A query usa distância de cosseno (`embedding <=> query_vector`), então o
-- índice precisa usar `vector_cosine_ops`. O predicado evita indexar chunks
-- ainda sem embedding.
CREATE INDEX IF NOT EXISTS "guideline_chunks_embedding_ivfflat_idx"
  ON "guideline_chunks"
  USING ivfflat ("embedding" vector_cosine_ops)
  WITH (lists = 100)
  WHERE "embedding" IS NOT NULL;

ANALYZE "guideline_chunks";
