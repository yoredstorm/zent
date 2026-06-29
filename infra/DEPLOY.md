# Verificación post-deploy (VPS / Dokploy)

## Troubleshooting rápido

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
curl -s http://77.93.154.87:3001/api/health
curl -s http://77.93.154.87:3001/health   # bot-worker si expuesto internamente
```

## 3. Login dashboard Zent

- URL: http://77.93.154.87:8080
- Credenciales: `ADMIN_EMAIL` / `ADMIN_PASSWORD` de Dokploy
- Con `ADMIN_FORCE_RESET=true` en el primer deploy se sincroniza la contraseña

## 4. Grafana y logs

- URL: http://77.93.154.87:3002
- Usuario: `GF_SECURITY_ADMIN_USER` (default `admin`)
- Contraseña: `GF_SECURITY_ADMIN_PASSWORD` de Dokploy

Queries útiles en **Explore → Loki**:

```
{container=~".*backend-api.*"}
{container=~".*bot-worker.*"}
{container=~".*openwa.*"}
```

Buscar: `OPENWA_API_KEY validated`, `Webhook registered`, `Enqueued message`

## 5. Prometheus

- URL: http://77.93.154.87:9090
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

1. OpenWA conectado: https://77.93.154.87:2786
2. Webhook registrado automáticamente a `http://backend-api:3000/api/webhooks/openwa`
3. Escribir `hola` o `menu` al número conectado

## 8. OpenWA API key desincronizada

Si el login OpenWA falla con 401:

```bash
docker rm -f zent-docker-esjwmq-openwa-1
docker volume rm zent_openwa_prod
```

Redeploy en Dokploy (con `API_MASTER_KEY` y `OPENWA_API_KEY` en Environment).
