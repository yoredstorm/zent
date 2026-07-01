<#
  Repara desalineacion OPENWA_API_KEY / API_MASTER_KEY en el stack local.
  Uso: ./fix-openwa-key.ps1
#>
$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

$EnvFile = ".env"
if (-not (Test-Path $EnvFile)) {
  Write-Error "No existe infra/.env. Ejecuta primero ./install-local.ps1"
}

$lines = Get-Content $EnvFile
$openwa = ($lines | Where-Object { $_ -match '^OPENWA_API_KEY=' } | Select-Object -First 1) -replace '^OPENWA_API_KEY=', ''
if (-not $openwa) { Write-Error "OPENWA_API_KEY no definida en .env" }

$content = Get-Content $EnvFile -Raw
if ($content -match '(?m)^API_MASTER_KEY=.*$') {
  $content = [regex]::Replace($content, '(?m)^API_MASTER_KEY=.*$', "API_MASTER_KEY=$openwa")
} else {
  $content = $content.TrimEnd() + "`nAPI_MASTER_KEY=$openwa`n"
}
Set-Content -Path $EnvFile -Value $content -Encoding UTF8 -NoNewline

Write-Host "==> Deteniendo OpenWA y eliminando volumen (sesiones WA se pierden)..."
docker compose -f docker-compose.yml stop openwa
docker compose -f docker-compose.yml rm -f openwa 2>$null
docker volume rm infra_openwa_data -f 2>$null

Write-Host "==> Reiniciando OpenWA y backend..."
docker compose -f docker-compose.yml up -d openwa backend-api bot-worker
Start-Sleep -Seconds 25

Write-Host "==> Verificando clave API..."
try {
  $r = Invoke-RestMethod -Uri "http://localhost:3001/api/setup/status" -TimeoutSec 10
  if ($r.openwaKeyValid) {
    Write-Host "OK: OpenWA acepta OPENWA_API_KEY. Abre http://localhost:3000/setup"
  } else {
    Write-Host "AVISO: openwaKeyValid=false. Revisa logs: docker logs infra-openwa-1"
  }
} catch {
  Write-Host "API aun arrancando. Prueba en unos segundos: curl http://localhost:3001/api/setup/status"
}
