-- Add AI_CONVERSATION chat state for conversational bot mode
ALTER TYPE "ChatState" ADD VALUE IF NOT EXISTS 'AI_CONVERSATION';
