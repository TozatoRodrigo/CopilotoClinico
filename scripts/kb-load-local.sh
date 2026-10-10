#!/usr/bin/env bash
# F0-A — Monta uma base de conhecimento realista num Postgres LOCAL para rodar o
# gabarito clínico (pnpm eval:clinical). Ver docs/evals/gabarito-clinico.md.
#
# Passos: migrations → seed:guidelines → ingestão dos pacotes docs/guidelines/drafts/kb-*
# → (opcional) aprovação em lote dos trechos ingeridos → (opcional) base oficial do MS.
#
# ATENÇÃO
# - seed:guidelines grava trechos SEM embedding: a busca semântica não os enxerga, e
#   eles só voltam pela busca lexical, que exige todos os termos da consulta (quase
#   nunca casa com o texto inteiro de um caso). Na prática ficam invisíveis ao Copiloto.
# - A ingestão gera embeddings pelo provedor configurado (EMBEDDING_PROVIDER/AI_PROVIDER):
#   com provedor real há custo; com AI_PROVIDER=test todos os vetores são iguais e o
#   retrieval perde o sentido (serve só para testar a fiação).
# - --approve-ingested aprova em lote, SEM curadoria médica. A base resultante mede
#   "os pacotes como estão no rascunho", não "a base curada de produção". Para copiar a
#   base de produção fielmente, use scripts/kb-export.sh + scripts/kb-import.sh.
#
# Uso:
#   DATABASE_URL=... MIGRATION_DATABASE_URL=... scripts/kb-load-local.sh [--approve-ingested] [--with-official]
set -euo pipefail

cd "$(dirname "$0")/.."
# shellcheck source=scripts/kb-db-guard.sh
source scripts/kb-db-guard.sh

APPROVE_INGESTED=false
WITH_OFFICIAL=false
for argument in "$@"; do
  case "$argument" in
    --approve-ingested) APPROVE_INGESTED=true ;;
    --with-official) WITH_OFFICIAL=true ;;
    *) echo "Opção desconhecida: $argument" >&2; exit 1 ;;
  esac
done

require_local_database "${DATABASE_URL:-}" DATABASE_URL
require_local_database "${MIGRATION_DATABASE_URL:-}" MIGRATION_DATABASE_URL
echo "Banco: $(database_label "$DATABASE_URL")"

echo "▶ Migrations"
DATABASE_URL="$MIGRATION_DATABASE_URL" pnpm -s prisma migrate deploy

echo "▶ Seed de diretrizes (trechos aprovados, sem embedding)"
pnpm -s seed:guidelines

for pack in docs/guidelines/drafts/kb-*/; do
  echo "▶ Ingestão: $pack"
  pnpm -s ingest:guidelines "$pack"
done

if [[ "$APPROVE_INGESTED" == true ]]; then
  echo "▶ Aprovando em lote os trechos ingeridos (sem curadoria — só para avaliação local)"
  echo "UPDATE guideline_chunks SET status = 'approved', reviewed_at = now() WHERE status = 'pending_review';" |
    pnpm -s prisma db execute --stdin --url "$MIGRATION_DATABASE_URL"
fi

if [[ "$WITH_OFFICIAL" == true ]]; then
  echo "▶ Base oficial do MS (baixa ~200 MB de PDFs da Conitec; classificação por LLM e embeddings têm custo)"
  pnpm -s sync:official-guidelines
fi

echo "✓ Pronto. O run.json de cada execução do gabarito registra quantos trechos aprovados (e com embedding) havia."
