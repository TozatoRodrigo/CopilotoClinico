#!/bin/bash
set -e

echo "=== Copiloto Clínico de Plantão — Demo Setup ==="

command -v docker >/dev/null 2>&1 || { echo "Error: Docker is required but not installed."; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "Error: Docker Compose V2 is required."; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

[ -f .env ] || { echo "Creating .env from .env.example..."; cp .env.example .env; }

echo ""
echo "Building and starting services..."
docker compose -f docker/demo.docker-compose.yml up --build -d

echo ""
echo "Waiting for services to be ready..."
sleep 10

echo ""
echo "=== Services Running ==="
echo ""
echo "  Backend:    http://localhost:3000"
echo "  Frontend:   http://localhost:3001"
echo "  MinIO:      http://localhost:9001 (minioadmin/minioadmin)"
echo "  Postgres:   localhost:5432 (copiloto/copiloto_demo)"
echo "  Redis:      localhost:6379"
echo ""
echo "  To seed demo data:  bash scripts/seed-demo.sh"
echo "  To stop:            docker compose -f docker/demo.docker-compose.yml down"
echo "  To reset (wipes DB): docker compose -f docker/demo.docker-compose.yml down -v"
