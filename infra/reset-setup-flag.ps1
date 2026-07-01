<#
  Marca el sistema como NO instalado para volver a mostrar /setup.
  No borra datos de productos/pedidos; solo system_install.installed.

  Uso (local / prod compose):
    ./reset-setup-flag.ps1

  Dokploy (Terminal del proyecto):
    docker exec $(docker ps -qf name=postgres) psql -U inventario -d inventario -c "UPDATE system_install SET installed=false, \"installedAt\"=NULL;"
#>
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$pg = docker ps -qf "name=postgres" | Select-Object -First 1
if (-not $pg) {
  Write-Error "No hay contenedor postgres en ejecucion."
}

docker exec $pg psql -U inventario -d inventario -c 'UPDATE system_install SET installed = false, "installedAt" = NULL;'

Write-Host "==> system_install.installed = false"
Write-Host "==> Reinicia backend-api si hace falta: docker compose -f docker-compose.prod.yml restart backend-api"
Write-Host "==> Abre http://localhost:8080/setup"
