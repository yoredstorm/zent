#!/bin/sh
set -e

UPLOADS_DIR="${UPLOADS_DIR:-/app/uploads}"
mkdir -p "$UPLOADS_DIR/pdf" "$UPLOADS_DIR/images"
chown -R nestjs:nodejs "$UPLOADS_DIR" 2>/dev/null || true

exec su-exec nestjs "$@"
