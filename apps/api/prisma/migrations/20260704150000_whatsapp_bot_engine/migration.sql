-- AlterTable
ALTER TABLE "store_settings" ADD COLUMN "whatsapp_bot_engine" TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE "store_settings" ADD COLUMN "n8n_workflows_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "store_settings" ADD COLUMN "n8n_webhook_base_url" TEXT;
ALTER TABLE "store_settings" ADD COLUMN "n8n_sales_mode" TEXT NOT NULL DEFAULT 'sandbox';
ALTER TABLE "store_settings" ADD COLUMN "n8n_chat_scope" TEXT NOT NULL DEFAULT 'sandbox';
ALTER TABLE "store_settings" ADD COLUMN "n8n_chat_webhook_url" TEXT;
ALTER TABLE "store_settings" ADD COLUMN "n8n_chat_sandbox_phones" TEXT;

-- Migrate existing installs: bot AI enabled -> novita engine
UPDATE "store_settings"
SET "whatsapp_bot_engine" = 'novita'
WHERE "bot_ai_enabled" = true AND "whatsapp_bot_engine" = 'legacy';
