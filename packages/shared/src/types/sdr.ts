// ─── SDR IA Types ─────────────────────────────────────────────────────────────

export enum ConversationStatus {
  ACTIVE = "ACTIVE",
  PAUSED = "PAUSED",
  COMPLETED = "COMPLETED",
  TRANSFERRED = "TRANSFERRED",
}

export enum ConversationChannel {
  WHATSAPP = "WHATSAPP",
  EMAIL = "EMAIL",
  WEBCHAT = "WEBCHAT",
}

export enum MessageSender {
  AI = "AI",
  LEAD = "LEAD",
  HUMAN_AGENT = "HUMAN_AGENT",
}

export enum LeadScoreLevel {
  COLD = "COLD",
  WARM = "WARM",
  HOT = "HOT",
}

export enum SequenceStepType {
  WAIT = "WAIT",
  SEND_MESSAGE = "SEND_MESSAGE",
  SEND_EMAIL = "SEND_EMAIL",
  SCORE_CHECK = "SCORE_CHECK",
  TRANSFER_TO_HUMAN = "TRANSFER_TO_HUMAN",
}

export interface IConversation {
  id: string;
  contactId: string;
  dealId?: string | null;
  channel: ConversationChannel;
  status: ConversationStatus;
  summary?: string | null;
  startedAt: Date;
  endedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IConversationMessage {
  id: string;
  conversationId: string;
  sender: MessageSender;
  content: string;
  metadata?: Record<string, unknown> | null;
  createdAt: Date;
}

export interface ILeadScore {
  id: string;
  contactId: string;
  score: number;
  level: LeadScoreLevel;
  factors: Record<string, unknown>;
  calculatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ISdrSequence {
  id: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ISdrSequenceStep {
  id: string;
  sequenceId: string;
  order: number;
  type: SequenceStepType;
  config: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}
