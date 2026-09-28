import { FirebaseError } from "firebase/app";

import type { UserRole } from "@/features/auth";
import { listClients } from "@/features/clients/services/clients.service";
import type { InventoryRecord } from "@/features/inventory";
import { listInventory } from "@/features/inventory/services/inventory.service";
import { listProofs } from "@/features/payment-proofs/services/payment-proofs.service";
import type { Product } from "@/features/products";
import { listProducts } from "@/features/products/services/products.service";
import { listPurchases } from "@/features/purchases/services/purchases.service";
import { listReplenishments } from "@/features/replenishments/services/replenishment.service";
import type { Sale } from "@/features/sales";
import { listSales } from "@/features/sales/services/sales.service";

import type {
  ClientMetrics,
  DashboardAlert,
  DashboardData,
  DashboardMetrics,
  DashboardPeriod,
  DashboardRequest,
  InventoryAlertItem,
  InventoryMetrics,
  PaymentProofMetrics,
  PurchaseMetrics,
  RecentActivityItem,
  ReplenishmentMetrics,
  SalesMetrics,
  SalesTrendPoint,
  TopClientMetric,
  TopProductMetric,
} from "../types/dashboard.types";
import {
  getDashboardPeriod,
  isDateInPeriod,
  listPeriodDays,
  toLocalDateKey,
} from "../utils/dashboard-utils";

const RECENT_ACTIVITY_LIMIT = 12;
const OLD_DRAFT_DAYS = 7;

type DashboardSources = Awaited<ReturnType<typeof loadDashboardSources>>;

async function loadDashboardSources(role: UserRole, actorUid: string) {
  const [sales, inventory, replenishments, proofs, clients, products, purchases] =
    await Promise.all([
      listSales(role, actorUid),
      listInventory(role, actorUid),
      listReplenishments(role, actorUid),
      listProofs(role, actorUid),
      listClients(),
      listProducts(),
      role === "admin" ? listPurchases() : Promise.resolve([]),
    ]);

  return {
    sales,
    inventory,
    replenishments,
    proofs,
    clients,
    products,
    purchases,
  };
}

function getCompletedSales(sales: Sale[], period: DashboardPeriod): Sale[] {
  return sales.filter(
    (sale) =>
      sale.status === "completed" &&
      isDateInPeriod(sale.createdAt.toDate(), period),
  );
}

function buildSalesTrend(
  completedSales: Sale[],
  period: DashboardPeriod,
): SalesTrendPoint[] {
  const totalsByDate = new Map<string, number>();
  for (const sale of completedSales) {
    const key = toLocalDateKey(sale.createdAt.toDate());
    totalsByDate.set(key, (totalsByDate.get(key) ?? 0) + sale.total);
  }

  const labelFormatter = new Intl.DateTimeFormat("es-PE", {
    day: "2-digit",
    month: "short",
  });
  return listPeriodDays(period).map((date) => ({
    date: toLocalDateKey(date),
    label: labelFormatter.format(date),
    total: totalsByDate.get(toLocalDateKey(date)) ?? 0,
  }));
}

function buildTopProducts(completedSales: Sale[]): TopProductMetric[] {
  const products = new Map<string, TopProductMetric>();
  for (const sale of completedSales) {
    for (const item of sale.items) {
      const current = products.get(item.productId);
      products.set(item.productId, {
        productId: item.productId,
        sku: item.sku,
        name: item.name,
        units: (current?.units ?? 0) + item.quantity,
        amount: (current?.amount ?? 0) + item.lineTotal,
      });
    }
  }
  return [...products.values()]
    .sort((a, b) => b.units - a.units || b.amount - a.amount)
    .slice(0, 5);
}

function buildTopClients(completedSales: Sale[]): TopClientMetric[] {
  const clients = new Map<string, TopClientMetric>();
  for (const sale of completedSales) {
    const current = clients.get(sale.clientId);
    clients.set(sale.clientId, {
      clientId: sale.clientId,
      name: sale.clientSnapshot.name,
      salesCount: (current?.salesCount ?? 0) + 1,
      total: (current?.total ?? 0) + sale.total,
    });
  }
  return [...clients.values()]
    .sort((a, b) => b.total - a.total || b.salesCount - a.salesCount)
    .slice(0, 5);
}

export function getSalesMetrics(
  sales: Sale[],
  period: DashboardPeriod,
): SalesMetrics {
  const completed = getCompletedSales(sales, period);
  const subtotal = completed.reduce((sum, sale) => sum + sale.subtotal, 0);
  const totalDiscount = completed.reduce(
    (sum, sale) => sum + sale.totalDiscount,
    0,
  );
  const totalSold = completed.reduce((sum, sale) => sum + sale.total, 0);
  const cancelledCount = sales.filter(
    (sale) =>
      sale.status === "cancelled" &&
      isDateInPeriod(sale.createdAt.toDate(), period),
  ).length;

  return {
    salesCount: completed.length,
    subtotal,
    totalDiscount,
    totalSold,
    averageTicket:
      completed.length > 0 ? Math.round(totalSold / completed.length) : 0,
    cancelledCount,
    trend: buildSalesTrend(completed, period),
    topProducts: buildTopProducts(completed),
    topClients: buildTopClients(completed),
  };
}

function getInventoryAlertItem(
  record: InventoryRecord,
  product: Product,
): InventoryAlertItem {
  return {
    inventoryId: record.id,
    productId: product.id,
    sku: product.sku,
    name: product.name,
    quantity: record.quantity,
    minimumStock: product.minimumStock,
    ownerLabel: record.ownerType === "company" ? "Empresa" : "Agente",
  };
}

export function getInventoryMetrics(
  inventory: InventoryRecord[],
  products: Product[],
  role: UserRole,
): InventoryMetrics {
  const productById = new Map(products.map((product) => [product.id, product]));
  const relevant = inventory.filter(
    (record) => role === "admin" || record.ownerType === "agent",
  );
  const alertItems = relevant.flatMap((record) => {
    const product = productById.get(record.productId);
    return product?.active ? [getInventoryAlertItem(record, product)] : [];
  });
  const lowStockItems = alertItems.filter(
    (item) => item.quantity <= item.minimumStock,
  );
  const outOfStockItems = alertItems.filter((item) => item.quantity === 0);

  return {
    companyUnits: inventory
      .filter((record) => record.ownerType === "company")
      .reduce((sum, record) => sum + record.quantity, 0),
    agentUnits: inventory
      .filter((record) => record.ownerType === "agent")
      .reduce((sum, record) => sum + record.quantity, 0),
    ownUnits:
      role === "agent"
        ? inventory.reduce((sum, record) => sum + record.quantity, 0)
        : 0,
    lowStockCount: lowStockItems.length,
    outOfStockCount: outOfStockItems.length,
    lowStockItems,
    outOfStockItems,
  };
}

function getPurchaseMetrics(
  sources: DashboardSources,
  period: DashboardPeriod,
  now: Date,
): PurchaseMetrics {
  const received = sources.purchases.filter(
    (purchase) =>
      purchase.status === "received" &&
      purchase.receivedAt &&
      isDateInPeriod(purchase.receivedAt.toDate(), period),
  );
  const oldDraftThreshold = now.getTime() - OLD_DRAFT_DAYS * 86_400_000;
  return {
    receivedCount: received.length,
    totalPurchased: received.reduce(
      (sum, purchase) => sum + purchase.total,
      0,
    ),
    unitsReceived: received.reduce(
      (sum, purchase) =>
        sum + purchase.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
      0,
    ),
    oldDraftCount: sources.purchases.filter(
      (purchase) =>
        purchase.status === "draft" &&
        purchase.createdAt.toMillis() < oldDraftThreshold,
    ).length,
  };
}

export function getReplenishmentMetrics(
  sources: DashboardSources,
  period: DashboardPeriod,
): ReplenishmentMetrics {
  return {
    pendingCount: sources.replenishments.filter(
      (replenishment) => replenishment.status === "pending",
    ).length,
    inTransitCount: sources.replenishments.filter(
      (replenishment) => replenishment.status === "sent",
    ).length,
    receivedInPeriodCount: sources.replenishments.filter(
      (replenishment) =>
        replenishment.status === "received" &&
        replenishment.receivedAt &&
        isDateInPeriod(replenishment.receivedAt.toDate(), period),
    ).length,
  };
}

export function getPaymentProofMetrics(
  sources: DashboardSources,
  period: DashboardPeriod,
): PaymentProofMetrics {
  return {
    providedCount: sources.proofs.filter((proof) => proof.status === "provided")
      .length,
    rejectedCount: sources.proofs.filter((proof) => proof.status === "rejected")
      .length,
    verifiedInPeriodCount: sources.proofs.filter(
      (proof) =>
        proof.status === "verified" &&
        proof.verifiedAt &&
        isDateInPeriod(proof.verifiedAt.toDate(), period),
    ).length,
  };
}

function getClientMetrics(
  sources: DashboardSources,
  period: DashboardPeriod,
): ClientMetrics {
  return {
    activeCount: sources.clients.filter((client) => client.active).length,
    createdInPeriodCount: sources.clients.filter((client) =>
      isDateInPeriod(client.createdAt.toDate(), period),
    ).length,
  };
}

export function getRecentActivity(
  sources: DashboardSources,
  role: UserRole,
): RecentActivityItem[] {
  const saleById = new Map(sources.sales.map((sale) => [sale.id, sale]));
  const items: RecentActivityItem[] = sources.sales.map((sale) => ({
    id: `sale-${sale.id}`,
    type: "sale",
    title: `Venta ${sale.number}`,
    description: `${sale.clientSnapshot.name} · ${sale.status === "completed" ? "Completada" : "Anulada"}`,
    occurredAt: sale.createdAt.toDate(),
    amount: sale.total,
  }));

  if (role === "admin") {
    for (const purchase of sources.purchases) {
      if (purchase.status !== "received" || !purchase.receivedAt) continue;
      items.push({
        id: `purchase-${purchase.id}`,
        type: "purchase",
        title: `Compra ${purchase.number} recibida`,
        description: purchase.supplierSnapshot.name,
        occurredAt: purchase.receivedAt.toDate(),
        amount: purchase.total,
      });
    }
  }

  for (const replenishment of sources.replenishments) {
    if (replenishment.sentAt) {
      items.push({
        id: `replenishment-sent-${replenishment.id}`,
        type: "replenishment_sent",
        title: `Reposición ${replenishment.number} enviada`,
        description: `${replenishment.items.length} producto(s)`,
        occurredAt: replenishment.sentAt.toDate(),
      });
    }
    if (replenishment.receivedAt) {
      items.push({
        id: `replenishment-received-${replenishment.id}`,
        type: "replenishment_received",
        title: `Reposición ${replenishment.number} recibida`,
        description: `${replenishment.items.length} producto(s)`,
        occurredAt: replenishment.receivedAt.toDate(),
      });
    }
  }

  for (const proof of sources.proofs) {
    const saleNumber = saleById.get(proof.saleId)?.number ?? proof.saleId;
    const occurredAt =
      proof.status === "verified"
        ? proof.verifiedAt?.toDate()
        : proof.status === "rejected"
          ? proof.rejectedAt?.toDate()
          : proof.createdAt.toDate();
    if (!occurredAt) continue;
    items.push({
      id: `proof-${proof.id}-${proof.status}`,
      type: `proof_${proof.status}`,
      title:
        proof.status === "provided"
          ? "Comprobante proporcionado"
          : proof.status === "verified"
            ? "Comprobante verificado"
            : "Comprobante rechazado",
      description: `Venta ${saleNumber}`,
      occurredAt,
      amount: proof.amount,
    });
  }

  return items
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
    .slice(0, RECENT_ACTIVITY_LIMIT);
}

function buildAlerts(
  metrics: DashboardMetrics,
  role: UserRole,
): DashboardAlert[] {
  const alerts: DashboardAlert[] = [];
  if (metrics.inventory.outOfStockCount > 0) {
    alerts.push({
      id: "out-of-stock",
      severity: "critical",
      title: "Productos sin stock",
      description:
        role === "admin"
          ? "Hay existencias agotadas en empresa o agentes."
          : "Hay productos agotados en tu inventario.",
      count: metrics.inventory.outOfStockCount,
    });
  }
  if (metrics.inventory.lowStockCount > 0) {
    alerts.push({
      id: "low-stock",
      severity: "warning",
      title: "Stock bajo",
      description: "Incluye registros agotados y cantidades iguales o menores al mínimo.",
      count: metrics.inventory.lowStockCount,
    });
  }
  if (metrics.replenishments.inTransitCount > 0) {
    alerts.push({
      id: "in-transit",
      severity: "info",
      title: "Reposiciones en tránsito",
      description:
        role === "admin"
          ? "Reposiciones enviadas pendientes de recepción."
          : "Tienes reposiciones enviadas pendientes de recibir.",
      count: metrics.replenishments.inTransitCount,
    });
  }
  if (role === "admin" && metrics.paymentProofs.providedCount > 0) {
    alerts.push({
      id: "proofs-to-review",
      severity: "warning",
      title: "Comprobantes por verificar",
      description: "Comprobantes registrados pendientes de revisión administrativa.",
      count: metrics.paymentProofs.providedCount,
    });
  }
  if (role === "agent" && metrics.paymentProofs.rejectedCount > 0) {
    alerts.push({
      id: "rejected-proofs",
      severity: "critical",
      title: "Comprobantes rechazados",
      description: "Corrige los comprobantes rechazados de tus ventas.",
      count: metrics.paymentProofs.rejectedCount,
    });
  }
  if (role === "admin" && metrics.purchases.oldDraftCount > 0) {
    alerts.push({
      id: "old-purchase-drafts",
      severity: "info",
      title: "Compras en borrador antiguas",
      description: `Borradores con más de ${OLD_DRAFT_DAYS} días sin recibir.`,
      count: metrics.purchases.oldDraftCount,
    });
  }
  return alerts;
}

export async function getDashboardData({
  role,
  actorUid,
  periodKey,
  now = new Date(),
}: DashboardRequest): Promise<DashboardData> {
  const period = getDashboardPeriod(periodKey, now);
  const sources = await loadDashboardSources(role, actorUid);
  const metrics: DashboardMetrics = {
    sales: getSalesMetrics(sources.sales, period),
    purchases: getPurchaseMetrics(sources, period, now),
    inventory: getInventoryMetrics(sources.inventory, sources.products, role),
    replenishments: getReplenishmentMetrics(sources, period),
    paymentProofs: getPaymentProofMetrics(sources, period),
    clients: getClientMetrics(sources, period),
  };

  return {
    role,
    period,
    metrics,
    activity: getRecentActivity(sources, role),
    alerts: buildAlerts(metrics, role),
    generatedAt: now,
  };
}

export function getDashboardErrorMessage(error: unknown): string {
  if (error instanceof FirebaseError) {
    if (error.code === "permission-denied") {
      return "No tienes permisos para consultar una o más métricas.";
    }
    if (error.code === "unavailable") {
      return "No se pudo conectar con Firebase. Revisa tu conexión e intenta nuevamente.";
    }
  }
  return "No pudimos cargar el dashboard. Intenta nuevamente.";
}
