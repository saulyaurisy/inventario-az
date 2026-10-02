import { FirebaseError } from "firebase/app";

import { listInventory, listInventoryOverviewMovements } from "@/features/inventory/services/inventory.service";
import {
  listProducts,
  listProductsByIds,
} from "@/features/products/services/products.service";
import { listPurchases } from "@/features/purchases/services/purchases.service";
import { listReplenishments, listReplenishmentUsers } from "@/features/replenishments/services/replenishment.service";
import { listSales } from "@/features/sales/services/sales.service";

import type {
  DailyProductReport,
  DailyProductReportRequest,
  ReportRequest,
  ReportsData,
} from "../types/report.types";
import { buildDailyProductReport, getDailyProductPeriod } from "../utils/daily-product-report-utils";
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

  const data = buildReportsData({
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
  return {
    ...data,
    agents: users
      .filter((item) => item.role === "agent" && item.active)
      .map((item) => ({ uid: item.uid, displayName: item.displayName }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, "es")),
  };
}

export async function getDailyProductReport(
  request: DailyProductReportRequest,
): Promise<DailyProductReport> {
  const period = getDailyProductPeriod(
    request.month,
    request.periodKey,
    request.customStart,
    request.customEnd,
  );
  const scopedAgentId = request.role === "admin" ? request.agentId : request.actorUid;
  const [sales, inventory, users] = await Promise.all([
    listSales(request.role, request.actorUid, scopedAgentId),
    listInventory(request.role, request.actorUid),
    request.role === "admin" ? listReplenishmentUsers() : Promise.resolve([]),
  ]);
  const visibleInventory = request.role === "admin" && request.agentId
    ? inventory.filter(
        (record) =>
          record.ownerType === "agent" && record.ownerId === request.agentId,
      )
    : inventory;
  const visibleProductIds = [
    ...new Set(
    visibleInventory.map((record) => record.productId),
    ),
  ];
  const visibleProducts = await listProductsByIds(visibleProductIds);
  const labels = new Map(users.map((item) => [item.uid, item.displayName]));
  labels.set(request.actorUid, request.actorDisplayName);
  return buildDailyProductReport(sales, visibleProducts, labels, period);
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
