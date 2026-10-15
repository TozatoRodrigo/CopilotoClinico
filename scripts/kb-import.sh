#!/usr/bin/env bash
# F0-A — Importa num Postgres LOCAL a base exportada por scripts/kb-export.sh,
# substituindo a base de conhecimento que estiver lá (guideline_chunks e
# official_guideline_documents). Recusa qualquer banco que não seja local.
#
# Uso:
#   KB_TARGET_DATABASE_URL=postgresql://copiloto_owner:...@localhost:5432/copiloto_clinico \
#   scripts/kb-import.sh base.sql.gz
#
# Use a role OWNER (a mesma de MIGRATION_DATABASE_URL): a carga desliga os
# gatilhos de chave estrangeira durante a cópia (session_replication_role), o que
# exige superusuário — no Postgres do docker-compose, a role owner é.
#
# PSQL troca o binário, como no kb-export.sh. Sem psql instalado, use o do contêiner:
#   PSQL="docker exec -i copiloto-postgres psql" \
#   KB_TARGET_DATABASE_URL="postgresql://copiloto_owner:copiloto_owner_dev@localhost:5432/copiloto_clinico" \
#   scripts/kb-import.sh base.sql.gz
set -euo pipefail

cd "$(dirname "$0")/.."
# shellcheck source=scripts/kb-db-guard.sh
source scripts/kb-db-guard.sh

INPUT="${1:?Uso: scripts/kb-import.sh <arquivo.sql.gz>}"
require_local_database "${KB_TARGET_DATABASE_URL:-}" KB_TARGET_DATABASE_URL
read -r -a PSQL_COMMAND <<<"${PSQL:-psql}"
echo "Banco de destino: $(database_label "$KB_TARGET_DATABASE_URL")"

# O dump zera o search_path: depois dele, toda tabela vai qualificada com public.
{
  echo "SET client_min_messages = warning;"
  echo "SET session_replication_role = replica;"
  echo "TRUNCATE public.guideline_chunks, public.official_guideline_documents;"
  gunzip -c "$INPUT"
  echo "SET session_replication_role = origin;"
  # O avaliador roda como médico sem instituição: trecho institucional nunca seria
  # recuperado, e a instituição dona dele não existe aqui (FK quebrada).
  echo "DELETE FROM public.guideline_chunks WHERE institution_id IS NOT NULL;"
  echo "SELECT status, count(*) AS trechos, count(embedding) AS com_embedding FROM public.guideline_chunks GROUP BY status ORDER BY status;"
} | "${PSQL_COMMAND[@]}" "$KB_TARGET_DATABASE_URL" --single-transaction -v ON_ERROR_STOP=1 --quiet

echo "✓ Base de conhecimento importada. Para o retrieval não servir resultado antigo, limpe o cache (60 s) ou espere um minuto."
