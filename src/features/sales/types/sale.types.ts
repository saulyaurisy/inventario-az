import type { Timestamp } from "firebase/firestore";

export type SaleStatus = "completed" | "cancelled";
export type PaymentMethod =
  | "cash"
  | "yape"
  | "plin"
  | "bank_transfer"
  | "card"
  | "other";
export type DiscountType = "percentage" | "fixed";

export interface SaleClientSnapshot {
  name: string;
  documentType: string;
  documentNumber: string;
}

export interface SaleItem {
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  lineSubtotal: number;
  discountType?: DiscountType;
  discountValue?: number;
  discountAmount: number;
  lineTotal: number;
}

export interface Sale {
  id: string;
  operationId: string;
  number: string;
  status: SaleStatus;
  agentId: string;
  clientId: string;
  clientSnapshot: SaleClientSnapshot;
  items: SaleItem[];
  subtotal: number;
  lineDiscountTotal: number;
  globalDiscountType?: DiscountType;
  globalDiscountValue?: number;
  globalDiscountAmount: number;
  totalDiscount: number;
  total: number;
  paymentMethod: PaymentMethod;
  paymentReference?: string;
  notes?: string;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  cancelledBy?: string;
  cancelledAt?: Timestamp;
  cancellationReason?: string;
}

export interface SaleDraftItem {
  productId: string;
  quantity: number;
  discountType?: DiscountType;
  discountValue?: number;
}

export interface CreateSaleInput {
  operationId: string;
  clientId: string;
  items: SaleDraftItem[];
  globalDiscountType?: DiscountType;
  globalDiscountValue?: number;
  paymentMethod: PaymentMethod;
  paymentReference?: string;
  notes?: string;
}

export interface SaleFilters {
  search: string;
  agentId: string;
  status: "all" | SaleStatus;
  paymentMethod: "all" | PaymentMethod;
  dateFrom: string;
  dateTo: string;
}

export interface SaleUser {
  uid: string;
  displayName: string;
  email: string;
  role: "admin" | "agent";
  active: boolean;
}
