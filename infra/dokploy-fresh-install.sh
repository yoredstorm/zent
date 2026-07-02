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
# No borra .env ni credenciales (prep deploy, no desinstalacion completa).
#
set -euo pipefail

cd "$(dirname "$0")"
# shellcheck source=lib/teardown.sh
source "$(dirname "$0")/lib/teardown.sh"

PROJECT="${1:-}"
export ZENT_COMPOSE_PROJECT="$PROJECT"
export ZENT_TEARDOWN_KEEP_ENV=true

zent_teardown_compose false
zent_teardown_volumes

echo ""
echo "==> Listo. Volúmenes Zent restantes (deberia estar vacio):"
docker volume ls | grep -E 'zent|tienda-zent' || echo "  (ninguno)"
echo ""
echo "Siguiente paso: crea/redeploy el proyecto en Dokploy y abre :8080/setup"
