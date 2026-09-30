import type {
  InventoryMovement,
  InventoryMovementSummary,
  InventoryOwnerType,
  InventoryStockStatus,
} from "../types/inventory.types";

const ENTRY_TYPES = new Set<InventoryMovement["type"]>([
  "adjustment_in",
  "replenishment_in",
  "purchase_in",
]);
const OTHER_EXIT_TYPES = new Set<InventoryMovement["type"]>([
  "adjustment_out",
  "replenishment_out",
]);

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

export function calculateInventoryMovementSummary(
  movements: InventoryMovement[],
  currentQuantity: number | null,
): InventoryMovementSummary {
  const totals = movements.reduce(
    (summary, movement) => {
      if (movement.type === "initial") summary.initialStock += movement.quantity;
      if (ENTRY_TYPES.has(movement.type)) summary.entries += movement.quantity;
      if (movement.type === "sale") summary.sold += movement.quantity;
      if (OTHER_EXIT_TYPES.has(movement.type)) summary.otherExits += movement.quantity;
      return summary;
    },
    { initialStock: 0, entries: 0, sold: 0, otherExits: 0 },
  );
  const expectedStock =
    totals.initialStock + totals.entries - totals.sold - totals.otherExits;
  return {
    ...totals,
    expectedStock,
    consistent: currentQuantity === null || expectedStock === currentQuantity,
  };
}
