CREATE TABLE "bot_turn_logs" (
    "id" TEXT NOT NULL,
    "stateKey" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "waSessionId" TEXT,
    "mode" TEXT NOT NULL,
    "userMessage" TEXT,
    "assistantMessage" TEXT,
    "toolsJson" JSONB,
    "error" TEXT,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bot_turn_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "bot_turn_logs_chatId_createdAt_idx" ON "bot_turn_logs"("chatId", "createdAt");
CREATE INDEX "bot_turn_logs_stateKey_createdAt_idx" ON "bot_turn_logs"("stateKey", "createdAt");
