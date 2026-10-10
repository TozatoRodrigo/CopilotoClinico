#!/usr/bin/env bash
# F0-A — Guarda compartilhada pelos scripts de base de conhecimento (kb-*.sh):
# só aceita banco local. Mesma lista de evals/clinical/db-safety.ts — o nome
# do banco de PRODUÇÃO no compose (copiloto-db) fica de fora de propósito.
#
# Uso (dentro de outro script): source scripts/kb-db-guard.sh; require_local_database "$URL" "NOME_DA_VARIAVEL"

LOCAL_DATABASE_HOSTS=(localhost 127.0.0.1 ::1 "[::1]" postgres copiloto-postgres copiloto-demo-postgres)

database_host() {
  # postgresql://user:senha@HOST:porta/banco?params → HOST
  local without_scheme="${1#*://}"
  local authority="${without_scheme%%/*}"
  local host_port="${authority##*@}"
  if [[ "$host_port" == \[* ]]; then
    echo "${host_port%%]*}]"
  else
    echo "${host_port%%:*}"
  fi
}

database_label() {
  # Para o terminal: nunca imprime a senha.
  local without_scheme="${1#*://}"
  local authority="${without_scheme%%/*}"
  local user="${authority%%@*}"
  user="${user%%:*}"
  local rest="${without_scheme#*@}"
  echo "${user}@${rest%%\?*}"
}

require_local_database() {
  local url="$1" variable="$2" host
  if [[ -z "$url" ]]; then
    echo "Defina $variable." >&2
    exit 1
  fi
  host="$(database_host "$url")"
  for allowed in "${LOCAL_DATABASE_HOSTS[@]}"; do
    if [[ "$host" == "$allowed" ]]; then
      return 0
    fi
  done
  echo "$variable aponta para \"$host\", que não é um banco local. Este script só escreve em banco local." >&2
  exit 1
}
