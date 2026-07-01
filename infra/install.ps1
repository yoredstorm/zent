<#
  Zent - Instalador de un comando (produccion / docker-compose.prod.yml).
  Uso: ./install.ps1 [-HostName <dominio-o-ip>] [-Reset] [-Force]
#>
param(
  [string]$HostName = "localhost",
  [switch]$Reset,
  [switch]$Force
)

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

$ComposeFile = "docker-compose.prod.yml"
$EnvFile = ".env"
$CredFile = "credenciales-zent.txt"
$script:ResetOpenwa = $false
$script:FreshEnv = $false
$script:DidFullReset = $false

$ProdVolumes = @(
  'zent_postgres_prod',
  'zent_redis_prod',
  'zent_openwa_prod',
  'zent_uploads_prod',
  'zent_loki_data',
  'zent_prometheus_data',
  'zent_grafana_data',
  'infra_openwa_data'
)

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

function Write-CredentialsFile([string]$EnvContent) {
  $header = @"
# --- CREDENCIALES ZENT - generado automaticamente ---
# NO subir a git. Guarda este archivo en un lugar seguro.
# SSRF_ALLOWED_HOSTS=backend-api (fijado en docker-compose, no en .env)

"@
  Set-Content -Path $CredFile -Value ($header + $EnvContent) -Encoding UTF8
}

function Merge-MissingEnvDefaults([string]$Content, [string]$TargetHost) {
  $defaults = [ordered]@{
    REDIS_HOST = "redis"
    REDIS_PORT = "6379"
    REDIS_URL = "redis://redis:6379"
    REDIS_ENABLED = "true"
    REDIS_BUILTIN = "false"
    QUEUE_ENABLED = "true"
    OPENWA_BASE_URL = "http://openwa:2785"
    OPENWA_WEBHOOK_URL = "http://backend-api:3000/api/webhooks/openwa"
    OPENWA_PUBLIC_URL = "https://${TargetHost}:2786"
    CART_HOLD_TTL_MINUTES = "30"
    CART_HOLD_WARN_MINUTES = "5"
    ADMIN_FORCE_RESET = "false"
    GF_SECURITY_ADMIN_USER = "admin"
  }
  foreach ($key in $defaults.Keys) {
    if ($Content -notmatch "(?m)^$key=") {
      $Content = Set-EnvLine $Content $key $defaults[$key]
    }
  }
  return $Content
}

function Sync-OpenWaKeysInEnv {
  if (-not (Test-Path $EnvFile)) { return $false }
  $content = Get-Content $EnvFile -Raw
  $openwa = ""
  if ($content -match "(?m)^OPENWA_API_KEY=(.+)$") { $openwa = $Matches[1].Trim() }
  if (-not $openwa) { return $false }
  $master = ""
  if ($content -match "(?m)^API_MASTER_KEY=(.+)$") { $master = $Matches[1].Trim() }
  if ($master -eq $openwa) {
    $content = Merge-MissingEnvDefaults $content $HostName
    Set-Content -Path $EnvFile -Value $content -Encoding UTF8 -NoNewline
    Write-CredentialsFile $content
    return $false
  }
  $content = Set-EnvLine $content 'API_MASTER_KEY' $openwa
  $content = Merge-MissingEnvDefaults $content $HostName
  Set-Content -Path $EnvFile -Value $content -Encoding UTF8 -NoNewline
  Write-CredentialsFile $content
  Write-Host "==> API_MASTER_KEY sincronizada con OPENWA_API_KEY"
  return $true
}

function Remove-OrphanComposeContainers {
  $ids = docker ps -aq --filter "status=created" 2>$null
  if (-not $ids) { return }
  foreach ($id in $ids) {
    $name = docker inspect -f '{{.Name}}' $id 2>$null
    if ($name -match 'infra-') {
      Write-Host "==> Eliminando contenedor huerfano: $name"
      docker rm -f $id 2>$null | Out-Null
    }
  }
}

function Reset-OpenWaVolume {
  Write-Host "==> Reiniciando OpenWA con clave API sincronizada..."
  docker compose -f $ComposeFile stop openwa 2>$null
  docker compose -f $ComposeFile rm -f openwa 2>$null
  docker volume rm zent_openwa_prod -f 2>$null
  docker volume rm infra_openwa_data -f 2>$null
}

function Reset-FullStack {
  Write-Host ""
  Write-Host "ADVERTENCIA: -Reset borra DB, sesion WhatsApp, uploads, Grafana y metricas."
  if (-not $Force) {
    $answer = Read-Host "Escriba SI para continuar"
    if ($answer -ne 'SI') {
      Write-Host "Cancelado."
      exit 1
    }
  }
  Write-Host "==> Bajando stack y eliminando volúmenes..."
  docker compose -f $ComposeFile down -v --remove-orphans 2>$null
  foreach ($vol in $ProdVolumes) {
    docker volume rm $vol -f 2>$null | Out-Null
  }
  if (Test-Path $EnvFile) {
    Remove-Item $EnvFile -Force
    Write-Host "==> Eliminado $EnvFile"
  }
  if (Test-Path $CredFile) {
    Remove-Item $CredFile -Force
    Write-Host "==> Eliminado $CredFile"
  }
  Remove-OrphanComposeContainers
  $script:DidFullReset = $true
  $script:FreshEnv = $true
  $script:ResetOpenwa = $true
}

if ($Reset) {
  Reset-FullStack
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

REDIS_HOST=redis
REDIS_PORT=6379
REDIS_URL=redis://redis:6379
REDIS_ENABLED=true
REDIS_BUILTIN=false
QUEUE_ENABLED=true

JWT_SECRET=$Jwt
JWT_REFRESH_SECRET=$JwtRefresh

ADMIN_FORCE_RESET=false

API_MASTER_KEY=$OpenwaKey
OPENWA_API_KEY=$OpenwaKey
OPENWA_BASE_URL=http://openwa:2785
OPENWA_WEBHOOK_URL=http://backend-api:3000/api/webhooks/openwa
OPENWA_WEBHOOK_SECRET=$WebhookSecret
OPENWA_PUBLIC_URL=https://${HostName}:2786

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
  Write-CredentialsFile $content
}
else {
  Write-Host "==> $EnvFile existe; sincronizando claves OpenWA..."
  if (Sync-OpenWaKeysInEnv) { $script:ResetOpenwa = $true }
}

if ($script:ResetOpenwa -and -not $script:FreshEnv) {
  Reset-OpenWaVolume
}

Write-Host "==> Levantando stack..."
Remove-OrphanComposeContainers
docker compose -f $ComposeFile up -d --build

if ($script:FreshEnv) {
  Reset-OpenWaVolume
  docker compose -f $ComposeFile up -d openwa
  Start-Sleep -Seconds 20
}

Write-Host ""
Write-Host "============================================================"
if ($script:DidFullReset) {
  Write-Host "  Instalacion limpia: datos anteriores eliminados."
}
Write-Host "  Credenciales completas: infra/$CredFile"
Write-Host "  OpenWA (Redis + webhooks): se aplica al completar /setup"
Write-Host "  Asistente: http://${HostName}:8080/setup"
Write-Host "============================================================"
