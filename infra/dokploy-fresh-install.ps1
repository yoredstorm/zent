<#
  Instalacion limpia en VPS / Dokploy: para stacks Zent y borra volumenes.
  Uso: ./dokploy-fresh-install.ps1 [-ComposeProject <prefijo-dokploy>]
#>
param([string]$ComposeProject = "")

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$ComposeFile = "docker-compose.prod.yml"
$projects = @($ComposeProject, "tienda-zent-zent-zb9noo", "zent-zent-siqm8r", "infra") | Where-Object { $_ }

Write-Host "==> Parando stacks Zent..."
foreach ($p in $projects) {
  docker compose -p $p -f $ComposeFile down -v --remove-orphans 2>$null
}

$legacy = @(
  'zent_postgres_prod', 'zent_redis_prod', 'zent_openwa_prod', 'zent_uploads_prod',
  'zent_loki_data', 'zent_prometheus_data', 'zent_grafana_data', 'infra_openwa_data'
)
foreach ($v in $legacy) {
  docker volume rm $v -f 2>$null | Out-Null
}

docker volume ls -q | ForEach-Object {
  if ($_ -match 'zent|tienda-zent') {
    docker volume rm $_ -f 2>$null | Out-Null
  }
}

Write-Host "==> Listo. Redeploy en Dokploy y abre :8080/setup"
