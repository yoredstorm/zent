#!/bin/sh
set -e

UPLOADS_DIR="${UPLOADS_DIR:-/app/uploads}"
mkdir -p "$UPLOADS_DIR/pdf" "$UPLOADS_DIR/images"
chown -R nestjs:nodejs "$UPLOADS_DIR" 2>/dev/null || true

# Sync DB schema before app starts (avoids 500 when Prisma client expects new columns)
if [ -n "$DATABASE_URL" ] && [ -f ./prisma/schema.prisma ]; then
  echo "Running prisma db push..."
  npx prisma db push --skip-generate --accept-data-loss || {
    echo "ERROR: prisma db push failed — check DATABASE_URL and schema"
    exit 1
  }
  echo "DB schema synced"
fi

exec su-exec nestjs "$@"
