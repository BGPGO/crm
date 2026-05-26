-- Add fields to flag AI responses awaiting human review
ALTER TABLE "WaConversation" ADD COLUMN "aiLastRespondedUnseen" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "WaConversation" ADD COLUMN "aiLastResponseAt" TIMESTAMP(3);
