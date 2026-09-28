import type { UserRole } from "@/features/auth";

export type DashboardPeriodKey =
  | "today"
  | "last7"
  | "last30"
  | "thisMonth"
  | "previousMonth";

export interface DashboardPeriod {
  key: DashboardPeriodKey;
  label: string;
  start: Date;
  end: Date;
}

export interface SalesTrendPoint {
  date: string;
  label: string;
  total: number;
}

export interface TopProductMetric {
  productId: string;
  sku: string;
  name: string;
  units: number;
  amount: number;
}

export interface TopClientMetric {
  clientId: string;
  name: string;
  salesCount: number;
  total: number;
}

export interface SalesMetrics {
  salesCount: number;
  subtotal: number;
  totalDiscount: number;
  totalSold: number;
  averageTicket: number;
  cancelledCount: number;
  trend: SalesTrendPoint[];
  topProducts: TopProductMetric[];
  topClients: TopClientMetric[];
}

export interface PurchaseMetrics {
  receivedCount: number;
  totalPurchased: number;
  unitsReceived: number;
  oldDraftCount: number;
}

export interface InventoryAlertItem {
  inventoryId: string;
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  minimumStock: number;
  ownerLabel: string;
}

export interface InventoryMetrics {
  companyUnits: number;
  agentUnits: number;
  ownUnits: number;
  lowStockCount: number;
  outOfStockCount: number;
  lowStockItems: InventoryAlertItem[];
  outOfStockItems: InventoryAlertItem[];
}

export interface ReplenishmentMetrics {
  pendingCount: number;
  inTransitCount: number;
  receivedInPeriodCount: number;
}

export interface PaymentProofMetrics {
  providedCount: number;
  rejectedCount: number;
  verifiedInPeriodCount: number;
}

export interface ClientMetrics {
  activeCount: number;
  createdInPeriodCount: number;
}

export interface DashboardMetrics {
  sales: SalesMetrics;
  purchases: PurchaseMetrics;
  inventory: InventoryMetrics;
  replenishments: ReplenishmentMetrics;
  paymentProofs: PaymentProofMetrics;
  clients: ClientMetrics;
}

export type RecentActivityType =
  | "sale"
  | "purchase"
  | "replenishment_sent"
  | "replenishment_received"
  | "proof_provided"
  | "proof_verified"
  | "proof_rejected";

export interface RecentActivityItem {
  id: string;
  type: RecentActivityType;
  title: string;
  description: string;
  occurredAt: Date;
  amount?: number;
}

export type DashboardAlertSeverity = "critical" | "warning" | "info";

export interface DashboardAlert {
  id: string;
  severity: DashboardAlertSeverity;
  title: string;
  description: string;
  count: number;
}

export interface DashboardData {
  role: UserRole;
  period: DashboardPeriod;
  metrics: DashboardMetrics;
  activity: RecentActivityItem[];
  alerts: DashboardAlert[];
  generatedAt: Date;
}

export interface DashboardRequest {
  role: UserRole;
  actorUid: string;
  periodKey: DashboardPeriodKey;
  now?: Date;
}
