import type { Timestamp } from "firebase/firestore";

export type PurchaseStatus = "draft" | "received" | "cancelled";

export interface PurchaseItem {
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  unitCost: number;
  lineTotal: number;
}

export interface PurchaseSupplierSnapshot { name: string; taxId?: string; }

export interface Purchase {
  id: string;
  number: string;
  status: PurchaseStatus;
  supplierId: string;
  supplierSnapshot: PurchaseSupplierSnapshot;
  supplierDocumentType?: string;
  supplierDocumentNumber?: string;
  supplierDocumentDate?: string;
  items: PurchaseItem[];
  subtotal: number;
  total: number;
  notes?: string;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  receivedBy?: string;
  receivedAt?: Timestamp;
  cancelledBy?: string;
  cancelledAt?: Timestamp;
}

export interface PurchaseDraftItem { productId: string; quantity: number; unitCost: number; }
export interface PurchaseInput {
  supplierId: string;
  supplierDocumentType?: string;
  supplierDocumentNumber?: string;
  supplierDocumentDate?: string;
  items: PurchaseDraftItem[];
  notes?: string;
}
export interface PurchaseFilters { search: string; status: "all" | PurchaseStatus; supplierId: string; dateFrom: string; dateTo: string; }
