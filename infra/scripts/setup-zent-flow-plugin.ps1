# OpenWA zent-flow plugin setup (PowerShell)
param(
  [string]$OpenWaBaseUrl = $env:OPENWA_BASE_URL ?? "http://localhost:2785",
  [string]$OpenWaApiKey = $env:OPENWA_API_KEY,
  [string]$BotPluginSecret = $env:BOT_PLUGIN_SECRET ?? $env:OPENWA_WEBHOOK_SECRET ?? "webhook-secret-2024",
  [string]$ZentApiUrl = $env:ZENT_API_URL ?? "http://backend-api:3000"
)

$ErrorActionPreference = "Stop"
if (-not $OpenWaApiKey) { throw "OPENWA_API_KEY is required" }

$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$pluginsDir = Join-Path $root "plugins"
$zip = Join-Path $pluginsDir "zent-flow.zip"
$configPath = Join-Path $pluginsDir "zent-flow\config\default.json"
$headers = @{ "X-API-Key" = $OpenWaApiKey }

Write-Host "-> Disabling chat-flow..."
try {
  Invoke-RestMethod -Method Post -Uri "$OpenWaBaseUrl/api/plugins/chat-flow/disable" -Headers $headers | Out-Null
} catch {
  Write-Host "   (chat-flow not present or already disabled)"
}

if (-not (Test-Path $zip)) {
  Write-Host "-> Packaging zent-flow..."
  Push-Location $pluginsDir
  npm install --silent
  npm run package:zent-flow
  Pop-Location
}

Write-Host "-> Installing zent-flow..."
$form = @{ file = Get-Item $zip }
try {
  Invoke-RestMethod -Method Post -Uri "$OpenWaBaseUrl/api/plugins/install" -Headers $headers -Form $form | Out-Null
} catch {
  Write-Host "   (may already be installed)"
}

$config = Get-Content $configPath -Raw | ConvertFrom-Json
$config.zentApiUrl = $ZentApiUrl
$config.zentApiSecret = $BotPluginSecret
$body = @{ config = $config } | ConvertTo-Json -Depth 10

Write-Host "-> Updating config..."
Invoke-RestMethod -Method Put -Uri "$OpenWaBaseUrl/api/plugins/zent-flow/config" -Headers (@{ "X-API-Key" = $OpenWaApiKey; "Content-Type" = "application/json" }) -Body $body | Out-Null

Write-Host "-> Enabling zent-flow..."
Invoke-RestMethod -Method Post -Uri "$OpenWaBaseUrl/api/plugins/zent-flow/enable" -Headers $headers | Out-Null

Write-Host "Done. Set ZENT_FLOW_PLUGIN_ENABLED=true on backend-api and bot-worker."
