#!/usr/bin/env bash
# Marca installed=false para volver a /setup (sin borrar volumenes).
set -euo pipefail
cd "$(dirname "$0")"

PG="$(docker ps -qf 'name=postgres' | head -1)"
if [ -z "$PG" ]; then
  echo "No hay contenedor postgres en ejecucion." >&2
  exit 1
fi

docker exec "$PG" psql -U inventario -d inventario -c \
  'UPDATE system_install SET installed=false, "installedAt"=NULL;'

echo "==> system_install.installed = false"
echo "==> Reinicia backend-api: docker compose -f docker-compose.prod.yml restart backend-api"
echo "==> Abre /setup en el dashboard"
