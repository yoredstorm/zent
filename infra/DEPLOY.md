# Verificación post-deploy (VPS / Dokploy)

## Instalacion limpia en Dokploy (antes del primer deploy)

En el **servidor VPS** (Terminal Dokploy o SSH con `sudo`), desde la carpeta del repo:

```bash
cd infra
chmod +x dokploy-fresh-install.sh
./dokploy-fresh-install.sh
```

Eso hace `compose down -v`, borra volúmenes `zent_*` legacy y cualquier volumen `*zent*` / `tienda-zent*`. **No toca** contenedores de Dokploy (`dokploy-postgres`, `dokploy-traefik`, etc.).

Luego crea el proyecto en Dokploy y deploy. Con el compose actual, cada proyecto nuevo tiene volúmenes aislados por prefijo.

Equivalente local Windows: `./dokploy-fresh-install.ps1`

---

## Upgrade desde db push (instalaciones existentes)

Si la base ya tiene tablas creadas con `db push`, marcar la baseline como aplicada sin ejecutar SQL:

```bash
docker compose exec backend-api npx prisma migrate resolve --applied 20260701120000_init
```

Luego reiniciar `backend-api`; a partir de ahí solo `prisma migrate deploy` al arrancar.

---

## Desinstalación completa

Para **eliminar Zent del servidor sin reinstalar** (contenedores, volúmenes, `.env` y credenciales). No toca Dokploy (`dokploy-postgres`, `dokploy-traefik`, etc.).

```bash
# Linux / VPS
cd infra
chmod +x uninstall.sh
./uninstall.sh
```

```powershell
# Windows
cd infra
.\uninstall.ps1
```

| Objetivo | Comando |
|----------|---------|
| Reinstalar desde cero (nuevos secretos + stack arriba) | `./install.sh --reset` o `.\install.ps1 -Reset` |
| Solo volver a `/setup` sin perder datos | `./reset-setup-flag.sh` |
| **Quitar Zent del servidor** | `./uninstall.sh` |
| Quitar + liberar imágenes locales del compose | `./uninstall.sh --prune-images` |
| Dokploy: quitar stack de un prefijo concreto | `./uninstall.sh --project tienda-zent-xxx` |

Opciones útiles:

- `--force` / `-Force` — sin confirmación interactiva
- `--keep-env` / `-KeepEnv` — conserva `infra/.env` y `credenciales-zent.txt`
- `--prune-images` / `-PruneImages` — borra imágenes construidas localmente (`--rmi local`)

---

## Redeploy en Dokploy no muestra /setup (va a /login)

**Causa:** el contenedor es nuevo, pero Docker reutilizaba volúmenes con **nombre fijo global** (`zent_postgres_prod`) de un proyecto Dokploy anterior (`zent-zent-siqm8r`, etc.). En los logs verás:

```
volume "zent_postgres_prod" already exists but was created for project "zent-zent-siqm8r"
```

Eso significa que la DB conserva `installed=true`, tienda `"ohana"`, WhatsApp vinculado, etc.

**Fix en código (compose reciente):** los volúmenes ya no tienen `name:` fijo; cada app Dokploy usa prefijo de proyecto (`tienda-zent-xxx_postgres_prod`) y datos aislados.

**Si aún ves datos viejos tras actualizar:** primero **para los contenedores**, luego borra volúmenes (si no, `volume is in use`):

```bash
# 1) Parar stacks que usan esos volúmenes (ajusta -p si hace falta)
docker compose -p tienda-zent-zent-zb9noo -f infra/docker-compose.prod.yml down 2>/dev/null || true
docker compose -p zent-zent-siqm8r -f infra/docker-compose.prod.yml down 2>/dev/null || true

# 2) Borrar volúmenes legacy (name: fijo zent_*)
docker volume rm -f zent_postgres_prod zent_redis_prod zent_openwa_prod zent_uploads_prod zent_loki_data zent_prometheus_data zent_grafana_data 2>/dev/null || true
```

Si `permission denied` en docker: usa la **Terminal de Dokploy** (ya tiene permisos) o `sudo` con la contraseña del usuario `administrator` del VPS (no la de Dokploy).

**Sin borrar volúmenes** (más rápido): ver [Reset solo flag setup](#reset-solo-flag-setup) abajo.

Luego redeploy desde Dokploy.

**Solución rápida (elige una):**

| Opción | Qué hacer |
|--------|-----------|
| A — Env (1 redeploy) | En Dokploy Environment: `SETUP_FORCE_RESET=true` → Redeploy → completa `/setup` → pon `false` y redeploy |
| B — Env si ya tienes `ADMIN_FORCE_RESET=true` | Con el código reciente, `ADMIN_FORCE_RESET=true` también reabre `/setup` al arrancar el API. Tras el setup, pon `ADMIN_FORCE_RESET=false` |
| C — Terminal | Ver sección [Reset completo](#reset-completo-empezar-de-cero) → `reset-setup-flag.sh` |
| D — Borrar DB | `docker volume rm -f zent_postgres_prod` y redeploy |

Comprobar en Terminal:

```bash
curl -s http://localhost:3001/api/setup/status
# Si "installed":true → por eso redirige a /login
```

## Reset solo flag setup

Sin borrar volúmenes ni parar todo el stack. En **Terminal de Dokploy** (recomendado; evita `permission denied` en SSH/Termux):

```bash
docker exec $(docker ps -qf name=postgres | head -1) psql -U inventario -d inventario \
  -c 'UPDATE system_install SET installed = false, "installedAt" = NULL;'
docker restart $(docker ps -qf name=backend-api | head -1) $(docker ps -qf name=frontend | head -1)
curl -s http://localhost:3001/api/setup/status
```

Debe mostrar `"installed": false`. Luego abre `:8080/setup`.

---

## Reset completo (empezar de cero)

Borra **todos** los contenedores y volúmenes del stack. Pierdes: DB, sesión WhatsApp, uploads, dashboards Grafana.

**Instalación local / VPS con scripts** (recomendado):

```powershell
# Windows (producción local)
cd infra
.\install.ps1 -HostName localhost -Reset
```

```bash
# Linux / VPS
cd infra
./install.sh localhost --reset
```

Con `-Reset` / `--reset` se baja el stack, eliminan volúmenes, borran `.env` y `credenciales-zent.txt`, y se regeneran secretos. El asistente vuelve a estar en `/setup`. Usa `-Force` / `--force` para omitir la confirmación.

**Dokploy (VPS) — volver a `/setup` sin borrar volúmenes a mano:**

1. En Environment de Dokploy añade `SETUP_FORCE_RESET=true` (requiere deploy con código reciente)
2. Redeploy del proyecto
3. Abre `:8080/setup`
4. Quita `SETUP_FORCE_RESET` o ponla en `false` y redeploy de nuevo

**Alternativa rápida (Terminal Dokploy):**

```bash
cd infra   # o la carpeta del compose en el VPS
./reset-setup-flag.sh
# o manualmente:
docker exec $(docker ps -qf name=postgres) psql -U inventario -d inventario \
  -c 'UPDATE system_install SET installed=false, "installedAt"=NULL;'
docker compose -f docker-compose.prod.yml restart backend-api frontend
```

**Dokploy — instalación totalmente nueva** (borra DB, WhatsApp, uploads):

**Importante:** si la contraseña tiene `@`, en `DATABASE_URL` debe ir codificada como `%40`:

```env
POSTGRES_USER=inventario
POSTGRES_PASSWORD=changeme
POSTGRES_DB=inventario
DATABASE_URL=postgresql://inventario:changeme@postgres:5432/inventario
JWT_SECRET=your-jwt-secret-here
JWT_REFRESH_SECRET=your-refresh-secret-here
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=changeme
ADMIN_FORCE_RESET=true
API_MASTER_KEY=owa_k1_...
OPENWA_API_KEY=owa_k1_...
OPENWA_WEBHOOK_SECRET=webhook-secret-change-me
GF_SECURITY_ADMIN_USER=admin
GF_SECURITY_ADMIN_PASSWORD=changeme
```

Mal: `...changeme@1@postgres...` (el `@` del password rompe la URL).  
Bien: `...changeme%401@postgres...` (si el password contiene `@`, codifícalo como `%40`)

### 2. En Dokploy → Terminal

```bash
# Parar y borrar contenedores del proyecto (ajusta el prefijo si hace falta)
docker ps -a --format '{{.Names}}' | grep -E 'zent|inventario|backend|openwa|grafana|postgres' | xargs -r docker rm -f

# Borrar volúmenes nombrados del stack
docker volume rm -f zent_postgres_prod zent_redis_prod zent_openwa_prod zent_uploads_prod zent_loki_data zent_prometheus_data zent_grafana_data 2>/dev/null || true
```

### 3. Redeploy en Dokploy

Deploy de nuevo. Luego verificar:

```bash
curl -s http://localhost:3001/api/health
curl -s http://localhost:8080/api/health
```

Login: `:8080` con `ADMIN_EMAIL` / `ADMIN_PASSWORD`.  
OpenWA: escanear QR de nuevo en `https://IP:2786` (volumen WA también se borró).

---

## Troubleshooting rápido

### Subir catálogo PDF falla

El dashboard debe usar **`POST /api/uploads/document`** (no `/api/uploads/pdf`). Ese endpoint solo existe para servir el archivo ya subido (`/api/uploads/pdf/{filename}`).

Tras actualizar el frontend, prueba en **Catálogo → Subir PDF**. Límite: 20 MB.

### cAdvisor: `Failed to create existing container`

**No afecta** uploads, WhatsApp, login ni `/setup`. cAdvisor solo alimenta métricas en Grafana/Prometheus.

Aparece tras recrear contenedores (Dokploy, Traefik, stacks viejos): referencias cgroup huérfanas en overlayfs. Puedes **ignorarlo**, reiniciar el contenedor `cadvisor`, o quitar el servicio del compose si no usas métricas de contenedores.

### CPU 0% en Dokploy y login 500

Si Grafana (`:3002`) y Prometheus (`:9090`) responden pero `:3001` no, **`backend-api` no está corriendo** (no es un problema de contraseña del dashboard).

En Dokploy → **Terminal** o SSH:

```bash
docker ps -a --format "table {{.Names}}\t{{.Status}}" | grep -E "backend|bot-worker|postgres"
docker logs $(docker ps -aq -f name=backend-api | head -1) --tail 100
```

| Log | Causa | Solución |
|---|---|---|
| `DATABASE_URL is not set` | Env no llega al contenedor | Pegar env en Dokploy, redeploy |
| `PrismaClientInitializationError` / `password authentication failed` | Password de Postgres en volumen ≠ `DATABASE_URL` | Ver sección Postgres abajo |
| `Error: Cannot find module` / build failed | Build de API falló en VPS | Ver logs de build en Dokploy |
| Contenedor no existe | `docker compose` no levantó backend-api | Revisar deploy logs en Dokploy |

Comprobar desde el VPS:

```bash
curl -s http://localhost:3001/api/health   # debe responder JSON, no "connection refused"
curl -s http://localhost:8080/api/health   # debe ser igual (proxy Next.js)
```

### Postgres: password del volumen no coincide

Si el volumen `zent_postgres_prod` se creó con otra contraseña, cambiar `POSTGRES_PASSWORD` en Dokploy **no actualiza** la DB existente.

**Opción A** — Ajustar `DATABASE_URL` a la contraseña real del volumen (si la recuerdas).

**Opción B** — Reset (borra datos):

```bash
docker rm -f $(docker ps -aq -f name=postgres)
docker volume rm zent_postgres_prod
```

Redeploy con `POSTGRES_PASSWORD=changeme` y `DATABASE_URL=postgresql://inventario:changeme@postgres:5432/inventario`.

### Login dashboard devuelve 500 (no 401)

Un **500** en `:8080` casi siempre significa que el **frontend no puede hablar con `backend-api`**, no que la contraseña sea incorrecta (eso sería **401**).

Comprueba en el VPS:

```bash
docker ps --format "table {{.Names}}\t{{.Status}}" | grep backend-api
curl -s http://localhost:3001/api/health
curl -s http://localhost:8080/api/health
docker logs $(docker ps -q -f name=backend-api) --tail 80
```

| Síntoma | Causa habitual | Solución |
|---|---|---|
| `backend-api` en `Restarting` / `Exited` | `DATABASE_URL` vacía o Postgres caído | Revisar Environment en Dokploy (sin comentarios `#`), redeploy |
| Logs: `PrismaClientInitializationError` | URL de DB incorrecta | `DATABASE_URL=postgresql://inventario:changeme@postgres:5432/inventario` |
| `:3001/api/health` OK pero login 401 | Admin no creado o password vieja | `ADMIN_FORCE_RESET=true` y redeploy |
| `:8080/api/health` 500 y `:3001` falla | API caída | Arreglar `backend-api` primero |

**En Dokploy Environment:** no uses líneas con `#` (comentarios). Algunos paneles las interpretan mal. Pega solo variables `KEY=value`.

### Grafana: "credenciales inválidas"

`GF_SECURITY_ADMIN_PASSWORD` **solo se aplica en el primer arranque** cuando el volumen `zent_grafana_data` está vacío. Si Grafana ya arrancó antes con otra contraseña (p. ej. `admin`), cambiar el env **no actualiza** el login.

**Opción A — reset sin borrar dashboards:**

```bash
docker exec -it $(docker ps -q -f name=grafana) grafana-cli admin reset-admin-password 'TU_NUEVA_PASSWORD'
```

**Opción B — volumen limpio (pierdes dashboards guardados):**

```bash
docker rm -f $(docker ps -q -f name=grafana)
docker volume rm zent_grafana_data
```

Redeploy con `GF_SECURITY_ADMIN_USER=admin` y `GF_SECURITY_ADMIN_PASSWORD=...` en Environment.

---

## 1. Servicios en ejecución

```bash
docker ps --format "table {{.Names}}\t{{.Status}}" | grep -E "backend|bot-worker|openwa|grafana|loki"
```

Todos deben estar `Up` (no `Restarting`).

## 2. Health checks

```bash
curl -s http://${PUBLIC_HOST}:3001/api/health
curl -s http://${PUBLIC_HOST}:3001/health   # bot-worker si expuesto internamente
```

## 3. Login dashboard Zent

- URL: http://${PUBLIC_HOST}:8080
- Credenciales: `ADMIN_EMAIL` / `ADMIN_PASSWORD` de Dokploy
- Con `ADMIN_FORCE_RESET=true` en el primer deploy se sincroniza la contraseña

## 4. Grafana — dashboards y logs

- URL: http://${PUBLIC_HOST}:3002
- Usuario: `GF_SECURITY_ADMIN_USER` (default `admin`)
- Contraseña: `GF_SECURITY_ADMIN_PASSWORD` de Dokploy

### Dashboards precargados (carpeta **Zent**)

Tras redeploy, en **Dashboards → Zent** aparecen:

| Dashboard | Contenido |
|-----------|-----------|
| **Zent - Logs** | API, bot-worker, OpenWA, postgres, frontend, errores globales |
| **Zent - Métricas** | CPU, memoria, red y disco de contenedores (Prometheus/cAdvisor) |

Si no aparecen: redeploy en Dokploy o reinicia el contenedor `grafana`. Los dashboards van **dentro de la imagen** (`infra/monitoring/grafana/Dockerfile`); no dependen de montar carpetas en el servidor.

### Importar manualmente (alternativa)

1. Grafana → **Dashboards** → **New** → **Import**
2. Sube el JSON desde el repo:
   - `infra/monitoring/grafana/dashboards/zent-logs.json`
   - `infra/monitoring/grafana/dashboards/zent-metrics.json`

### Explore → Loki (queries sueltas)

```
{service="backend-api"}
{service="bot-worker"}
{service="openwa"}
{service="backend-api"} |= "Enqueued message"
```

Buscar: `OPENWA_API_KEY validated`, `Webhook registered`, `Enqueued message`

## 5. Prometheus

- URL: http://${PUBLIC_HOST}:9090
- Métricas de contenedores vía cAdvisor

## 6. Probar webhook WhatsApp manualmente

```bash
curl -X POST http://localhost:3001/api/webhooks/openwa \
  -H "Content-Type: application/json" \
  -d '{
    "event": "message.received",
    "sessionId": "TU_SESSION_ID",
    "data": {
      "from": "51999999999@c.us",
      "body": "hola",
      "fromMe": false
    }
  }'
```

Respuesta esperada: `{"status":"queued"}`. Luego revisar logs de `bot-worker` en Grafana.

## 7. WhatsApp en producción

1. OpenWA conectado: https://${PUBLIC_HOST}:2786
2. Webhook registrado automáticamente a `http://backend-api:3000/api/webhooks/openwa`
3. Escribir `hola` o `menu` al número conectado

### OpenWA Redis en producción (mensajes llegan pero el bot no responde)

El stack usa **un solo Redis** (`redis` en compose). OpenWA debe conectarse a él; el modo **contenedor Redis integrado** del panel OpenWA no funciona en Docker Compose (queda **Desconectado**).

**En el compose** (`docker-compose.prod.yml`), el servicio `openwa` debe tener:

```yaml
REDIS_URL: redis://redis:6379
depends_on:
  redis:
    condition: service_healthy
```

**En el panel OpenWA** (https://${PUBLIC_HOST}:2786 → REDIS):

1. Habilitar Redis — ON
2. **Usar contenedor Redis integrado** — OFF
3. URL externa (si el panel la pide): `redis://redis:6379`
4. Habilitar BullMQ — ON
5. Guardar; reiniciar la sesión si lo pide

El badge debe pasar de **Desconectado** a conectado. Al enviar un mensaje, las colas de webhooks deberían incrementar PENDIENTE/COMPLETADO.

**Webhook:** no hace falta registrarlo a mano en la UI. `backend-api` lo registra al arrancar si `OPENWA_API_KEY` está definida.

URL del webhook (interna Docker):

```
http://backend-api:3000/api/webhooks/openwa
```

OpenWA bloquea IPs privadas (172.x) por SSRF. El compose incluye `SSRF_ALLOWED_HOSTS=backend-api` en el servicio `openwa` para permitir esa URL. Si creas el webhook a mano y ves *"Host backend-api resolves to a blocked internal address"*, redeploy con ese env o usa temporalmente la URL pública:

```
http://${PUBLIC_HOST}:3001/api/webhooks/openwa
```

Evento: solo `message.received`.

**Variables en Dokploy** (misma clave en ambos):

```
API_MASTER_KEY=owa_k1_...   # contenedor openwa
OPENWA_API_KEY=owa_k1_...   # backend-api y bot-worker (mismo valor)
OPENWA_WEBHOOK_SECRET=webhook-secret-change-me
```

**Verificación en Grafana (Loki):**

| Query | OK si aparece |
|-------|----------------|
| `{service="backend-api"} \|= "Webhook registered"` | Webhook registrado |
| `{service="backend-api"} \|= "Enqueued message"` | Mensaje recibido de OpenWA |
| `{service="bot-worker"} \|= "WhatsApp bot worker started"` | Worker activo |
| `{service="bot-worker"} \|= "Error processing"` | Bot falló al responder (revisar stack trace) |

**Checklist tras redeploy:**

1. Redeploy en Dokploy con los cambios de `docker-compose.prod.yml`
2. Panel OpenWA → REDIS: integrado OFF, URL `redis://redis:6379`, BullMQ ON → badge **conectado**
3. Loki: `Webhook registered` y `WhatsApp bot worker started` al arrancar
4. Enviar `hola` o `menu` por WhatsApp → Loki debe mostrar `Enqueued message` y respuesta del bot

## 8. OpenWA API key desincronizada

Si el login OpenWA falla con 401:

```bash
docker rm -f zent-docker-esjwmq-openwa-1
docker volume rm zent_openwa_prod
```

Redeploy en Dokploy (con `API_MASTER_KEY` y `OPENWA_API_KEY` en Environment).

---

## CD automático (GitHub Actions → Dokploy)

1. Push/merge a `main` → CI (build + E2E en GitHub Actions)
2. Si CI verde → job `deploy-dokploy` llama el webhook Compose de Dokploy
3. Dokploy hace `git pull` + rebuild según `infra/docker-compose.prod.yml`

**GitHub:** secret `DOKPLOY_DEPLOY_WEBHOOK_URL` (Settings → Secrets → Actions). No commitear la URL.

**Dokploy:** desactivar Auto Deploy nativo del proveedor Git si usas solo el webhook de Actions (evita doble deploy). Rama en General debe coincidir con `main`.

**Probar webhook manualmente:**

```bash
curl -fsS -X POST "$DOKPLOY_DEPLOY_WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: push" \
  -d '{"ref":"refs/heads/main","repository":{"full_name":"OWNER/REPO"},"commits":[{"modified":["README.md"]}]}'
```

---

## Rollback de migraciones

- No hay rollback automático. Para revertir: redeploy de imagen anterior en Dokploy.
- Migraciones Prisma son forward-only en prod; evitar `db push` una vez en migrate.
- Si una migración falló a medias, revisar logs de `backend-api` y estado con `npx prisma migrate status` dentro del contenedor.
