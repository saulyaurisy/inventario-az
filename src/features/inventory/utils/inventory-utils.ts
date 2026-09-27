import type {
  InventoryOwnerType,
  InventoryStockStatus,
} from "../types/inventory.types";

const SAFE_ID_PART = /^[A-Za-z0-9_-]+$/;

export function getInventoryId(
  ownerType: InventoryOwnerType,
  ownerId: string,
  productId: string,
): string {
  if (
    !["company", "agent"].includes(ownerType) ||
    !SAFE_ID_PART.test(ownerId) ||
    !SAFE_ID_PART.test(productId)
  ) {
    throw new Error("Invalid inventory identifier");
  }

  return `${ownerType}__${ownerId}__${productId}`;
}

export function getStockStatus(
  quantity: number | null,
  minimumStock: number,
): InventoryStockStatus {
  if (quantity === null) return "uninitialized";
  if (quantity === 0) return "out";
  if (quantity <= minimumStock) return "low";
  return "available";
}

export const STOCK_STATUS_LABELS: Record<InventoryStockStatus, string> = {
  uninitialized: "Sin inventario inicializado",
  out: "Sin stock",
  low: "Stock bajo",
  available: "Disponible",
};

export function validatePositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}
