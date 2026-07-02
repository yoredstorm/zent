#!/usr/bin/env bash
#
# Funciones compartidas para bajar el stack Zent (install --reset, uninstall, Dokploy).
# Uso: source "$(dirname "$0")/lib/teardown.sh"
#
# Variables opcionales antes de llamar:
#   ZENT_COMPOSE_FILE      (default: docker-compose.prod.yml)
#   ZENT_ENV_FILE          (default: .env)
#   ZENT_CRED_FILE         (default: credenciales-zent.txt)
#   ZENT_COMPOSE_PROJECT   (prefijo Dokploy; vacío = solo proyecto por defecto + conocidos)
#   ZENT_TEARDOWN_KEEP_ENV (true = no borrar .env ni credenciales)
#

ZENT_PROD_VOLUMES=(
  zent_postgres_prod
  zent_redis_prod
  zent_openwa_prod
  zent_uploads_prod
  zent_loki_data
  zent_prometheus_data
  zent_grafana_data
  infra_openwa_data
)

zent_remove_orphan_compose_containers() {
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

zent_teardown_compose() {
  local prune_images="${1:-false}"
  local compose_file="${ZENT_COMPOSE_FILE:-docker-compose.prod.yml}"
  local project="${ZENT_COMPOSE_PROJECT:-}"
  local down_opts=(-f "$compose_file" down -v --remove-orphans)
  if [ "$prune_images" = true ]; then
    down_opts+=(--rmi local)
  fi

  echo "==> Bajando stack y eliminando contenedores..."
  docker compose "${down_opts[@]}" 2>/dev/null || true

  local -a projects=()
  [ -n "$project" ] && projects+=("$project")
  projects+=(tienda-zent-zent-zb9noo zent-zent-siqm8r infra)

  local p seen=""
  for p in "${projects[@]}"; do
    [ -n "$p" ] || continue
    case " $seen " in
      *" $p "*) continue ;;
    esac
    seen="$seen $p"
    docker compose -p "$p" "${down_opts[@]}" 2>/dev/null || true
  done
}

zent_teardown_volumes() {
  echo "==> Eliminando volumenes Zent..."
  local vol
  for vol in "${ZENT_PROD_VOLUMES[@]}"; do
    docker volume rm -f "$vol" 2>/dev/null || true
  done
  docker volume ls -q | grep -E 'zent|tienda-zent' | while read -r vol; do
    [ -n "$vol" ] || continue
    docker volume rm -f "$vol" 2>/dev/null || true
  done
}

zent_teardown_env_files() {
  local env_file="${ZENT_ENV_FILE:-.env}"
  local cred_file="${ZENT_CRED_FILE:-credenciales-zent.txt}"
  if [ -f "$env_file" ]; then
    rm -f "$env_file"
    echo "==> Eliminado $env_file"
  fi
  if [ -f "$cred_file" ]; then
    rm -f "$cred_file"
    echo "==> Eliminado $cred_file"
  fi
}

zent_teardown_all() {
  local prune_images="${1:-false}"
  zent_teardown_compose "$prune_images"
  zent_teardown_volumes
  if [ "${ZENT_TEARDOWN_KEEP_ENV:-false}" != true ]; then
    zent_teardown_env_files
  fi
  zent_remove_orphan_compose_containers
}
