-- AlterTable
ALTER TABLE "store_settings" ADD COLUMN "whatsappBotEngine" TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE "store_settings" ADD COLUMN "n8nWorkflowsEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "store_settings" ADD COLUMN "n8nWebhookBaseUrl" TEXT;
ALTER TABLE "store_settings" ADD COLUMN "n8nSalesMode" TEXT NOT NULL DEFAULT 'sandbox';
ALTER TABLE "store_settings" ADD COLUMN "n8nChatScope" TEXT NOT NULL DEFAULT 'sandbox';
ALTER TABLE "store_settings" ADD COLUMN "n8nChatWebhookUrl" TEXT;
ALTER TABLE "store_settings" ADD COLUMN "n8nChatSandboxPhones" TEXT;

-- Migrate existing installs: bot AI enabled -> novita engine
UPDATE "store_settings"
SET "whatsappBotEngine" = 'novita'
WHERE "botAiEnabled" = true AND "whatsappBotEngine" = 'legacy';
