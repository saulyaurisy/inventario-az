import type { Product } from "@/features/products";
import { toCents } from "@/features/sales";

import type { PurchaseDraftItem, PurchaseItem, PurchaseStatus } from "../types/purchase.types";

export const MAX_PURCHASE_ITEMS = 3;
export const PURCHASE_STATUS_LABELS: Record<PurchaseStatus, string> = { draft: "Borrador", received: "Recibida", cancelled: "Cancelada" };

export function calculatePurchase(items: PurchaseDraftItem[], products: Map<string, Product>): { items: PurchaseItem[]; subtotal: number; total: number } {
  if (items.length < 1 || items.length > MAX_PURCHASE_ITEMS) throw new Error("Invalid purchase items");
  const seen = new Set<string>();
  const calculated = items.map((item) => {
    const product = products.get(item.productId);
    if (!product || !product.active || seen.has(item.productId) || !Number.isInteger(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.unitCost) || item.unitCost < 0) throw new Error("Invalid purchase items");
    seen.add(item.productId);
    const unitCost = toCents(item.unitCost);
    return { productId: product.id, sku: product.sku, name: product.name, quantity: item.quantity, unitCost, lineTotal: item.quantity * unitCost };
  });
  const subtotal = calculated.reduce((sum, item) => sum + item.lineTotal, 0);
  return { items: calculated, subtotal, total: subtotal };
}

export function formatPurchaseNumber(sequence: number): string { return `C-${String(sequence).padStart(6, "0")}`; }
export function getPurchaseMovementId(purchaseId: string, productId: string): string { return `purchase__${purchaseId}__${productId}`; }
