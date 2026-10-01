import { FirebaseError } from "firebase/app";

import { listInventory, listInventoryOverviewMovements } from "@/features/inventory/services/inventory.service";
import { listProducts } from "@/features/products/services/products.service";
import { listPurchases } from "@/features/purchases/services/purchases.service";
import { listReplenishments, listReplenishmentUsers } from "@/features/replenishments/services/replenishment.service";
import { listSales } from "@/features/sales/services/sales.service";

import type { ReportRequest, ReportsData } from "../types/report.types";
import { buildReportsData, getReportPeriod } from "../utils/report-utils";

export async function getReportsData(request: ReportRequest): Promise<ReportsData> {
  const period = getReportPeriod(
    request.periodKey,
    new Date(),
    request.startDate,
    request.endDate,
  );

  const [sales, inventory, movements, replenishments, products, purchases, users] = await Promise.all([
    listSales(request.role, request.actorUid),
    listInventory(request.role, request.actorUid),
    listInventoryOverviewMovements(request.role, request.actorUid),
    listReplenishments(request.role, request.actorUid),
    listProducts(),
    request.role === "admin" ? listPurchases() : Promise.resolve([]),
    request.role === "admin" ? listReplenishmentUsers() : Promise.resolve([]),
  ]);

  const labels = new Map<string, string>();
  for (const item of users) labels.set(item.uid, item.displayName);

  return buildReportsData({
    actorDisplayName: request.actorDisplayName,
    actorUid: request.actorUid,
    role: request.role,
    sales,
    inventory,
    movements,
    replenishments,
    products,
    purchases,
    labels,
  }, period);
}

export function getReportsErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message === "Invalid report period") {
    return "Selecciona un rango válido de hasta 366 días.";
  }
  if (error instanceof FirebaseError) {
    if (error.code === "permission-denied") {
      return "No tienes permisos para consultar este reporte.";
    }
    if (error.code === "unavailable") {
      return "No se pudo conectar con Firebase. Revisa tu conexión e intenta nuevamente.";
    }
  }
  return "No pudimos generar los reportes. Intenta nuevamente.";
}
