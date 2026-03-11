// ─── Enums ────────────────────────────────────────────────────────────────────

export enum UserRole {
  ADMIN = "ADMIN",
  MANAGER = "MANAGER",
  SELLER = "SELLER",
}

export enum DealStatus {
  OPEN = "OPEN",
  WON = "WON",
  LOST = "LOST",
}

export enum TaskType {
  CALL = "CALL",
  EMAIL = "EMAIL",
  MEETING = "MEETING",
  VISIT = "VISIT",
  OTHER = "OTHER",
}

export enum TaskStatus {
  PENDING = "PENDING",
  COMPLETED = "COMPLETED",
  OVERDUE = "OVERDUE",
}

export enum ActivityType {
  NOTE = "NOTE",
  EMAIL = "EMAIL",
  CALL = "CALL",
  MEETING = "MEETING",
  STAGE_CHANGE = "STAGE_CHANGE",
  STATUS_CHANGE = "STATUS_CHANGE",
}

export enum CustomFieldType {
  TEXT = "TEXT",
  NUMBER = "NUMBER",
  DATE = "DATE",
  SELECT = "SELECT",
  MULTISELECT = "MULTISELECT",
}

export enum CustomFieldEntity {
  CONTACT = "CONTACT",
  ORGANIZATION = "ORGANIZATION",
  DEAL = "DEAL",
}

// ─── Entity Interfaces ────────────────────────────────────────────────────────

export interface IUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatarUrl?: string | null;
  phone?: string | null;
  isActive: boolean;
  teamId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ITeam {
  id: string;
  name: string;
  description?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IContact {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  position?: string | null;
  birthday?: Date | null;
  organizationId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IOrganization {
  id: string;
  name: string;
  cnpj?: string | null;
  segment?: string | null;
  website?: string | null;
  phone?: string | null;
  address?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IPipeline {
  id: string;
  name: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IPipelineStage {
  id: string;
  name: string;
  order: number;
  color?: string | null;
  pipelineId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IDeal {
  id: string;
  title: string;
  value?: number | null;
  expectedCloseDate?: Date | null;
  closedAt?: Date | null;
  status: DealStatus;
  pipelineId: string;
  stageId: string;
  contactId?: string | null;
  organizationId?: string | null;
  userId: string;
  sourceId?: string | null;
  lostReasonId?: string | null;
  campaignId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ITask {
  id: string;
  title: string;
  description?: string | null;
  type: TaskType;
  dueDate?: Date | null;
  completedAt?: Date | null;
  status: TaskStatus;
  userId: string;
  dealId?: string | null;
  contactId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IActivity {
  id: string;
  type: ActivityType;
  content: string;
  metadata?: Record<string, unknown> | null;
  userId: string;
  dealId?: string | null;
  contactId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IProduct {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  sku?: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IDealProduct {
  id: string;
  dealId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ISource {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ILostReason {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICampaign {
  id: string;
  name: string;
  description?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICustomField {
  id: string;
  name: string;
  fieldType: CustomFieldType;
  entity: CustomFieldEntity;
  options?: unknown | null;
  isRequired: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICustomFieldValue {
  id: string;
  customFieldId: string;
  entityId: string;
  entityType: string;
  value?: string | null;
  createdAt: Date;
  updatedAt: Date;
}
