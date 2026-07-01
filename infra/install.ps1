<#
  Zent - Instalador de un comando (produccion / docker-compose.prod.yml).
  Uso: ./install.ps1 [-HostName <dominio-o-ip>]
#>
param(
  [string]$HostName = "localhost"
)

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

$ComposeFile = "docker-compose.prod.yml"
$EnvFile = ".env"
$script:ResetOpenwa = $false
$script:FreshEnv = $false

function New-Secret([int]$Bytes) {
  $buf = New-Object byte[] $Bytes
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($buf)
  return -join ($buf | ForEach-Object { $_.ToString("x2") })
}

function Set-EnvLine([string]$Content, [string]$Key, [string]$Value) {
  $pattern = "(?m)^$Key=.*$"
  $line = "$Key=$Value"
  if ($Content -match $pattern) {
    return [regex]::Replace($Content, $pattern, $line)
  }
  return ($Content.TrimEnd() + "`n$line`n")
}

function Sync-OpenWaKeysInEnv {
  if (-not (Test-Path $EnvFile)) { return $false }
  $lines = Get-Content $EnvFile
  $openwa = ($lines | Where-Object { $_ -match '^OPENWA_API_KEY=' } | Select-Object -First 1) -replace '^OPENWA_API_KEY=', ''
  if (-not $openwa) { return $false }
  $master = ($lines | Where-Object { $_ -match '^API_MASTER_KEY=' } | Select-Object -First 1) -replace '^API_MASTER_KEY=', ''
  if ($master -eq $openwa) { return $false }
  $content = Get-Content $EnvFile -Raw
  $content = Set-EnvLine $content 'API_MASTER_KEY' $openwa
  Set-Content -Path $EnvFile -Value $content -Encoding UTF8 -NoNewline
  Write-Host "==> API_MASTER_KEY sincronizada con OPENWA_API_KEY"
  return $true
}

function Reset-OpenWaVolume {
  Write-Host "==> Reiniciando OpenWA con clave API sincronizada..."
  docker compose -f $ComposeFile stop openwa 2>$null
  docker compose -f $ComposeFile rm -f openwa 2>$null
  docker volume rm zent_openwa_prod -f 2>$null
  docker volume rm infra_openwa_data -f 2>$null
}

if (-not (Test-Path $EnvFile)) {
  $script:FreshEnv = $true
  $script:ResetOpenwa = $true
  Write-Host "==> Generando $EnvFile con secretos seguros..."

  $PgUser = "inventario"
  $PgDb = "inventario"
  $PgPass = New-Secret 24
  $Jwt = New-Secret 32
  $JwtRefresh = New-Secret 32
  $OpenwaKey = "owa_k1_" + (New-Secret 32)
  $WebhookSecret = New-Secret 24
  $GrafanaPass = New-Secret 12
  $DatabaseUrl = "postgresql://${PgUser}:${PgPass}@postgres:5432/${PgDb}"

  $content = @"
POSTGRES_USER=$PgUser
POSTGRES_PASSWORD=$PgPass
POSTGRES_DB=$PgDb
DATABASE_URL=$DatabaseUrl

JWT_SECRET=$Jwt
JWT_REFRESH_SECRET=$JwtRefresh

ADMIN_FORCE_RESET=false

API_MASTER_KEY=$OpenwaKey
OPENWA_API_KEY=$OpenwaKey
OPENWA_WEBHOOK_SECRET=$WebhookSecret
BOT_PLUGIN_SECRET=$WebhookSecret
ZENT_FLOW_PLUGIN_ENABLED=true

STORE_NAME=Zent
CART_HOLD_TTL_MINUTES=30
CART_HOLD_WARN_MINUTES=5
VENDOR_NOTIFY_PHONES=

PUBLIC_API_URL=http://${HostName}:3001/api

GF_SECURITY_ADMIN_USER=admin
GF_SECURITY_ADMIN_PASSWORD=$GrafanaPass
"@

  Set-Content -Path $EnvFile -Value $content -Encoding UTF8
  Copy-Item -Path $EnvFile -Destination "credenciales-zent.txt" -Force
}
else {
  Write-Host "==> $EnvFile existe; sincronizando claves OpenWA..."
  if (Sync-OpenWaKeysInEnv) { $script:ResetOpenwa = $true }
}

if ($script:ResetOpenwa -and -not $script:FreshEnv) {
  Reset-OpenWaVolume
}

Write-Host "==> Levantando stack..."
docker compose -f $ComposeFile up -d --build

if ($script:FreshEnv) {
  Reset-OpenWaVolume
  docker compose -f $ComposeFile up -d openwa
  Start-Sleep -Seconds 20
}

Write-Host ""
Write-Host "============================================================"
Write-Host "  Asistente: http://${HostName}:8080/setup"
Write-Host "============================================================"
