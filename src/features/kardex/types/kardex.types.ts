import type { Timestamp } from "firebase/firestore";

import type { Product } from "@/features/products";
import type { InventoryOwnerType } from "@/features/inventory";

export type KardexMovementCategory = "all" | "initial" | "in" | "out";
export type KardexMovementDirection = "in" | "out" | "neutral";

export interface KardexMovement {
  id: string;
  inventoryId: string;
  productId: string;
  ownerType: InventoryOwnerType;
  ownerId: string;
  type: string;
  quantity: number;
  quantityBefore: number;
  quantityAfter: number;
  reason: string;
  referenceType?: string;
  referenceId?: string;
  createdBy: string;
  createdAt: Timestamp;
}

export interface KardexUserOption {
  uid: string;
  displayName: string;
  role: "admin" | "agent";
}

export interface KardexOwnerOption {
  key: string;
  ownerType: InventoryOwnerType;
  ownerId: string;
  label: string;
}

export interface KardexFilters {
  productId: string;
  ownerKey: string;
  category: KardexMovementCategory;
  dateFrom: string;
  dateTo: string;
  search: string;
}

export interface KardexRow {
  movement: KardexMovement;
  product: Product | null;
  productName: string;
  sku: string;
  ownerLabel: string;
  createdByLabel: string;
  direction: KardexMovementDirection;
  typeLabel: string;
  referenceLabel: string;
}

export interface KardexSummary {
  movements: number;
  entries: number;
  exits: number;
  net: number;
}
