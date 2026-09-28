import type { Timestamp } from "firebase/firestore";

export type ReplenishmentStatus =
  | "pending"
  | "sent"
  | "received"
  | "cancelled";

export interface ReplenishmentItem {
  productId: string;
  quantity: number;
}

export interface Replenishment {
  id: string;
  number: string;
  status: ReplenishmentStatus;
  agentId: string;
  items: ReplenishmentItem[];
  notes?: string;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  sentBy?: string;
  sentAt?: Timestamp;
  receivedBy?: string;
  receivedAt?: Timestamp;
  cancelledBy?: string;
  cancelledAt?: Timestamp;
}

export interface ReplenishmentInput {
  agentId: string;
  items: ReplenishmentItem[];
  notes?: string;
}

export interface ReplenishmentFilters {
  status: "all" | ReplenishmentStatus;
  agentId: string;
  search: string;
}

export interface ReplenishmentUser {
  uid: string;
  displayName: string;
  email: string;
  role: "admin" | "agent";
  active: boolean;
}
