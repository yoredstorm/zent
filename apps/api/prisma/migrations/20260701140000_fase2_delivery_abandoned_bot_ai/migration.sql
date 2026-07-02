-- AlterTable
ALTER TABLE "store_settings" ADD COLUMN "deliveryFlatFee" DECIMAL(10,2),
ADD COLUMN "botAiEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "botAiBusinessDescription" TEXT,
ADD COLUMN "botAiPolicies" TEXT,
ADD COLUMN "botAiPlaybook" TEXT;

-- CreateTable
CREATE TABLE "abandoned_carts" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "stateKey" TEXT NOT NULL,
    "customerName" TEXT,
    "customerPhone" TEXT,
    "itemsJson" TEXT NOT NULL,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "deliveryCost" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(10,2) NOT NULL,
    "expiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "followUpSentAt" TIMESTAMP(3),
    "recoveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "abandoned_carts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "abandoned_carts_chatId_idx" ON "abandoned_carts"("chatId");

-- CreateIndex
CREATE INDEX "abandoned_carts_followUpSentAt_recoveredAt_idx" ON "abandoned_carts"("followUpSentAt", "recoveredAt");
