<#
  Zent - Desinstalador completo (Windows / produccion).
  Elimina contenedores, volumenes, secretos locales e imagenes locales opcionales.
  NO reinstala el stack.

  Uso: ./uninstall.ps1 [-Force] [-KeepEnv] [-PruneImages] [-ComposeProject <prefijo>]
#>
param(
  [switch]$Force,
  [switch]$KeepEnv,
  [switch]$PruneImages,
  [string]$ComposeProject = ""
)

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot
. "$PSScriptRoot\lib\teardown.ps1"

$ComposeFile = "docker-compose.prod.yml"
$EnvFile = ".env"
$CredFile = "credenciales-zent.txt"

Write-Host ""
Write-Host "ADVERTENCIA: esto elimina Zent por completo (DB, WhatsApp, uploads, Grafana, metricas)."
if ($KeepEnv) {
  Write-Host "  Se conservaran .env y credenciales-zent.txt (-KeepEnv)."
}
if ($PruneImages) {
  Write-Host "  Tambien se eliminaran imagenes Docker construidas localmente por el compose."
}
Write-Host "  No se tocan contenedores de Dokploy (dokploy-postgres, dokploy-traefik, etc.)."

if (-not $Force) {
  $answer = Read-Host "Escriba SI para continuar"
  if ($answer -ne 'SI') {
    Write-Host "Cancelado."
    exit 1
  }
}

Invoke-ZentTeardownAll `
  -ComposeFile $ComposeFile `
  -ComposeProject $ComposeProject `
  -EnvFile $EnvFile `
  -CredFile $CredFile `
  -KeepEnv:$KeepEnv `
  -PruneImages:$PruneImages

Write-Host ""
Write-Host "============================================================"
Write-Host "  Zent eliminado del servidor."
if ($KeepEnv) {
  Write-Host "  Secretos conservados en infra/.env"
} else {
  Write-Host "  Secretos locales eliminados."
}
Write-Host "  Para volver a instalar: ./install.ps1 [-HostName <HOST>]"
Write-Host "============================================================"
