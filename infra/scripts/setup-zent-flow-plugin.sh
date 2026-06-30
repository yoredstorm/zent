#!/usr/bin/env bash
# Disable chat-flow, install and configure zent-flow on OpenWA.
set -euo pipefail

OPENWA_BASE_URL="${OPENWA_BASE_URL:-http://openwa:2785}"
OPENWA_API_KEY="${OPENWA_API_KEY:?OPENWA_API_KEY is required}"
BOT_PLUGIN_SECRET="${BOT_PLUGIN_SECRET:-${OPENWA_WEBHOOK_SECRET:-webhook-secret-2024}}"
ZENT_API_URL="${ZENT_API_URL:-http://backend-api:3000}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGINS_DIR="$(cd "$SCRIPT_DIR/../../plugins" && pwd)"
ZIP="$PLUGINS_DIR/zent-flow.zip"
CONFIG_JSON="$PLUGINS_DIR/zent-flow/config/default.json"

auth=(-H "X-API-Key: $OPENWA_API_KEY")

echo "→ Disabling chat-flow (if installed)..."
curl -sf -X POST "$OPENWA_BASE_URL/api/plugins/chat-flow/disable" "${auth[@]}" || echo "  (chat-flow not present or already disabled)"

if [[ ! -f "$ZIP" ]]; then
  echo "→ Packaging zent-flow..."
  (cd "$PLUGINS_DIR" && npm install --silent && npm run package:zent-flow)
fi

echo "→ Installing zent-flow..."
curl -sf -X POST "$OPENWA_BASE_URL/api/plugins/install" \
  "${auth[@]}" \
  -F "file=@$ZIP" || echo "  (may already be installed — continuing)"

SECRET_ESCAPED=$(printf '%s' "$BOT_PLUGIN_SECRET" | sed 's/"/\\"/g')
CONFIG=$(sed "s/webhook-secret-2024/$SECRET_ESCAPED/" "$CONFIG_JSON" | jq -c \
  --arg url "$ZENT_API_URL" \
  '.zentApiUrl = $url')

echo "→ Updating zent-flow config..."
curl -sf -X PUT "$OPENWA_BASE_URL/api/plugins/zent-flow/config" \
  "${auth[@]}" \
  -H "Content-Type: application/json" \
  -d "{\"config\": $CONFIG}"

echo "→ Enabling zent-flow..."
curl -sf -X POST "$OPENWA_BASE_URL/api/plugins/zent-flow/enable" "${auth[@]}"

echo "✓ zent-flow ready. Set ZENT_FLOW_PLUGIN_ENABLED=true on backend-api and bot-worker."
