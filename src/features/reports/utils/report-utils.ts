import type { InventoryMovement, InventoryRecord } from "@/features/inventory";
import {
  calculateInventoryMovementSummary,
  getStockStatus,
} from "@/features/inventory/utils/inventory-utils";
import type { Product } from "@/features/products";
import type { Purchase } from "@/features/purchases";
import type { Replenishment } from "@/features/replenishments";
import type { Sale } from "@/features/sales";
import { getSalePayments, PAYMENT_METHOD_LABELS } from "@/features/sales";

import type {
  ClientReportRow,
  InventoryReportRow,
  PaymentReportRow,
  ProductReportRow,
  ReportPeriod,
  ReportPeriodKey,
  ReportsData,
  SalesReport,
} from "../types/report.types";

export const REPORT_PERIOD_OPTIONS: readonly { key: ReportPeriodKey; label: string }[] = [
  { key: "today", label: "Hoy" },
  { key: "last7", label: "Últimos 7 días" },
  { key: "last30", label: "Últimos 30 días" },
  { key: "thisMonth", label: "Mes actual" },
  { key: "previousMonth", label: "Mes anterior" },
  { key: "custom", label: "Personalizado" },
];

const MAX_CUSTOM_DAYS = 366;

function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function endOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 23, 59, 59, 999);
}

function parseDateInput(value: string): Date {
  const parts = value.split("-").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part))) {
    throw new Error("Invalid report period");
  }
  const [year, month, day] = parts;
  const parsed = new Date(year, month - 1, day);
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) {
    throw new Error("Invalid report period");
  }
  return parsed;
}

export function getReportPeriod(
  key: ReportPeriodKey,
  now = new Date(),
  startDate?: string,
  endDate?: string,
): ReportPeriod {
  const today = startOfDay(now);
  let start = today;
  let end = endOfDay(now);

  if (key === "last7") {
    start = new Date(today);
    start.setDate(start.getDate() - 6);
  } else if (key === "last30") {
    start = new Date(today);
    start.setDate(start.getDate() - 29);
  } else if (key === "thisMonth") {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (key === "previousMonth") {
    start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    end = endOfDay(new Date(now.getFullYear(), now.getMonth(), 0));
  } else if (key === "custom") {
    if (!startDate || !endDate) throw new Error("Invalid report period");
    start = startOfDay(parseDateInput(startDate));
    end = endOfDay(parseDateInput(endDate));
    if (start > end || end.getTime() - start.getTime() > MAX_CUSTOM_DAYS * 86_400_000) {
      throw new Error("Invalid report period");
    }
  }

  return {
    key,
    label: REPORT_PERIOD_OPTIONS.find((option) => option.key === key)?.label ?? "Período",
    start,
    end,
  };
}

export function isInReportPeriod(value: Date, period: ReportPeriod): boolean {
  return value >= period.start && value <= period.end;
}

export function toLocalDateKey(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

export function formatReportPeriod(period: ReportPeriod): string {
  const formatter = new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "short", year: "numeric" });
  return `${formatter.format(period.start)} al ${formatter.format(period.end)}`;
}

function allocateGlobalDiscount(sale: Sale): number[] {
  if (sale.globalDiscountAmount <= 0 || sale.items.length === 0) return sale.items.map(() => 0);
  const base = sale.items.reduce((sum, item) => sum + item.lineTotal, 0);
  if (base <= 0) return sale.items.map(() => 0);
  let assigned = 0;
  return sale.items.map((item, index) => {
    if (index === sale.items.length - 1) return sale.globalDiscountAmount - assigned;
    const share = Math.floor((sale.globalDiscountAmount * item.lineTotal) / base);
    assigned += share;
    return share;
  });
}

function buildSalesReport(sales: Sale[], labels: Map<string, string>, period: ReportPeriod): SalesReport {
  const inPeriod = sales.filter((sale) => isInReportPeriod(sale.createdAt.toDate(), period));
  const completed = inPeriod.filter((sale) => sale.status === "completed");
  const gross = completed.reduce((sum, sale) => sum + sale.subtotal, 0);
  const discount = completed.reduce((sum, sale) => sum + sale.totalDiscount, 0);
  const net = completed.reduce((sum, sale) => sum + sale.total, 0);
  const totals = new Map<string, number>();
  for (const sale of completed) {
    const key = toLocalDateKey(sale.createdAt.toDate());
    totals.set(key, (totals.get(key) ?? 0) + sale.total);
  }
  const trend: SalesReport["trend"] = [];
  const cursor = startOfDay(period.start);
  const formatter = new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "short" });
  while (cursor <= period.end) {
    const key = toLocalDateKey(cursor);
    trend.push({ date: key, label: formatter.format(cursor), total: totals.get(key) ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  return {
    count: completed.length,
    gross,
    discount,
    net,
    averageTicket: completed.length ? Math.round(net / completed.length) : 0,
    units: completed.reduce((sum, sale) => sum + sale.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0),
    cancelledCount: inPeriod.length - completed.length,
    trend,
    rows: inPeriod.map((sale) => ({
      id: sale.id,
      createdAt: sale.createdAt.toDate(),
      number: sale.number,
      client: sale.clientSnapshot.name,
      agent: labels.get(sale.agentId) ?? "Agente",
      units: sale.items.reduce((sum, item) => sum + item.quantity, 0),
      subtotal: sale.subtotal,
      discount: sale.totalDiscount,
      total: sale.total,
      payment: getSalePayments(sale).map((payment) => PAYMENT_METHOD_LABELS[payment.method]).join(" + "),
      sale,
      status: sale.status,
    })),
  };
}

function buildProducts(sales: Sale[]): ProductReportRow[] {
  const rows = new Map<string, ProductReportRow & { saleIds: Set<string> }>();
  for (const sale of sales.filter((item) => item.status === "completed")) {
    const globalShares = allocateGlobalDiscount(sale);
    sale.items.forEach((item, index) => {
      const current = rows.get(item.productId);
      const lineDiscount = item.discountAmount + globalShares[index];
      rows.set(item.productId, {
        productId: item.productId,
        sku: item.sku,
        name: item.name,
        units: (current?.units ?? 0) + item.quantity,
        salesCount: 0,
        net: (current?.net ?? 0) + item.lineTotal - globalShares[index],
        discount: (current?.discount ?? 0) + lineDiscount,
        saleIds: new Set([...(current?.saleIds ?? []), sale.id]),
      });
    });
  }
  return [...rows.values()]
    .map(({ saleIds, ...row }) => ({ ...row, salesCount: saleIds.size }))
    .sort((a, b) => b.units - a.units || b.net - a.net);
}

function buildClients(sales: Sale[]): ClientReportRow[] {
  const rows = new Map<string, Omit<ClientReportRow, "averageTicket">>();
  for (const sale of sales.filter((item) => item.status === "completed")) {
    const current = rows.get(sale.clientId);
    const createdAt = sale.createdAt.toDate();
    rows.set(sale.clientId, {
      clientId: sale.clientId,
      name: sale.clientSnapshot.name,
      document: `${sale.clientSnapshot.documentType} ${sale.clientSnapshot.documentNumber}`,
      purchases: (current?.purchases ?? 0) + 1,
      units: (current?.units ?? 0) + sale.items.reduce((sum, item) => sum + item.quantity, 0),
      total: (current?.total ?? 0) + sale.total,
      lastPurchaseAt: !current || createdAt > current.lastPurchaseAt ? createdAt : current.lastPurchaseAt,
    });
  }
  return [...rows.values()]
    .map((row) => ({ ...row, averageTicket: Math.round(row.total / row.purchases) }))
    .sort((a, b) => b.total - a.total || b.purchases - a.purchases);
}

function buildPayments(sales: Sale[]): PaymentReportRow[] {
  const rows = new Map<PaymentReportRow["method"], Omit<PaymentReportRow, "percentage">>();
  for (const sale of sales.filter((item) => item.status === "completed")) {
    for (const payment of getSalePayments(sale)) {
      const current = rows.get(payment.method);
      rows.set(payment.method, {
        method: payment.method,
        amount: (current?.amount ?? 0) + payment.amount,
        salesCount: (current?.salesCount ?? 0) + 1,
      });
    }
  }
  const total = [...rows.values()].reduce((sum, row) => sum + row.amount, 0);
  return [...rows.values()]
    .map((row) => ({ ...row, percentage: total ? (row.amount / total) * 100 : 0 }))
    .sort((a, b) => b.amount - a.amount);
}

function buildInventory(
  inventory: InventoryRecord[],
  movements: InventoryMovement[],
  products: Product[],
  labels: Map<string, string>,
): InventoryReportRow[] {
  const productMap = new Map(products.map((product) => [product.id, product]));
  const movementMap = new Map<string, InventoryMovement[]>();
  for (const movement of movements) {
    const current = movementMap.get(movement.inventoryId) ?? [];
    current.push(movement);
    movementMap.set(movement.inventoryId, current);
  }
  return inventory.flatMap((record) => {
    const product = productMap.get(record.productId);
    if (!product) return [];
    const summary = calculateInventoryMovementSummary(movementMap.get(record.id) ?? [], record.quantity);
    return [{
      id: record.id,
      name: product.name,
      sku: product.sku,
      owner: record.ownerType === "company" ? "Empresa" : labels.get(record.ownerId) ?? "Agente",
      ownerId: record.ownerId,
      ownerType: record.ownerType,
      initialStock: summary.initialStock,
      entries: summary.entries,
      sold: summary.sold,
      otherExits: summary.otherExits,
      currentStock: record.quantity,
      minimumStock: product.minimumStock,
      status: getStockStatus(record.quantity, product.minimumStock),
    }];
  }).sort((a, b) => a.name.localeCompare(b.name, "es") || a.owner.localeCompare(b.owner, "es"));
}

interface ReportSources {
  actorDisplayName: string;
  actorUid: string;
  inventory: InventoryRecord[];
  labels: Map<string, string>;
  movements: InventoryMovement[];
  products: Product[];
  purchases: Purchase[];
  replenishments: Replenishment[];
  role: "admin" | "agent";
  sales: Sale[];
}

export function buildReportsData(sources: ReportSources, period: ReportPeriod): ReportsData {
  const labels = new Map(sources.labels);
  labels.set(sources.actorUid, sources.actorDisplayName);
  const periodSales = sources.sales.filter((sale) => isInReportPeriod(sale.createdAt.toDate(), period));
  const periodReplenishments = sources.replenishments.filter((item) => isInReportPeriod(item.createdAt.toDate(), period));
  const periodPurchases = sources.purchases.filter((item) => isInReportPeriod(item.createdAt.toDate(), period));
  const replenishmentRows = periodReplenishments.map((item) => ({
    id: item.id,
    number: item.number,
    origin: item.origin,
    agentId: item.agentId,
    agent: labels.get(item.agentId) ?? "Agente",
    createdAt: item.createdAt.toDate(),
    status: item.status,
    items: item.items.length,
    units: item.items.reduce((sum, entry) => sum + entry.quantity, 0),
    ...(item.sentAt ? { sentAt: item.sentAt.toDate() } : {}),
    ...(item.receivedAt ? { receivedAt: item.receivedAt.toDate() } : {}),
  }));
  const purchaseRows = periodPurchases.map((item) => ({
    id: item.id,
    number: item.number,
    createdAt: item.createdAt.toDate(),
    supplier: item.supplierSnapshot.name,
    items: item.items.length,
    units: item.items.reduce((sum, entry) => sum + entry.quantity, 0),
    total: item.total,
    status: item.status,
    ...(item.receivedAt ? { receivedAt: item.receivedAt.toDate() } : {}),
  }));
  return {
    role: sources.role,
    period,
    generatedAt: new Date(),
    sales: buildSalesReport(sources.sales, labels, period),
    products: buildProducts(periodSales),
    clients: buildClients(periodSales),
    payments: buildPayments(periodSales),
    inventory: buildInventory(sources.inventory, sources.movements, sources.products, labels),
    replenishments: {
      total: replenishmentRows.length,
      pending: replenishmentRows.filter((item) => item.status === "pending").length,
      sent: replenishmentRows.filter((item) => item.status === "sent").length,
      received: replenishmentRows.filter((item) => item.status === "received").length,
      cancelled: replenishmentRows.filter((item) => item.status === "cancelled").length,
      unitsRequested: replenishmentRows.reduce((sum, item) => sum + item.units, 0),
      unitsSent: replenishmentRows.filter((item) => item.status === "sent" || item.status === "received").reduce((sum, item) => sum + item.units, 0),
      unitsReceived: replenishmentRows.filter((item) => item.status === "received").reduce((sum, item) => sum + item.units, 0),
      rows: replenishmentRows,
    },
    ...(sources.role === "admin" ? {
      purchases: {
        received: purchaseRows.filter((item) => item.status === "received").length,
        draft: purchaseRows.filter((item) => item.status === "draft").length,
        cancelled: purchaseRows.filter((item) => item.status === "cancelled").length,
        total: purchaseRows.filter((item) => item.status === "received").reduce((sum, item) => sum + item.total, 0),
        unitsReceived: purchaseRows.filter((item) => item.status === "received").reduce((sum, item) => sum + item.units, 0),
        suppliers: new Set(purchaseRows.filter((item) => item.status === "received").map((item) => item.supplier)).size,
        rows: purchaseRows,
      },
    } : {}),
  };
}
