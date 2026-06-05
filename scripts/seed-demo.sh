#!/bin/bash
set -e

API_URL="${1:-http://localhost:3000/v1}"

echo "=== Seeding Demo Data ==="

echo "Registering demo physician..."
REGISTER_RESPONSE=$(curl -s -X POST "$API_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "demo@copiloto.clinica",
    "password": "Demo@2026!",
    "crmUf": "SP",
    "crmNumber": "123456",
    "name": "Dr. Demo"
  }')

TOKEN=$(echo "$REGISTER_RESPONSE" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "Registration may have failed. Trying login..."
  LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/auth/login" \
    -H "Content-Type: application/json" \
    -d '{
      "email": "demo@copiloto.clinica",
      "password": "Demo@2026!"
    }')
  TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)
fi

if [ -z "$TOKEN" ]; then
  echo "Error: Could not obtain auth token."
  exit 1
fi

echo "Token obtained: ${TOKEN:0:20}..."

echo "Creating encounter..."
ENCOUNTER=$(curl -s -X POST "$API_URL/encounters" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "patientRef": "PAC-001",
    "vertical": "trauma",
    "context": { "hasCT": true, "isSus": true, "hasLab": true, "hasICU": false }
  }')
echo "Encounter created: $(echo "$ENCOUNTER" | head -c 120)..."

echo "Granting consent..."
curl -s -X POST "$API_URL/lgpd/consent" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"scope": "ai_processing"}'

echo ""
echo "=== Demo Data Seeded ==="
echo "Login: demo@copiloto.clinica / Demo@2026!"
