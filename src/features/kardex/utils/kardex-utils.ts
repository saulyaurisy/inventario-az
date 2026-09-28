import type {
  KardexMovement,
  KardexMovementCategory,
  KardexMovementDirection,
  KardexRow,
  KardexSummary,
} from "../types/kardex.types";

const INBOUND_TYPES = new Set([
  "initial",
  "adjustment_in",
  "replenishment_in",
  "purchase_in",
  "return",
  "purchase",
]);
const OUTBOUND_TYPES = new Set([
  "adjustment_out",
  "sale",
  "replenishment_out",
]);

const MOVEMENT_LABELS: Record<string, string> = {
  initial: "Stock inicial",
  adjustment_in: "Entrada por ajuste",
  adjustment_out: "Salida por ajuste",
  sale: "Venta",
  replenishment_in: "Entrada por reposición",
  replenishment_out: "Salida por reposición",
  return: "Devolución",
  purchase: "Compra",
  purchase_in: "Entrada por compra",
};

export function getKardexMovementDirection(
  movement: KardexMovement,
): KardexMovementDirection {
  if (INBOUND_TYPES.has(movement.type)) return "in";
  if (OUTBOUND_TYPES.has(movement.type)) return "out";
  if (movement.quantityAfter > movement.quantityBefore) return "in";
  if (movement.quantityAfter < movement.quantityBefore) return "out";
  return "neutral";
}

export function getKardexMovementLabel(type: string): string {
  const fallback = type
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  return MOVEMENT_LABELS[type] ?? (fallback || "Movimiento");
}

export function matchesKardexCategory(
  row: KardexRow,
  category: KardexMovementCategory,
): boolean {
  if (category === "all") return true;
  if (category === "initial") return row.movement.type === "initial";
  return row.direction === category && row.movement.type !== "initial";
}

export function calculateKardexSummary(rows: KardexRow[]): KardexSummary {
  return rows.reduce<KardexSummary>(
    (summary, row) => {
      summary.movements += 1;
      if (row.direction === "in") summary.entries += row.movement.quantity;
      if (row.direction === "out") summary.exits += row.movement.quantity;
      summary.net = summary.entries - summary.exits;
      return summary;
    },
    { movements: 0, entries: 0, exits: 0, net: 0 },
  );
}

export function formatKardexDate(date: Date): string {
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export function getLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
