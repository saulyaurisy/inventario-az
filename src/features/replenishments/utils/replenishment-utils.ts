import type {
  ReplenishmentItem,
  ReplenishmentStatus,
} from "../types/replenishment.types";

export const MAX_REPLENISHMENT_ITEMS = 3;

export const REPLENISHMENT_STATUS_LABELS: Record<
  ReplenishmentStatus,
  string
> = {
  pending: "Pendiente",
  sent: "Enviada",
  received: "Recibida",
  cancelled: "Cancelada",
};

export function getReplenishmentMovementId(
  replenishmentId: string,
  phase: "sent" | "received",
  productId: string,
): string {
  return `replenishment__${replenishmentId}__${phase}__${productId}`;
}

export function validateReplenishmentItems(items: ReplenishmentItem[]): boolean {
  if (items.length < 1 || items.length > MAX_REPLENISHMENT_ITEMS) return false;
  const productIds = new Set<string>();
  for (const item of items) {
    if (
      !item.productId ||
      !Number.isInteger(item.quantity) ||
      item.quantity <= 0 ||
      productIds.has(item.productId)
    ) {
      return false;
    }
    productIds.add(item.productId);
  }
  return true;
}

export function formatReplenishmentNumber(sequence: number): string {
  return `REP-${String(sequence).padStart(6, "0")}`;
}
