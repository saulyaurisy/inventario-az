import type { UserRole } from "@/features/auth";
import type { InventoryStockStatus } from "@/features/inventory/types/inventory.types";
import type { PaymentMethod, Sale, SaleStatus } from "@/features/sales";
import type { PurchaseStatus } from "@/features/purchases";
import type { ReplenishmentOrigin, ReplenishmentStatus } from "@/features/replenishments";

export type ReportPeriodKey =
  | "today"
  | "last7"
  | "last30"
  | "thisMonth"
  | "previousMonth"
  | "custom";

export type ReportTab =
  | "sales"
  | "products"
  | "clients"
  | "payments"
  | "inventory"
  | "replenishments"
  | "purchases";

export interface ReportPeriod {
  key: ReportPeriodKey;
  label: string;
  start: Date;
  end: Date;
}

export interface ReportRequest {
  actorDisplayName: string;
  actorUid: string;
  endDate?: string;
  periodKey: ReportPeriodKey;
  role: UserRole;
  startDate?: string;
}

export interface SalesReportRow {
  agent: string;
  client: string;
  createdAt: Date;
  discount: number;
  id: string;
  number: string;
  payment: string;
  sale: Sale;
  status: SaleStatus;
  subtotal: number;
  total: number;
  units: number;
}

export interface SalesReport {
  averageTicket: number;
  cancelledCount: number;
  count: number;
  discount: number;
  gross: number;
  net: number;
  rows: SalesReportRow[];
  trend: Array<{ date: string; label: string; total: number }>;
  units: number;
}

export interface ProductReportRow {
  discount: number;
  name: string;
  net: number;
  productId: string;
  salesCount: number;
  sku: string;
  units: number;
}

export interface ClientReportRow {
  averageTicket: number;
  clientId: string;
  document: string;
  lastPurchaseAt: Date;
  name: string;
  purchases: number;
  total: number;
  units: number;
}

export interface PaymentReportRow {
  amount: number;
  method: PaymentMethod;
  percentage: number;
  salesCount: number;
}

export interface InventoryReportRow {
  currentStock: number;
  entries: number;
  id: string;
  initialStock: number;
  minimumStock: number;
  name: string;
  otherExits: number;
  owner: string;
  ownerId: string;
  ownerType: "company" | "agent";
  sku: string;
  sold: number;
  status: InventoryStockStatus;
}

export interface ReplenishmentReportRow {
  agent: string;
  agentId: string;
  createdAt: Date;
  id: string;
  items: number;
  number: string;
  origin: ReplenishmentOrigin;
  receivedAt?: Date;
  sentAt?: Date;
  status: ReplenishmentStatus;
  units: number;
}

export interface ReplenishmentReport {
  cancelled: number;
  pending: number;
  received: number;
  rows: ReplenishmentReportRow[];
  sent: number;
  total: number;
  unitsReceived: number;
  unitsRequested: number;
  unitsSent: number;
}

export interface PurchaseReportRow {
  createdAt: Date;
  id: string;
  items: number;
  number: string;
  receivedAt?: Date;
  status: PurchaseStatus;
  supplier: string;
  total: number;
  units: number;
}

export interface PurchaseReport {
  cancelled: number;
  draft: number;
  received: number;
  rows: PurchaseReportRow[];
  suppliers: number;
  total: number;
  unitsReceived: number;
}

export interface ReportsData {
  clients: ClientReportRow[];
  generatedAt: Date;
  inventory: InventoryReportRow[];
  payments: PaymentReportRow[];
  period: ReportPeriod;
  products: ProductReportRow[];
  purchases?: PurchaseReport;
  replenishments: ReplenishmentReport;
  role: UserRole;
  sales: SalesReport;
}
