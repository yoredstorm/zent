# Verificación post-deploy (VPS / Dokploy)

## Produccion: evitar /setup en cada redeploy

Si cada redeploy te manda otra vez al wizard de instalacion, revisa en **Dokploy → Environment**:

```env
ADMIN_FORCE_RESET=false
SETUP_FORCE_RESET=false
```

Con `ADMIN_FORCE_RESET=true` (o `SETUP_FORCE_RESET=true`), al arrancar `backend-api` se ejecuta [`seed.service.ts`](../apps/api/src/seed.service.ts) y pone `system_install.installed = false`. **No borra la base de datos**; solo reabre `/setup`.

| Situacion | `ADMIN_FORCE_RESET` | `SETUP_FORCE_RESET` |
|-----------|---------------------|---------------------|
| Produccion normal | `false` | `false` |
| Primer deploy / sync password admin | `true` **un solo** redeploy | `false` |
| Reabrir wizard sin borrar DB | `false` | `true` **un solo** redeploy |

Tras completar `/setup` o recuperar el sistema, **vuelve ambos a `false`** antes del siguiente redeploy.

Verificar en Terminal de Dokploy:

```bash
curl -s http://localhost:3001/api/setup/status
# "installed": true → login en :8080
# "installed": false → completa /setup una vez con los flags ya en false
```

Plantilla de variables: [`infra/dokploy.env.example`](dokploy.env.example).

### Motor WhatsApp (dashboard vs Dokploy)

| Que | Donde |
|-----|-------|
| Motor activo (`legacy` / `novita` / `n8n`) | Dashboard → Asistente IA → **Guardar y aplicar** |
| Telefonos sandbox n8n, URLs webhook chat | Dashboard |
| API key Novita, playbook | Dashboard |
| Eventos de ventas n8n (sandbox/core) | Dashboard |
| `N8N_WEBHOOK_SECRET`, DB, JWT | Dokploy Environment (secretos) |
| `ADMIN_FORCE_RESET` | Dokploy — solo `false` en produccion |

Tras cambiar el motor en el dashboard, pulsa **Aplicar y sincronizar OpenWA** para que zent-flow deje de mostrar menu numerico cuando uses Novita o n8n.

---

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

### Migracion fallida P3009 (`whatsapp_bot_engine`)

Si `backend-api` reinicia en bucle con:

```
Error: P3009
The `20260704150000_whatsapp_bot_engine` migration ... failed
```

La migracion quedo marcada como fallida en `_prisma_migrations` (suele pasar si se desplego la version con columnas snake_case).

**En el VPS / terminal Dokploy:**

```bash
cd infra
docker compose -f docker-compose.prod.yml exec backend-api npx prisma migrate resolve --rolled-back 20260704150000_whatsapp_bot_engine
docker compose -f docker-compose.prod.yml exec backend-api npx prisma migrate deploy
docker compose -f docker-compose.prod.yml restart backend-api bot-worker
```

Script alternativo (desde el repo en el servidor): `infra/scripts/fix-failed-bot-engine-migration.sh`

Si quedaron columnas **snake_case** de un intento anterior (`whatsapp_bot_engine`, etc.), eliminalas antes del `migrate deploy`:

```sql
ALTER TABLE "store_settings" DROP COLUMN IF EXISTS "whatsapp_bot_engine";
ALTER TABLE "store_settings" DROP COLUMN IF EXISTS "n8n_workflows_enabled";
ALTER TABLE "store_settings" DROP COLUMN IF EXISTS "n8n_webhook_base_url";
ALTER TABLE "store_settings" DROP COLUMN IF EXISTS "n8n_sales_mode";
ALTER TABLE "store_settings" DROP COLUMN IF EXISTS "n8n_chat_scope";
ALTER TABLE "store_settings" DROP COLUMN IF EXISTS "n8n_chat_webhook_url";
ALTER TABLE "store_settings" DROP COLUMN IF EXISTS "n8n_chat_sandbox_phones";
```

Las columnas correctas usan **camelCase** (`whatsappBotEngine`, `n8nChatScope`, ...).

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
| B — Env si `ADMIN_FORCE_RESET=true` por error | Ese flag reabre `/setup` en **cada** arranque del API. Pon `ADMIN_FORCE_RESET=false` y redeploy (ver seccion [Produccion: evitar /setup en cada redeploy](#produccion-evitar-setup-en-cada-redeploy)) |
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
# Solo true en el primer deploy o recuperacion; en produccion debe ser false
ADMIN_FORCE_RESET=false
SETUP_FORCE_RESET=false
PUBLIC_HOST=tu-ip-o-dominio
NEXT_PUBLIC_GRAFANA_URL=http://tu-ip-o-dominio:3002
NEXT_PUBLIC_PROMETHEUS_URL=http://tu-ip-o-dominio:9090
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

### Motor n8n activo pero WhatsApp responde con menú 1-2-3-4

En **WhatsApp → conversación**, revisa el badge de motor (n8n / Menú clásico / Sin ruteo n8n). En logs de `backend-api` o `bot-worker` busca:

```text
Routing engine=n8n effective=... reason=...
```

| `reason` en logs | Significado | Acción |
|---|---|---|
| `sandbox_match` | El teléfono coincide con sandbox | Debe ir a n8n; si ves menú, pulsa **Aplicar y sincronizar OpenWA** (zent-flow con `passThrough=false`) |
| `not_in_sandbox` | Motor n8n pero teléfono no está en la lista | Añade el número en Configuración → Asistente IA → Teléfonos sandbox |
| `phone_unresolved` | JID `@lid` sin teléfono resuelto | Actualiza backend (resolución OpenWA) y reenvía mensaje |
| `n8n_secret_missing` | Falta `N8N_WEBHOOK_SECRET` en Dokploy | Configura el secreto HMAC y redeploy |
| (sin línea Routing) | Worker viejo o mensaje interceptado por zent-flow | Redeploy + **Reparar webhook** en Configuración → WhatsApp |

El panel **Estado de integración** muestra `wouldRoutePhones` por cada teléfono sandbox. "Telefono OK" solo valida el primero de la lista; el inbox muestra el motor efectivo **por conversación**.

Si el chat muestra `Bot: MENU_PRINCIPAL`, la sesión legacy quedó pegada de pruebas anteriores. Con motor n8n y sandbox correcto, los mensajes nuevos deben registrar `mode=n8n_chat` en **Ver actividad del bot**.

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
| `:3001/api/health` OK pero login 401 | Admin no creado o password vieja | `ADMIN_FORCE_RESET=true` en **un** redeploy, completa login; luego `false` |
| Cada redeploy vuelve a `/setup` | `ADMIN_FORCE_RESET=true` o `SETUP_FORCE_RESET=true` en Environment | Pon ambos en `false` y redeploy; ver [Produccion: evitar /setup en cada redeploy](#produccion-evitar-setup-en-cada-redeploy) |
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
- En el **primer** deploy puedes usar `ADMIN_FORCE_RESET=true` una vez para sincronizar la contraseña; luego pon `false` (si queda en `true`, cada redeploy reabre `/setup`)

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

### Dashboard Zent → Observabilidad

El dashboard incluye `/dashboard/observability` para abrir Grafana, Prometheus y ver el panel de logs embebido.

Variables del servicio `frontend`:

| Variable | Uso |
|----------|-----|
| `NEXT_PUBLIC_GRAFANA_URL` | URL pública de Grafana, default `http://${PUBLIC_HOST}:3002` |
| `NEXT_PUBLIC_PROMETHEUS_URL` | URL pública de Prometheus, default `http://${PUBLIC_HOST}:9090` |

Para que el iframe cargue dentro del dashboard, Grafana debe tener:

```env
GF_SECURITY_ALLOW_EMBEDDING=true
```

Si Grafana pide login o el navegador bloquea el frame, usa el botón **Abrir Grafana** desde la misma página.

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

1. Push/merge a `main` o `master` → CI (build + E2E en GitHub Actions)
2. Si CI verde → job `deploy-dokploy` llama el webhook Compose de Dokploy con el watch path centinela `.dokploy/ci-approved-deploy`
3. Dokploy hace `git pull` + rebuild según `infra/docker-compose.prod.yml`

**GitHub:** secret `DOKPLOY_DEPLOY_WEBHOOK_URL` (Settings → Secrets and variables → Actions → Repository secrets). Valor: la URL que muestra Dokploy en el compose, p. ej. `http://TU_IP:3000/api/deploy/compose/TOKEN`. Sin espacios al final.

**Dokploy (obligatorio para que el webhook usado por GitHub Actions funcione):**

1. **Auto Deploy: activado** en el compose (General). Si está apagado, el webhook responde `400` con *"Automatic deployments are disabled for this compose"*.
2. **Rama** en General = la rama real del repo (`master` en este proyecto, no `main` si no la usas).
3. **Watch paths:** poner solo `.dokploy/ci-approved-deploy`. No lo dejes vacío y no incluyas `infra/`, `apps/api` ni `apps/dashboard`, porque eso permite deploy directo al hacer push antes de que termine CI.
4. Opcional extra para evitar llamadas innecesarias: en GitHub → repo → Settings → Webhooks, elimina el webhook directo que Dokploy registró al conectar GitHub. No desactives el toggle **Auto Deploy** del compose, porque el endpoint `/api/deploy/compose/...` que llama GitHub Actions lo requiere activo.

Con esa configuración queda un solo camino:

```text
git push → GitHub Actions CI → deploy-dokploy → Dokploy
```

El webhook directo GitHub→Dokploy puede seguir recibiendo el push, pero con ese watch path no despliega porque el push real no modifica `.dokploy/ci-approved-deploy`. Solo el job `deploy-dokploy` envía ese path en su payload después de que CI pasa.

**Errores frecuentes del webhook:**

| HTTP | Mensaje | Qué hacer |
|------|---------|-----------|
| 400 | Automatic deployments are disabled… | Activar Auto Deploy en el compose |
| 400 | Error deploying Compose | Ver logs de deploy en Dokploy (cola/redis) |
| 301 | Branch Not Match | Rama en Dokploy = `refs/heads/master` (o la que uses) |
| 301 | Watch Paths Not Match | Ajustar watch paths o el payload `commits.modified` |

**Probar webhook manualmente** (desde bash; en PowerShell usa comillas simples en el JSON):

```bash
curl -sS -X POST "$DOKPLOY_DEPLOY_WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: push" \
  -d '{"ref":"refs/heads/master","repository":{"full_name":"yoredstorm/zent"},"head_commit":{"id":"abc123","message":"test"},"commits":[{"modified":["infra/docker-compose.prod.yml"]}]}'
```

Respuesta esperada: `{"message":"Compose deployed successfully"}`

---

## Modo IA vs menu numerico (WhatsApp)

Cuando el asistente IA (Novita) esta activo, el bot debe responder de forma **conversacional**, sin menus 1-2-3-4.

### Como funciona

1. **Dashboard** → Configuracion → Asistente IA: activar asistente + `NOVITA_BOT_ENABLED`, API key y saldo Novita.
2. Al guardar, el backend sincroniza el plugin OpenWA **zent-flow** con `passThrough=true` (no intercepta mensajes).
3. Los mensajes llegan al webhook → worker → `BotAiOrchestratorService`.
4. Si la IA esta configurada pero el saldo no se puede leer o esta bajo, el bot mantiene ruta IA y muestra advertencias en dashboard; no debe volver silenciosamente al menu numerico.

### Checklist post-deploy

1. IA activa en `/dashboard/settings/bot-ai` (badge **Modo: IA conversacional**).
2. Clic en **Sincronizar OpenWA** si aparece advertencia de zent-flow.
3. Reiniciar `backend-api` y `bot-worker` tras cambios de codigo o migraciones.
4. Probar WhatsApp: escribir **Hola** → respuesta conversacional (no menu numerico).
5. Verificar en bandeja que el estado no quede en `SELECCION_CATEGORIA` al saludar.

### Variables relevantes

| Variable | Uso |
|----------|-----|
| `NOVITA_BOT_ENABLED` | Habilita ruta IA en el servidor |
| `NOVITA_API_KEY` | Clave Novita (secreto) |
| `NOVITA_MIN_BALANCE_USD` | Saldo minimo operativo (default `0.01`) |
| `NOVITA_LOW_BALANCE_ALERT_USD` | Umbral para alerta al vendedor (default `3`) |
| `NOVITA_LOW_BALANCE_ALERT_COOLDOWN_MINUTES` | Minutos para no duplicar alertas de saldo bajo |
| `ZENT_FLOW_PLUGIN_ENABLED` | `true` = instalar/sincronizar zent-flow al completar `/setup`, vincular WhatsApp y en bootstrap |

### Diagnostico de inbox y webhook

Si OpenWA muestra mensajes pero el dashboard no muestra conversaciones:

1. Abrir `/dashboard/whatsapp`.
2. Revisar el bloque **Diagnostico** del estado vacio.
3. Verificar:
   - `Ultimo webhook`: debe tener hora reciente.
   - `Estado`: `queued` o `stored`.
   - `Mensajes DB`: mayor que `0` tras recibir mensajes.
   - `Webhook esperado`: `http://backend-api:3000/api/webhooks/openwa`.
4. Usar **Sincronizar recientes** para intentar importar ultimos chats desde OpenWA.

Nota importante:

- `OPENWA_PUBLIC_URL` es para abrir el panel/QR de OpenWA desde tu navegador, por ejemplo `https://77.93.154.87:2786`.
- `OPENWA_WEBHOOK_URL=http://backend-api:3000/api/webhooks/openwa` es correcto dentro de Docker; OpenWA llama al backend por la red interna del compose.
- Si `Ultimo webhook` aparece como `ninguno`, usa **Reparar webhook OpenWA** en la bandeja y luego envia un mensaje nuevo por WhatsApp.

Endpoints utiles:

| Endpoint | Uso |
|----------|-----|
| `GET /whatsapp/diagnostics` | Ultimo webhook, razon ignorada, contadores DB |
| `POST /whatsapp/sync/recent` | Importacion best-effort de chats recientes OpenWA |
| `POST /openwa/repair-webhook` | Revalida API key, infraestructura, webhook y zent-flow |
| `GET /settings/bot-ai/balance?force=1` | Saldo Novita y estado de alerta |

### Plugin zent-flow no encontrado (404)

Si al sincronizar ves `Plugin zent-flow not found`:

1. **Modo IA activo:** no es bloqueante — los mensajes van directo al webhook sin el plugin.
2. **Tras redeploy** con la imagen actual, **Sincronizar OpenWA** intenta instalar el plugin automaticamente desde el zip incluido en la imagen.
3. **Instalacion manual** en el VPS (con acceso a OpenWA):

```bash
export OPENWA_API_KEY=tu_clave
export OPENWA_BASE_URL=http://localhost:2785   # o la URL interna de OpenWA
./infra/scripts/setup-zent-flow-plugin.sh
```

En Windows: `infra/scripts/setup-zent-flow-plugin.ps1`

---

### Reinstalar plugin zent-flow tras actualizar codigo

```bash
cd plugins && npm run package:zent-flow
./infra/scripts/setup-zent-flow-plugin.sh
```

En Windows: `infra/scripts/setup-zent-flow-plugin.ps1`

---

## Trazabilidad del bot WhatsApp

Tras el deploy con la migracion `bot_turn_logs`, el vendedor puede auditar cada turno del bot.

### Que hace el cliente

- Siempre recibe respuesta: exito, error amigable o confirmacion de carrito.
- Si el worker o la IA fallan, se envia: *"Disculpa, hubo un problema tecnico..."* y opcion *asesor*.
- Tras ver un producto, **Agregar 5** / **añadir 3** agrega al carrito sin pasar por el LLM (si hay producto pendiente en sesion).

### Que ve el vendedor (dashboard)

1. **Bandeja WhatsApp** → conversacion → **Ver actividad del bot**: tabla con modo, tools, errores y duracion.
2. Meta del chat: estado bot, **fase IA**, **producto pendiente** (debug).
3. Mensajes con etiqueta **Sistema** (gris) para fallbacks y confirmaciones rapidas.

### API

| Endpoint | Uso |
|----------|-----|
| `GET /whatsapp/conversations/:chatId/activity` | Ultimos 50 turnos (`BotTurnLog`) |
| `GET /whatsapp/conversations/:chatId/meta` | Incluye `pendingProductId`, `aiPhase` |

### Alertas al vendedor

Si el mismo chat falla **2+ veces en 5 minutos**, se envia WhatsApp a `VENDOR_NOTIFY_PHONES` (si esta configurado).

### Checklist manual post-deploy

1. `npx prisma migrate deploy` en `backend-api` (tabla `bot_turn_logs`).
2. Reiniciar `backend-api` y `bot-worker`.
3. Flujo: buscar producto → ver detalle → escribir **Agregar 2** → confirmacion con total.
4. Simular error (desactivar Novita temporalmente) → cliente recibe mensaje fallback.
5. Dashboard → Actividad del bot muestra tools (`get_product_details`, `add_to_cart_fast`, etc.).

### Logs en Grafana

```
{service="bot-worker"} |= "Error processing"
{service="backend-api"} |= "AI turn failed"
```

---

## n8n como motor de workflows IA

Zent mantiene el backend como fuente de verdad para catalogo, stock, carrito, pagos y pedidos. La IA conversa y usa tools del backend; el backend emite eventos firmados a n8n para automatizaciones externas como validacion de pagos, delivery, CRM y avisos.

### Variables

```env
N8N_WORKFLOWS_ENABLED=true
N8N_WEBHOOK_BASE_URL=http://n8n:5678/webhook/zent
N8N_WEBHOOK_SECRET=strong-secret
N8N_SALES_MODE=sandbox
N8N_CHAT_MODE=disabled
N8N_CHAT_WEBHOOK_URL=http://n8n:5678/webhook/zent-chat
N8N_CHAT_SANDBOX_PHONES=51999999999
N8N_CHAT_TIMEOUT_MS=5000
N8N_PUBLIC_URL=http://77.93.154.87:5678
N8N_ENCRYPTION_KEY=strong-32-plus-char-secret
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=strong-password
N8N_SECURE_COOKIE=false
GENERIC_TIMEZONE=America/Lima
BOT_AI_PAYMENT_METHODS=Transferencia, Yape/Plin o pago contra entrega
BOT_AI_ORDER_STATUSES=NUEVO: recibido; EN_GESTION: en revisión; CONFIRMADO: confirmado; EN_DELIVERY: en reparto; COMPLETADO: entregado; CANCELADO: cancelado.
BOT_AI_WORKFLOW_POLICIES=Si el cliente envía referencia de pago, registra la referencia y espera validación del vendedor o automatización.
```

Con el compose de produccion, n8n queda embebido como servicio `n8n` y el backend le envia eventos por la red interna Docker. Abre el editor en `N8N_PUBLIC_URL` y usa `N8N_BASIC_AUTH_USER` / `N8N_BASIC_AUTH_PASSWORD`.

El servicio n8n tambien recibe `ZENT_API_URL=http://backend-api:3000/api` y `ZENT_N8N_SECRET=$N8N_WEBHOOK_SECRET` para que las plantillas importadas llamen las tools internas del backend sin credenciales hardcodeadas.

### Dashboard

1. Abrir **Configuracion → Asistente IA → Automatizaciones n8n**.
2. Si usas n8n embebido, pulsa **Restaurar configuracion automatica**.
3. Importa `infra/n8n/examples/zent-sales-sandbox.workflow.json` en n8n y activalo.
4. Usa **Ejecutar sandbox de ventas**; debe enviar `test.ping`, `order.created`, `payment.reference_submitted` y `order.status_changed` con `sandbox=true`.
5. Cuando el sandbox este OK, cambia `Modo de ventas n8n` a `Core` para habilitar eventos reales.
6. Para chat conversacional, en **n8n Flujos de Chat** importa las plantillas versionadas, deja `Modo chat n8n` en `Sandbox`, configura tu telefono en `N8N_CHAT_SANDBOX_PHONES` y prueba desde WhatsApp.
7. Cuando el flujo responda bien y cree pedidos correctamente, cambia `Modo chat n8n` a `Core`.

### Plantillas incluidas

| Archivo | Uso |
|---------|-----|
| `infra/n8n/orquestador/zent-orquestador.workflow.json` | **Orquestador por fases** WhatsApp: catálogo, carrito, checkout, pedidos, handoff (único flujo de chat soportado) |
| `infra/n8n/examples/zent-sales-sandbox.workflow.json` | Recibe cualquier evento `/webhook/zent/:event` y responde OK para pruebas |

Los exports experimentales del editor n8n deben guardarse en `infra/n8n/local-flows/`; esa carpeta esta ignorada por git.

### Error n8n: `access to env vars denied` en un nodo Code

n8n 2.x bloquea `$env` en nodos Code por defecto. El orquestador ya recibe credenciales en el payload (`context.zentApiUrl`, `context.zentN8nSecret`) enviadas por `backend-api`, así que no usa `$env`. Si algún workflow propio lo necesita, añade `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` al servicio n8n en Dokploy y redeploy.

### Eventos enviados

| Evento | Cuando ocurre | Uso sugerido |
|--------|---------------|--------------|
| `order.created` | Se crea un pedido | Avisar vendedor, CRM, task delivery |
| `payment.reference_submitted` | Cliente envia referencia de pago | Validar pago o pedir revision humana |
| `order.status_changed` | Cambia estado del pedido | Notificar cliente/vendedor |
| `handoff.requested` | Cliente pide humano | Avisar vendedor |
| `novita.low_balance` | Saldo Novita bajo umbral | Alertar owner |
| `test.ping` | Boton dashboard | Verificar conectividad |

Payload saliente:

```json
{
  "event": "order.created",
  "payload": {
    "orderId": "...",
    "shortId": "abcd1234",
    "status": "NUEVO",
    "total": 120,
    "customerPhone": "51999999999",
    "source": "WHATSAPP"
  },
  "sentAt": "2026-07-03T00:00:00.000Z"
}
```

Headers salientes:

```http
Content-Type: application/json
X-Zent-Event: order.created
X-Zent-Signature: sha256=<hmac-sha256-del-body-con-N8N_WEBHOOK_SECRET>
```

### Chat WhatsApp dirigido por n8n

El webhook OpenWA sigue entrando a Zent. Si `N8N_CHAT_MODE` esta en `sandbox` o `core`, `WhatsappBotWorker` reenvia el mensaje al puente n8n:

```http
POST N8N_CHAT_WEBHOOK_URL
X-Zent-Signature: sha256=<hmac-sha256-del-body-con-N8N_WEBHOOK_SECRET>
```

Payload:

```json
{
  "chatId": "51999999999@c.us",
  "waSessionId": "default",
  "contactPhone": "51999999999",
  "message": "hola, quiero catalogo",
  "messageType": "text",
  "context": {}
}
```

Respuesta esperada desde n8n:

```json
{
  "reply": "Texto para WhatsApp",
  "handoff": false,
  "metadata": { "flow": "sales_chat" }
}
```

Modes:

- `disabled`: Zent usa el bot actual.
- `sandbox`: solo se reenvian telefonos incluidos en `N8N_CHAT_SANDBOX_PHONES`.
- `core`: n8n maneja todos los chats entrantes.

Tools firmadas para plantillas n8n:

- `POST /api/webhooks/n8n/tools/categories.list`
- `POST /api/webhooks/n8n/tools/products.search`
- `POST /api/webhooks/n8n/tools/products.by_category`
- `POST /api/webhooks/n8n/tools/catalog_pdf.active`
- `POST /api/webhooks/n8n/tools/orders.create_from_chat`
- `POST /api/webhooks/n8n/tools/orders.find_by_phone`
- `POST /api/webhooks/n8n/tools/orders.get_status`
- `POST /api/webhooks/n8n/tools/orders.update_status`
- `POST /api/webhooks/n8n/tools/cart.get`
- `POST /api/webhooks/n8n/tools/cart.add_item`
- `POST /api/webhooks/n8n/tools/cart.remove_item`
- `POST /api/webhooks/n8n/tools/cart.clear`
- `POST /api/webhooks/n8n/tools/customers.lookup`
- `POST /api/webhooks/n8n/tools/orders.find_active_by_phone`
- `POST /api/webhooks/n8n/tools/chat.bootstrap`
- `POST /api/webhooks/n8n/tools/chat.session.patch`
- `POST /api/webhooks/n8n/tools/chat.handoff`
- `POST /api/webhooks/n8n/tools/chat.resume_bot`

Autenticacion para tools:

```http
Authorization: Bearer <N8N_WEBHOOK_SECRET>
```

Tambien se acepta `X-Zent-Signature: sha256=<hmac>` sobre el body crudo.

Reglas de inventario:

- `orders.create_from_chat` crea el pedido con `source=WHATSAPP` y estado `NUEVO`; valida disponibilidad, pero no descuenta inventario fisico.
- Cuando el estado pasa a `CONFIRMADO`, `OrdersService.updateStatus()` ejecuta el commit de stock.
- Cuando pasa a `CANCELADO`, `OrdersService.updateStatus()` restaura stock si ya estaba comprometido.
- Cuando pasa a `COMPLETADO`, `OrdersService.updateStatus()` envia el mensaje final de cierre al cliente.

### Orquestador (nodo único robusto)

El motor conversacional vive en `infra/n8n/orquestador/` como módulos en español concatenados por `construir-workflow.js`. El workflow generado es un **grafo mínimo**:

`Entrada WhatsApp` (webhook) → `Orquestar` (Code) → `Responder a Zent`

Todo ocurre dentro del nodo `Orquestar`: normaliza el mensaje, enruta, ejecuta el flujo, persiste la sesión (`chat.session.patch`) y arma la respuesta. La función `orquestarMensaje` envuelve todo en **try/catch global**, así el nodo **nunca lanza**: siempre responde `{ reply, handoff, metadata, media }` y, ante un error interno, no cambia la fase (el usuario reintenta el mismo paso, nunca queda atascado).

| Ruta | Rol |
|------|-----|
| `nucleo/intencion.js` | Normalización + intención global; helpers `esQuitar`/`esVerMas`/`esSaludo` |
| `nucleo/enrutador.js` | `enrutarGrupo` + `comandoNavegacion` (escapes globales) + `prepararContexto` |
| `nucleo/productos.js` | Búsqueda difusa, listas paginadas, resumen de carrito (`numerar`) |
| `nucleo/copys.js` | Anti-repetición de copys y bienvenida compartida |
| `nucleo/sesion.js` | `aplicarParche(sesion, parche)` |
| `nucleo/tiempo.js` | `haceCuanto(fecha)` — antigüedad en español para estados de pedido |
| `nucleo/ejecutor.js` | `crearEjecutor` (llama tools) + `ejecutarYResponder` |
| `nucleo/orquestador.js` | `orquestarMensaje(cuerpo, helpers)` — punto de entrada único con red de seguridad |
| `textos.js` | Todos los textos del bot (variantes anti-repetición) — editar aquí los saludos y copys |
| `flujos/*.js` | Un flujo async por grupo de fases; llaman tools con `await` directo (sin fillers) |
| `construir-workflow.js` | Genera `zent-orquestador.workflow.json` (grafo de 3 nodos) |

Los nodos Code de n8n 2.x son entornos aislados (sin `require` ni funciones compartidas entre nodos), así que la librería (textos + nucleo + flujos) se **embebe una sola vez** en el nodo `Orquestar`, y la **invocación va al final** (tras las definiciones, para que todo esté inicializado). La única fuente de verdad son los archivos de `nucleo/` y `flujos/`; cualquier cambio se hace ahí y se regenera el JSON. Las pruebas ejercitan `orquestarMensaje`, es decir el **mismo** código que producción.

Reglas clave:

- El nodo `Orquestar` **nunca se cae sin responder**: try/catch global → siempre hay `reply` de respaldo.
- Cada flujo llama las tools del backend con `await` — no existe loop interno ni respuestas "Un momentito".
- El resumen del carrito **siempre** usa el objeto devuelto por la tool (`cart.get` / `cart.add_item`), nunca la sesión.
- Números `1/2/3` desde el menú → catálogo / mi pedido / asesor. Dentro de `Flujo Catálogo` los números son categoría → producto → cantidad. En carrito/checkout no son selección.
- **Escapes globales** (`menú`, `cancelar`, `catálogo`, `carrito`, `mi pedido`, `asesor`) funcionan desde **cualquier** fase, incluido el checkout — sin confundir una dirección que contenga la palabra.
- Texto libre desde el menú/navegando → **búsqueda de producto** (`products.search`).
- En el carrito, `quita N` / `elimina <nombre>` → quita ese ítem (`cart.remove_item`).
- Paginación de productos: `más` muestra la siguiente página.
- `hola` resetea al menú desde cualquier fase **excepto** checkout.

**Checklist tras cambiar el orquestador:**

1. Tests locales (desde `infra/n8n/orquestador/`): `node pruebas/prueba-intencion.js && node pruebas/prueba-menu.js && node pruebas/prueba-catalogo.js && node pruebas/prueba-carrito.js && node pruebas/prueba-checkout.js && node pruebas/prueba-pedido.js && node pruebas/prueba-conversacion.js`
2. Regenerar JSON: `node infra/n8n/orquestador/construir-workflow.js`
3. Importar `infra/n8n/orquestador/zent-orquestador.workflow.json` en n8n y **activar**
4. **Desactivar** cualquier workflow de chat legacy que quede en la instancia n8n (ej: `Zent WhatsApp Orchestrator`, `Zent WhatsApp Sales Chat`)
5. Smoke en WhatsApp (sandbox):
   - `hola` → saludo + menú numerado (nunca "producto no lo ubico")
   - `1` → categorías (menú numerado) · `catálogo` → categorías inmediatas (sin "momentito")
   - `papel` (texto libre) → resultados de búsqueda
   - número → productos → número → foto + pedir cantidad → cantidad → **resumen con items y total reales**
   - `quita 1` en el carrito → ítem quitado, carrito actualizado
   - `catálogo` desde carrito → categorías
   - `confirmar pedido` → durante el checkout escribir `menú` → **escapa** (no guarda basura como dirección) → `confirmar pedido` → `sí` → `sí` → pedido creado (una sola vez)
   - `mi pedido` → el bot **pide el código** (o `no tengo` para buscar por teléfono) → detalle con estado, antigüedad (`hace 2 horas`) e items con variante → `asesor` funciona desde ahí
   - `asesor` → handoff (una sola vez; mensajes siguientes no repiten el handoff)
6. Smoke en dashboard:
   - **Productos**: producto con subproductos muestra badge `5 en 2 opciones` y el drilldown lista cada opción con su stock; el campo Stock queda bloqueado ("Calculado automáticamente")
   - **Pedidos**: cada item del detalle muestra `Opción: Rojo / M` (lo que hay que preparar)
   - **Reportes**: el top de ventas separa `Polo — Rojo / M` de `Polo — Azul / L`
7. En la ejecución n8n, el nodo `Orquestar` devuelve `metadata.grupo` y `metadata.phase` — revisar ahí (o los logs `ERROR orquestador …`) ante cualquier respuesta rara
8. **Timeout**: con varios round-trips por turno, sube `N8N_CHAT_TIMEOUT_MS` a `8000` (ver bloque n8n del `.env`) para evitar fallbacks y pedidos duplicados por corte a los 5 s

### Atributos y subproductos (variantes)

- Migración: `npx prisma migrate deploy` aplica `20260706020000_atributos_y_variantes` (crea `attributes`, `attribute_values`, `product_attribute_values`, `product_variants`, `variant_values` y agrega `variantId`/`variantLabel` a `order_items`; siembra los atributos base Color, Material, Textura, Peso, Alto, Ancho, Voltaje, Talla y Marca sin valores).
- Dashboard: nueva sección **Atributos** (crear valores tipo Rojo, M, 220V) y en el formulario del producto los bloques **Atributos del producto** (informativos) y **Subproductos** (combinación + stock propio + precio opcional).
- Si un producto tiene subproductos activos, su stock pasa a ser la **suma** de las variantes (se recalcula al crear/editar/eliminar variantes y al confirmar/cancelar pedidos).
- Chat: los atributos informativos salen como `📋 Marca: Faber · Peso: 2 kg`; si hay variantes con stock, el bot pide la opción (`1️⃣ Rojo / M — S/ 50.00`) **antes** de la cantidad y `cart.add_item` valida stock por variante.

**Smoke de atributos (tras deploy):**

1. Dashboard → Atributos → agregar valores a Color (ej: Rojo, Azul)
2. Dashboard → Productos → editar un producto → asignar atributos informativos → guardar
3. Mismo producto → crear 2 subproductos (Rojo stock 3, Azul stock 2) → el stock del producto debe quedar en 5
4. WhatsApp: elegir ese producto → debe listar `1️⃣ Rojo … 2️⃣ Azul …` → elegir → cantidad → resumen con la etiqueta y el precio de la variante
5. Confirmar pedido y aceptarlo en el dashboard → el stock de la variante elegida baja y el del padre se recalcula

Prueba manual recomendada (orquestador por fases):

1. **Desactivar** cualquier workflow de chat legacy en n8n si estaba activo.
2. Importar `infra/n8n/orquestador/zent-orquestador.workflow.json`.
3. Activar el workflow y confirmar path `/webhook/zent-chat`.
4. Guardar `N8N_CHAT_MODE=sandbox` y tu número en `N8N_CHAT_SANDBOX_PHONES`.
5. Probar con `POST /api/settings/n8n/chat/test` o enviar mensajes desde WhatsApp:

| Paso | Mensaje | Resultado esperado |
|------|---------|-------------------|
| 1 | `hola` | Saludo + menú con opciones |
| 2 | `catálogo` o `1` | Lista categorías |
| 3 | elegir categoría | Productos; bajo stock en negrita |
| 4 | agregar producto | Carrito + aviso 30 min |
| 4b | `catálogo` desde carrito | Lista categorías (sin quedar en "momentito") |
| 5 | `confirmar pedido` | Pide datos o reutiliza dirección |
| 6 | confirmar | Pedido NUEVO creado |
| 6b | Dashboard → Clientes | Cliente visible con `totalOrders = 1` |
| 7 | `mi pedido` | El bot pide el código; con código → detalle (estado + antigüedad + items con variante); `no tengo` → busca por teléfono |
| 8 | `asesor` | Handoff; bot no responde más |
| 9 | Dashboard "Reactivar bot" | Bot vuelve a saludar |

6. Cambiar pedido a `CONFIRMADO` / `EN_DELIVERY` / `COMPLETADO` en dashboard; cliente recibe WhatsApp (backend existente).

### Callback desde n8n

Endpoint:

```http
POST /api/webhooks/n8n/order-status
X-Zent-Signature: sha256=<hmac-sha256-del-body>
```

Body:

```json
{
  "orderId": "...",
  "status": "CONFIRMADO",
  "note": "Pago validado por n8n"
}
```

Guardrails:

- n8n no modifica stock directamente.
- n8n solo puede enviar estados existentes en `OrderStatus`.
- La IA no debe afirmar que un pago fue validado hasta que backend/n8n lo confirme.
- Si n8n esta caido, el pedido igual se crea y queda visible en dashboard.

---

## Rollback de migraciones

- No hay rollback automático. Para revertir: redeploy de imagen anterior en Dokploy.
- Migraciones Prisma son forward-only en prod; evitar `db push` una vez en migrate.
- Si una migración falló a medias, revisar logs de `backend-api` y estado con `npx prisma migrate status` dentro del contenedor.
