#!/usr/bin/env bash
#
# Zent - Desinstalador completo (Linux / VPS).
# Elimina contenedores, volumenes, secretos locales e imagenes locales opcionales.
# NO reinstala el stack.
#
# Uso:
#   ./uninstall.sh [--force] [--keep-env] [--prune-images] [--project <prefijo-dokploy>]
#
set -euo pipefail

cd "$(dirname "$0")"
# shellcheck source=lib/teardown.sh
source "$(dirname "$0")/lib/teardown.sh"

DO_FORCE=false
KEEP_ENV=false
PRUNE_IMAGES=false
PROJECT=""

while [ $# -gt 0 ]; do
  case "$1" in
    --force) DO_FORCE=true; shift ;;
    --keep-env) KEEP_ENV=true; shift ;;
    --prune-images) PRUNE_IMAGES=true; shift ;;
    --project)
      [ $# -ge 2 ] || { echo "Falta valor para --project"; exit 1; }
      PROJECT="$2"
      shift 2
      ;;
    -h|--help)
      echo "Uso: ./uninstall.sh [--force] [--keep-env] [--prune-images] [--project <prefijo>]"
      exit 0
      ;;
    -*) echo "Opcion desconocida: $1"; exit 1 ;;
    *) echo "Argumento inesperado: $1"; exit 1 ;;
  esac
done

export ZENT_COMPOSE_PROJECT="$PROJECT"
if [ "$KEEP_ENV" = true ]; then
  export ZENT_TEARDOWN_KEEP_ENV=true
fi

echo ""
echo "ADVERTENCIA: esto elimina Zent por completo (DB, WhatsApp, uploads, Grafana, metricas)."
if [ "$KEEP_ENV" = true ]; then
  echo "  Se conservaran .env y credenciales-zent.txt (--keep-env)."
fi
if [ "$PRUNE_IMAGES" = true ]; then
  echo "  Tambien se eliminaran imagenes Docker construidas localmente por el compose."
fi
echo "  No se tocan contenedores de Dokploy (dokploy-postgres, dokploy-traefik, etc.)."

if [ "$DO_FORCE" != true ]; then
  read -r -p "Escriba SI para continuar: " answer
  if [ "$answer" != "SI" ]; then
    echo "Cancelado."
    exit 1
  fi
fi

zent_teardown_all "$PRUNE_IMAGES"

echo ""
echo "============================================================"
echo "  Zent eliminado del servidor."
if [ "$KEEP_ENV" = true ]; then
  echo "  Secretos conservados en infra/.env"
else
  echo "  Secretos locales eliminados."
fi
echo "  Para volver a instalar: ./install.sh [HOST]"
echo "============================================================"
