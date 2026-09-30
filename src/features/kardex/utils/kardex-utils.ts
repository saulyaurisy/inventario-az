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
  adjustment_in: "Ajuste de entrada",
  adjustment_out: "Ajuste de salida",
  sale: "Venta",
  replenishment_in: "Reposición recibida",
  replenishment_out: "Reposición enviada",
  return: "Devolución",
  purchase: "Compra",
  purchase_in: "Compra recibida",
};

const REFERENCE_LABELS: Record<string, string> = {
  sale: "Venta",
  replenishment: "Reposición",
  purchase: "Compra",
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

function extractBusinessNumber(movement: KardexMovement): string | null {
  const patterns: Record<string, RegExp> = {
    sale: /\bV-(\d+)\b/i,
    replenishment: /\bREP-(\d+)\b/i,
    purchase: /\bC-(\d+)\b/i,
  };
  const match = patterns[movement.referenceType ?? ""]?.exec(movement.reason);
  return match?.[1] ?? null;
}

export function getKardexReferenceLabel(movement: KardexMovement): string {
  if (!movement.referenceType && !movement.referenceId) return "Sin referencia";

  const label = REFERENCE_LABELS[movement.referenceType ?? ""] ?? "Referencia";
  const businessNumber = extractBusinessNumber(movement);
  if (businessNumber) return `${label} #${businessNumber}`;

  if (movement.referenceType === "replenishment") {
    const requestNumber = /\b(SOL-[A-Za-z0-9]+)\b/.exec(movement.reason)?.[1];
    if (requestNumber) return "Solicitud de reposición";
  }

  return label;
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
