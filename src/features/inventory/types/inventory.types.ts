import type { Timestamp } from "firebase/firestore";

import type { Product } from "@/features/products";

export type InventoryOwnerType = "company" | "agent";
export type InventoryMovementType =
  | "initial"
  | "adjustment_in"
  | "adjustment_out"
  | "replenishment_out"
  | "replenishment_in"
  | "sale"
  | "purchase_in";
export type InventoryAdjustmentDirection = "in" | "out";
export type InventoryStockStatus =
  | "uninitialized"
  | "out"
  | "low"
  | "available";

export interface InventoryRecord {
  id: string;
  productId: string;
  ownerType: InventoryOwnerType;
  ownerId: string;
  quantity: number;
  lastMovementId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface InventoryMovement {
  id: string;
  inventoryId: string;
  productId: string;
  ownerType: InventoryOwnerType;
  ownerId: string;
  type: InventoryMovementType;
  quantity: number;
  quantityBefore: number;
  quantityAfter: number;
  reason: string;
  referenceType?: string;
  referenceId?: string;
  createdBy: string;
  createdAt: Timestamp;
}

export interface InitialStockInput {
  productId: string;
  ownerType: InventoryOwnerType;
  ownerId: string;
  quantity: number;
  reason: string;
}

export interface InventoryAdjustmentInput {
  inventoryId: string;
  direction: InventoryAdjustmentDirection;
  quantity: number;
  reason: string;
}

export interface InventoryAgent {
  uid: string;
  displayName: string;
  email: string;
}

export interface InventoryMovementSummary {
  initialStock: number;
  entries: number;
  sold: number;
  otherExits: number;
  expectedStock: number;
  consistent: boolean;
}

export interface InventoryViewRow {
  id: string;
  inventory: InventoryRecord | null;
  ownerId: string;
  ownerLabel: string;
  ownerType: InventoryOwnerType;
  product: Product;
  status: InventoryStockStatus;
  movementSummary: InventoryMovementSummary;
}
