# Funciones compartidas para bajar el stack Zent (install -Reset, uninstall, Dokploy).

$script:ZentProdVolumes = @(
  'zent_postgres_prod',
  'zent_redis_prod',
  'zent_openwa_prod',
  'zent_uploads_prod',
  'zent_loki_data',
  'zent_prometheus_data',
  'zent_grafana_data',
  'infra_openwa_data'
)

function Remove-ZentOrphanComposeContainers {
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

function Invoke-ZentTeardownCompose {
  param(
    [string]$ComposeFile = "docker-compose.prod.yml",
    [string]$ComposeProject = "",
    [switch]$PruneImages
  )

  $downArgs = @("-f", $ComposeFile, "down", "-v", "--remove-orphans")
  if ($PruneImages) {
    $downArgs += "--rmi", "local"
  }

  Write-Host "==> Bajando stack y eliminando contenedores..."
  docker compose @downArgs 2>$null | Out-Null

  $projects = @()
  if ($ComposeProject) { $projects += $ComposeProject }
  $projects += @(
    'tienda-zent-zent-zb9noo',
    'zent-zent-siqm8r',
    'infra'
  )

  $seen = @{}
  foreach ($p in $projects) {
    if (-not $p -or $seen.ContainsKey($p)) { continue }
    $seen[$p] = $true
    docker compose -p $p @downArgs 2>$null | Out-Null
  }
}

function Invoke-ZentTeardownVolumes {
  Write-Host "==> Eliminando volumenes Zent..."
  foreach ($vol in $script:ZentProdVolumes) {
    docker volume rm $vol -f 2>$null | Out-Null
  }
  docker volume ls -q | ForEach-Object {
    if ($_ -match 'zent|tienda-zent') {
      docker volume rm $_ -f 2>$null | Out-Null
    }
  }
}

function Remove-ZentEnvFiles {
  param(
    [string]$EnvFile = ".env",
    [string]$CredFile = "credenciales-zent.txt"
  )

  if (Test-Path $EnvFile) {
    Remove-Item $EnvFile -Force
    Write-Host "==> Eliminado $EnvFile"
  }
  if (Test-Path $CredFile) {
    Remove-Item $CredFile -Force
    Write-Host "==> Eliminado $CredFile"
  }
}

function Invoke-ZentTeardownAll {
  param(
    [string]$ComposeFile = "docker-compose.prod.yml",
    [string]$ComposeProject = "",
    [string]$EnvFile = ".env",
    [string]$CredFile = "credenciales-zent.txt",
    [switch]$KeepEnv,
    [switch]$PruneImages
  )

  Invoke-ZentTeardownCompose -ComposeFile $ComposeFile -ComposeProject $ComposeProject -PruneImages:$PruneImages
  Invoke-ZentTeardownVolumes
  if (-not $KeepEnv) {
    Remove-ZentEnvFiles -EnvFile $EnvFile -CredFile $CredFile
  }
  Remove-ZentOrphanComposeContainers
}
