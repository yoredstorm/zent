# Verificación post-deploy (VPS / Dokploy)

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
