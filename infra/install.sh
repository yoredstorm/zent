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
CRED_FILE="credenciales-zent.txt"
HOST="${1:-localhost}"
FRESH_ENV=false
RESET_OPENWA=false

gen() { openssl rand -hex "$1"; }

write_credentials_file() {
  {
    echo "# ─── CREDENCIALES ZENT — generado automáticamente ───"
    echo "# NO subir a git. Guarda este archivo en un lugar seguro."
    echo "# SSRF_ALLOWED_HOSTS=backend-api (fijado en docker-compose, no en .env)"
    echo ""
    cat "$ENV_FILE"
  } > "$CRED_FILE"
  chmod 600 "$CRED_FILE"
}

merge_missing_env_defaults() {
  local host="$1"
  local tmp
  tmp="$(mktemp)"
  cp "$ENV_FILE" "$tmp"
  upsert_if_missing() {
    local key="$1"
    local val="$2"
    if ! grep -qE "^${key}=" "$tmp"; then
      printf '%s=%s\n' "$key" "$val" >> "$tmp"
    fi
  }
  upsert_if_missing REDIS_HOST redis
  upsert_if_missing REDIS_PORT 6379
  upsert_if_missing REDIS_URL 'redis://redis:6379'
  upsert_if_missing REDIS_ENABLED true
  upsert_if_missing REDIS_BUILTIN false
  upsert_if_missing QUEUE_ENABLED true
  upsert_if_missing OPENWA_BASE_URL 'http://openwa:2785'
  upsert_if_missing OPENWA_WEBHOOK_URL 'http://backend-api:3000/api/webhooks/openwa'
  upsert_if_missing OPENWA_PUBLIC_URL "https://${host}:2786"
  upsert_if_missing CART_HOLD_TTL_MINUTES 30
  upsert_if_missing CART_HOLD_WARN_MINUTES 5
  upsert_if_missing ADMIN_FORCE_RESET false
  upsert_if_missing GF_SECURITY_ADMIN_USER admin
  mv "$tmp" "$ENV_FILE"
}

sync_openwa_keys_in_env() {
  [ -f "$ENV_FILE" ] || return 1
  local openwa_key master_key
  openwa_key=$(grep -E '^OPENWA_API_KEY=' "$ENV_FILE" | head -1 | cut -d= -f2- || true)
  [ -n "$openwa_key" ] || return 1
  master_key=$(grep -E '^API_MASTER_KEY=' "$ENV_FILE" | head -1 | cut -d= -f2- || true)
  merge_missing_env_defaults "$HOST"
  if [ "$master_key" = "$openwa_key" ]; then
    write_credentials_file
    return 1
  fi
  if grep -qE '^API_MASTER_KEY=' "$ENV_FILE"; then
    if sed --version 2>/dev/null | grep -q GNU; then
      sed -i "s/^API_MASTER_KEY=.*/API_MASTER_KEY=${openwa_key}/" "$ENV_FILE"
    else
      sed -i '' "s/^API_MASTER_KEY=.*/API_MASTER_KEY=${openwa_key}/" "$ENV_FILE"
    fi
  else
    printf '\nAPI_MASTER_KEY=%s\n' "$openwa_key" >> "$ENV_FILE"
  fi
  write_credentials_file
  echo "==> API_MASTER_KEY sincronizada con OPENWA_API_KEY en .env"
  return 0
}

remove_orphan_compose_containers() {
  docker ps -aq --filter "status=created" 2>/dev/null | while read -r id; do
    [ -n "$id" ] || continue
    name=$(docker inspect -f '{{.Name}}' "$id" 2>/dev/null || true)
    case "$name" in
      *infra-*)
        echo "==> Eliminando contenedor huerfano: $name"
        docker rm -f "$id" 2>/dev/null || true
        ;;
    esac
  done
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
POSTGRES_USER=${POSTGRES_USER}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=${POSTGRES_DB}
DATABASE_URL=${DATABASE_URL}

REDIS_HOST=redis
REDIS_PORT=6379
REDIS_URL=redis://redis:6379
REDIS_ENABLED=true
REDIS_BUILTIN=false
QUEUE_ENABLED=true

JWT_SECRET=${JWT_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}

ADMIN_FORCE_RESET=false

API_MASTER_KEY=${OPENWA_API_KEY}
OPENWA_API_KEY=${OPENWA_API_KEY}
OPENWA_BASE_URL=http://openwa:2785
OPENWA_WEBHOOK_URL=http://backend-api:3000/api/webhooks/openwa
OPENWA_WEBHOOK_SECRET=${OPENWA_WEBHOOK_SECRET}
OPENWA_PUBLIC_URL=https://${HOST}:2786

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
  write_credentials_file
  echo "==> Secretos generados. Copia en infra/$CRED_FILE"
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
remove_orphan_compose_containers
docker compose -f "$COMPOSE_FILE" up -d --build

if [ "$FRESH_ENV" = true ]; then
  reset_openwa_for_new_key
  docker compose -f "$COMPOSE_FILE" up -d openwa
  echo "==> Esperando a que OpenWA arranque..."
  sleep 20
fi

echo ""
echo "============================================================"
echo "  Credenciales completas: infra/$CRED_FILE"
echo "  OpenWA (Redis + webhooks): se aplica al completar /setup"
echo "  Asistente: http://${HOST}:8080/setup"
echo "  Grafana (logs):        http://${HOST}:3002"
echo "============================================================"
