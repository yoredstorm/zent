#!/usr/bin/env bash
#
# Zent - Instalador de un comando (Linux / VPS).
# Genera infra/.env con secretos seguros (si no existe), sincroniza API_MASTER_KEY
# con OPENWA_API_KEY, reinicia OpenWA si hace falta, y levanta el stack.
#
# Uso:
#   ./install.sh [HOST]
#
set -euo pipefail

cd "$(dirname "$0")"

COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env"
HOST="${1:-localhost}"
FRESH_ENV=false
RESET_OPENWA=false

gen() { openssl rand -hex "$1"; }

sync_openwa_keys_in_env() {
  [ -f "$ENV_FILE" ] || return 1
  local openwa_key master_key
  openwa_key=$(grep -E '^OPENWA_API_KEY=' "$ENV_FILE" | head -1 | cut -d= -f2- || true)
  [ -n "$openwa_key" ] || return 1
  master_key=$(grep -E '^API_MASTER_KEY=' "$ENV_FILE" | head -1 | cut -d= -f2- || true)
  [ "$master_key" = "$openwa_key" ] && return 1
  if grep -qE '^API_MASTER_KEY=' "$ENV_FILE"; then
    if sed --version 2>/dev/null | grep -q GNU; then
      sed -i "s/^API_MASTER_KEY=.*/API_MASTER_KEY=${openwa_key}/" "$ENV_FILE"
    else
      sed -i '' "s/^API_MASTER_KEY=.*/API_MASTER_KEY=${openwa_key}/" "$ENV_FILE"
    fi
  else
    printf '\nAPI_MASTER_KEY=%s\n' "$openwa_key" >> "$ENV_FILE"
  fi
  echo "==> API_MASTER_KEY sincronizada con OPENWA_API_KEY en .env"
  return 0
}

reset_openwa_for_new_key() {
  echo "==> Reiniciando OpenWA para aplicar la clave API (volumen limpio)..."
  docker compose -f "$COMPOSE_FILE" stop openwa 2>/dev/null || true
  docker compose -f "$COMPOSE_FILE" rm -f openwa 2>/dev/null || true
  docker volume rm zent_openwa_prod 2>/dev/null || true
  docker volume rm infra_openwa_data 2>/dev/null || true
  RESET_OPENWA=true
}

if [ ! -f "$ENV_FILE" ]; then
  FRESH_ENV=true
  RESET_OPENWA=true
  echo "==> Generando $ENV_FILE con secretos seguros..."

  POSTGRES_USER="inventario"
  POSTGRES_DB="inventario"
  POSTGRES_PASSWORD="$(gen 24)"
  JWT_SECRET="$(gen 32)"
  JWT_REFRESH_SECRET="$(gen 32)"
  OPENWA_API_KEY="owa_k1_$(gen 32)"
  OPENWA_WEBHOOK_SECRET="$(gen 24)"
  GF_SECURITY_ADMIN_PASSWORD="$(gen 12)"
  DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}"

  cat > "$ENV_FILE" <<EOF
# ─── Generado automaticamente por install.sh ───
# NO subir este archivo a git. Contiene secretos.

POSTGRES_USER=${POSTGRES_USER}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=${POSTGRES_DB}
DATABASE_URL=${DATABASE_URL}

JWT_SECRET=${JWT_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}

ADMIN_FORCE_RESET=false

API_MASTER_KEY=${OPENWA_API_KEY}
OPENWA_API_KEY=${OPENWA_API_KEY}
OPENWA_WEBHOOK_SECRET=${OPENWA_WEBHOOK_SECRET}
BOT_PLUGIN_SECRET=${OPENWA_WEBHOOK_SECRET}
ZENT_FLOW_PLUGIN_ENABLED=true

STORE_NAME=Zent
CART_HOLD_TTL_MINUTES=30
CART_HOLD_WARN_MINUTES=5
VENDOR_NOTIFY_PHONES=

PUBLIC_API_URL=http://${HOST}:3001/api

GF_SECURITY_ADMIN_USER=admin
GF_SECURITY_ADMIN_PASSWORD=${GF_SECURITY_ADMIN_PASSWORD}
EOF

  chmod 600 "$ENV_FILE"
  cp "$ENV_FILE" "credenciales-zent.txt"
  chmod 600 "credenciales-zent.txt"
  echo "==> Secretos generados. Copia en infra/credenciales-zent.txt"
else
  echo "==> $ENV_FILE ya existe; sincronizando claves OpenWA..."
  if sync_openwa_keys_in_env; then
    RESET_OPENWA=true
  fi
fi

if [ "$RESET_OPENWA" = true ] && [ "$FRESH_ENV" = false ]; then
  reset_openwa_for_new_key
fi

echo "==> Levantando el stack (docker compose up -d --build)..."
docker compose -f "$COMPOSE_FILE" up -d --build

if [ "$FRESH_ENV" = true ]; then
  reset_openwa_for_new_key
  docker compose -f "$COMPOSE_FILE" up -d openwa
  echo "==> Esperando a que OpenWA arranque..."
  sleep 20
fi

echo ""
echo "============================================================"
echo "  Zent esta listo."
echo "  Completa el asistente: http://${HOST}:8080/setup"
echo "  Grafana (logs):        http://${HOST}:3002"
echo "============================================================"
