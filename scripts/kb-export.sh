#!/usr/bin/env bash
# F0-A — Exporta SÓ a base de conhecimento: official_guideline_documents e
# guideline_chunks (dados, com embeddings e status de curadoria). Nenhuma tabela de
# paciente, médico, atendimento, interação ou auditoria entra no arquivo.
#
# Serve para rodar o gabarito clínico localmente sobre a MESMA base de produção.
# Rode na máquina que acessa o banco de origem e leve o arquivo para a sua máquina;
# importe com scripts/kb-import.sh (que só escreve em banco local).
#
# Uso:
#   KB_SOURCE_DATABASE_URL=postgresql://... scripts/kb-export.sh base.sql.gz
#
# PG_DUMP troca o binário — útil quando o pg_dump roda dentro do contêiner do banco
# (a URL então é a de dentro do contêiner). Exemplo na VPS:
#   PG_DUMP="docker compose -f docker-compose.prod.yml exec -T copiloto-db pg_dump" \
#   KB_SOURCE_DATABASE_URL="postgresql://$POSTGRES_OWNER_USER:$POSTGRES_OWNER_PASSWORD@localhost:5432/copiloto_clinico" \
#   ../scripts/kb-export.sh ~/backups/kb-$(date +%F).sql.gz
#
# Trechos institucionais (institution_id preenchido, PROT-004) vêm junto, porque o
# pg_dump não filtra linhas; o kb-import.sh os descarta.
set -euo pipefail

OUTPUT="${1:?Uso: scripts/kb-export.sh <arquivo.sql.gz>}"
: "${KB_SOURCE_DATABASE_URL:?Defina KB_SOURCE_DATABASE_URL (leitura basta)}"
read -r -a PG_DUMP_COMMAND <<<"${PG_DUMP:-pg_dump}"

# A ordem das tabelas no dump segue as dependências (documentos antes dos trechos).
"${PG_DUMP_COMMAND[@]}" \
  --data-only \
  --no-owner \
  --no-privileges \
  --table=public.official_guideline_documents \
  --table=public.guideline_chunks \
  "$KB_SOURCE_DATABASE_URL" | gzip >"$OUTPUT"

echo "✓ Base de conhecimento exportada para $OUTPUT ($(du -h "$OUTPUT" | cut -f1))."
