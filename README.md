# Sistema de Inventario + Bot de Ventas por WhatsApp

Sistema completo de gestión de inventario con bot de ventas automatizado por WhatsApp usando OpenWA.

## Arquitectura

- **Backend API** (NestJS): API REST para dashboard y gestión
- **Bot Worker** (NestJS + BullMQ): Procesador de mensajes de WhatsApp
- **Dashboard** (Next.js): Panel administrativo para vendedores
- **OpenWA**: Gateway de WhatsApp self-hosted
- **PostgreSQL**: Base de datos principal
- **Redis**: Cache, colas y sesiones de chat
- **Traefik**: Reverse proxy con TLS

## Requisitos

- Docker y Docker Compose
- Dominio configurado (o usar localhost para desarrollo)

## Instalación

Zent se instala en tres pasos: subir el proyecto, ejecutar el instalador de un
comando, y completar el asistente de instalación en el navegador.

### 1. Instalador de un comando

El instalador genera `infra/.env` con secretos seguros automáticamente
(`POSTGRES_PASSWORD`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `OPENWA_API_KEY`,
`OPENWA_WEBHOOK_SECRET`, `GF_SECURITY_ADMIN_PASSWORD`) y levanta todo el stack.
Es idempotente: si `infra/.env` ya existe, no lo sobrescribe.

```bash
cd infra

# Linux / VPS (HOST = dominio o IP pública; por defecto localhost)
./install.sh tu-dominio.com

# Windows (pruebas locales)
./install.ps1 -HostName localhost
```

El admin NO se crea aquí; se crea en el asistente. Los secretos se respaldan en
`infra/credenciales-zent.txt` (guárdalo en un lugar seguro; está fuera de git).

**OpenWA:** `API_MASTER_KEY` y `OPENWA_API_KEY` deben ser idénticas. El instalador
las genera iguales y reinicia OpenWA con volumen limpio. Si ves errores 401, en
Windows ejecuta `infra/fix-openwa-key.ps1` o vuelve a correr `install.sh`.

Para **quitar Zent por completo** del servidor (sin reinstalar): `infra/uninstall.sh`
o `infra/uninstall.ps1`. Con `--prune-images` / `-PruneImages` también borra imágenes
Docker construidas localmente. Ver `infra/DEPLOY.md` para la tabla de reset vs uninstall.

### 2. Asistente de instalación (wizard `/setup`)

Mientras el sistema no esté instalado, cualquier ruta redirige a `/setup` y la API
responde `503` salvo `/api/setup/*` y `/api/health` (ver `InstallGuard`).

Abre `http://TU_HOST:8080/setup` y completa:

1. Datos de la tienda (nombre, logo o avatar genérico, moneda, IVA, teléfono).
2. Cuenta de administrador (con generador de contraseña segura).
3. Resumen de credenciales (descargable una sola vez).
4. Vincular WhatsApp por QR (o omitir y hacerlo luego).
5. Resumen e instalación con log en vivo (SSE).
6. Listo: entra al panel con sesión iniciada.

Las migraciones de esquema se aplican solas al arrancar (`prisma migrate deploy`); no hay
paso manual de migraciones.

### 3. Reconexión de WhatsApp

Si omitiste el paso de WhatsApp, el dashboard muestra un banner persistente y
puedes vincularlo en **Configuración → WhatsApp** (`/dashboard/settings/whatsapp`).

### Endpoints de instalación

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/setup/status` | Estado de instalación + datos básicos de la tienda (público) |
| GET | `/api/setup/credentials` | Resumen de credenciales (solo antes de instalar) |
| POST | `/api/setup/install` | Ejecuta la instalación idempotente (solo antes de instalar) |
| GET | `/api/setup/install/stream` | Stream SSE del progreso de instalación |
| GET | `/api/setup/whatsapp/status` | Estado de la sesión de WhatsApp; persiste `whatsappLinked` al conectar |
| GET | `/api/setup/whatsapp/qr` | QR de vinculación de WhatsApp |
| POST | `/api/setup/whatsapp/connect` | Crea/inicia la sesión de WhatsApp y devuelve el QR |

## Uso

### Dashboard

Accede a `https://app.localhost` para:
- Gestionar productos (CRUD con fotos)
- Gestionar categorías
- Subir catálogo PDF
- Ver inventario y alertas de stock bajo
- Gestionar pedidos/leads de WhatsApp
- Ver reportes de ganancias

### Bot de WhatsApp

Los clientes pueden:
1. Ver catálogo completo (PDF)
2. Navegar productos por categoría
3. Agregar productos al carrito
4. Confirmar pedido con datos de entrega
5. Hablar con un asesor humano

El bot responde automáticamente y crea pedidos que aparecen en el dashboard.

## Estructura del proyecto

```
├── apps/
│   ├── api/                    # NestJS backend
│   │   ├── prisma/             # Schema + migraciones
│   │   │   ├── schema.prisma
│   │   │   └── migrations/
│   │   ├── src/
│   │   │   └── modules/        # auth, products, orders, whatsapp-bot, ...
│   │   └── Dockerfile
│   └── dashboard/              # Next.js frontend
│       └── Dockerfile
├── infra/
│   ├── docker-compose.yml
│   └── traefik/
└── .env.example
```

## Desarrollo local

### Backend API

```bash
cd apps/api
npm install
npm run start:dev
```

### Bot Worker

```bash
cd apps/api
npm run start:worker
```

### Dashboard

```bash
cd apps/dashboard
npm install
npm run dev
```

## Migraciones de base de datos

El schema vive en `apps/api/prisma/`. En desarrollo:

```bash
cd apps/api
npx prisma migrate dev --name descripcion_cambio
```

En producción / Docker, `backend-api` aplica automáticamente `prisma migrate deploy` al arrancar.

Instalaciones que usaban `db push` antes: ver [infra/DEPLOY.md](infra/DEPLOY.md) (sección upgrade).

## CI/CD

GitHub Actions ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)):

- Build API + dashboard
- E2E del wizard `/setup` contra `docker-compose.ci.yml`
- Tras CI verde en `main`, deploy automático a Dokploy (webhook; secret `DOKPLOY_DEPLOY_WEBHOOK_URL`)

Local:

```bash
docker compose -p zent-ci -f infra/docker-compose.ci.yml up -d --build --wait
CI=true node scripts/validate-setup-e2e.mjs http://localhost:3001/api
docker compose -p zent-ci -f infra/docker-compose.ci.yml down -v
```

## Escalabilidad

El sistema está diseñado para escalar horizontalmente:

```bash
# Escalar workers del bot
docker compose up -d --scale bot-worker=3

# Escalar API
docker compose up -d --scale backend-api=3
```

El estado de carritos y sesiones vive en Redis, por lo que cualquier réplica puede atender cualquier chat.

## Seguridad

- JWT con refresh tokens
- Verificación HMAC de webhooks de OpenWA
- Rate limiting en endpoints públicos
- Contraseñas hasheadas con bcrypt
- Variables de entorno para secrets

## Monitoreo

- Health checks en todos los servicios
- Logs estructurados con Pino
- Métricas de OpenWA en `:2785`

## Licencia

MIT