#!/usr/bin/env bash
#
# Instalacion limpia en VPS / Dokploy: para contenedores Zent y borra volúmenes.
# Ejecutar UNA VEZ antes del primer deploy o cuando quieras empezar de cero.
#
# Uso:
#   ./dokploy-fresh-install.sh [COMPOSE_PROJECT]
#
# COMPOSE_PROJECT = prefijo Dokploy (ej. tienda-zent-zent-zb9noo). Opcional.
# Si no se pasa, solo borra volúmenes legacy zent_* y los que coincidan con *zent*.
#
set -euo pipefail

cd "$(dirname "$0")"

COMPOSE_FILE="docker-compose.prod.yml"
PROJECT="${1:-}"

echo "==> Parando stacks Zent conocidos (ignora errores si no existen)..."
for p in "$PROJECT" tienda-zent-zent-zb9noo zent-zent-siqm8r infra; do
  [ -n "$p" ] || continue
  docker compose -p "$p" -f "$COMPOSE_FILE" down -v --remove-orphans 2>/dev/null || true
done

echo "==> Eliminando volúmenes legacy zent_* ..."
for v in zent_postgres_prod zent_redis_prod zent_openwa_prod zent_uploads_prod \
  zent_loki_data zent_prometheus_data zent_grafana_data infra_openwa_data; do
  docker volume rm -f "$v" 2>/dev/null || true
done

echo "==> Eliminando volúmenes de proyectos Dokploy (*zent*) ..."
docker volume ls -q | grep -E 'zent|tienda-zent' | while read -r vol; do
  docker volume rm -f "$vol" 2>/dev/null || true
done

echo ""
echo "==> Listo. Volúmenes Zent restantes (deberia estar vacio):"
docker volume ls | grep -E 'zent|tienda-zent' || echo "  (ninguno)"
echo ""
echo "Siguiente paso: crea/redeploy el proyecto en Dokploy y abre :8080/setup"
