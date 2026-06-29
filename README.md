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

### 1. Clonar y configurar

```bash
git clone <repo-url>
cd zent
cp .env.example .env
```

Edita `.env` con tus valores:
- Cambia `POSTGRES_PASSWORD`, `JWT_SECRET`, `JWT_REFRESH_SECRET`
- Configura `OPENWA_API_KEY` y `OPENWA_WEBHOOK_SECRET`
- Ajusta los dominios de Traefik

### 2. Levantar el stack

```bash
cd infra
docker compose up -d
```

### 3. Ejecutar migraciones de base de datos

```bash
docker compose exec backend-api npx prisma migrate deploy
```

### 4. Vincular WhatsApp

1. Accede al dashboard: `https://app.localhost` (o tu dominio)
2. Inicia sesión (crea un usuario admin primero vía API)
3. Ve a "WhatsApp / Sesión"
4. Escanea el código QR con tu teléfono

### 5. Crear usuario admin

```bash
curl -X POST https://api.localhost/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "admin123",
    "name": "Admin",
    "role": "ADMIN"
  }'
```

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
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── auth/       # Autenticación JWT
│   │   │   │   ├── products/   # CRUD productos
│   │   │   │   ├── categories/ # CRUD categorías
│   │   │   │   ├── orders/     # Gestión de pedidos
│   │   │   │   ├── inventory/  # Control de stock
│   │   │   │   ├── reports/    # Reportes de ganancias
│   │   │   │   ├── openwa/     # Integración OpenWA
│   │   │   │   ├── whatsapp-bot/ # Bot de WhatsApp
│   │   │   │   └── catalog-pdf/  # Catálogo PDF
│   │   │   └── prisma/         # Servicio Prisma
│   │   └── Dockerfile
│   └── dashboard/              # Next.js frontend
│       └── Dockerfile
├── infra/
│   ├── docker-compose.yml
│   └── traefik/
├── prisma/
│   └── schema.prisma
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