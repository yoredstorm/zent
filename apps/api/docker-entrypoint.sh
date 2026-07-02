#!/bin/sh
set -e

UPLOADS_DIR="${UPLOADS_DIR:-/app/uploads}"
mkdir -p "$UPLOADS_DIR/pdf" "$UPLOADS_DIR/images"
chown -R nestjs:nodejs "$UPLOADS_DIR" 2>/dev/null || true

# Solo backend-api aplica migraciones (worker comparte imagen pero no debe duplicar)
if [ "${RUN_MIGRATIONS:-true}" = "true" ] && [ -n "$DATABASE_URL" ] && [ -f ./prisma/schema.prisma ]; then
  echo "Running prisma migrate deploy..."
  npx prisma migrate deploy || {
    echo "ERROR: prisma migrate deploy failed — check DATABASE_URL and migrations/"
    exit 1
  }
  echo "DB migrations applied"
fi

exec su-exec nestjs "$@"
