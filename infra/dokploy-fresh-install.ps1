<#
  Instalacion limpia en VPS / Dokploy: para stacks Zent y borra volumenes.
  Uso: ./dokploy-fresh-install.ps1 [-ComposeProject <prefijo-dokploy>]
  No borra .env ni credenciales (prep deploy, no desinstalacion completa).
#>
param([string]$ComposeProject = "")

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
. "$PSScriptRoot\lib\teardown.ps1"

$ComposeFile = "docker-compose.prod.yml"

Invoke-ZentTeardownCompose -ComposeFile $ComposeFile -ComposeProject $ComposeProject
Invoke-ZentTeardownVolumes

Write-Host ""
Write-Host "==> Listo. Volúmenes Zent restantes (deberia estar vacio):"
docker volume ls | Select-String -Pattern 'zent|tienda-zent' | ForEach-Object { $_.Line }
if (-not (docker volume ls -q | Where-Object { $_ -match 'zent|tienda-zent' })) {
  Write-Host "  (ninguno)"
}
Write-Host ""
Write-Host "Siguiente paso: crea/redeploy el proyecto en Dokploy y abre :8080/setup"
