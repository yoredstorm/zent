#!/bin/sh
# Recupera migracion fallida 20260704150000_whatsapp_bot_engine (error P3009).
# Ejecutar DENTRO del contenedor backend-api cuando migrate deploy falla en bucle.
set -e

MIGRATION="20260704150000_whatsapp_bot_engine"

echo "==> Estado actual de migraciones"
npx prisma migrate status || true

echo "==> Marcar migracion fallida como rolled-back"
npx prisma migrate resolve --rolled-back "$MIGRATION"

echo "==> Columnas actuales en store_settings (whatsapp/n8n/bot)"
psql "$DATABASE_URL" -c "
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'store_settings'
  AND (
    column_name ILIKE '%whatsapp%'
    OR column_name ILIKE '%n8n%'
    OR column_name ILIKE '%botAi%'
    OR column_name ILIKE '%bot_ai%'
  )
ORDER BY column_name;
" 2>/dev/null || echo "(psql no disponible; revisa columnas manualmente)"

echo "==> Si ves columnas snake_case (whatsapp_bot_engine), eliminalas antes del redeploy:"
echo "    ALTER TABLE store_settings DROP COLUMN IF EXISTS whatsapp_bot_engine;"
echo "    (y las demas n8n_* en snake_case)"

echo "==> Aplicar migraciones corregidas"
npx prisma migrate deploy

echo "==> Listo. Reinicia backend-api y bot-worker."
