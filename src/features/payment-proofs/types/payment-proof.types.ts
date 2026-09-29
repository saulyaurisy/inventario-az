import type { Timestamp } from "firebase/firestore";

import type { PaymentMethod } from "@/features/sales";

export type PaymentProofStatus = "provided" | "verified" | "rejected";
export type PaymentProofType =
  | "operation_reference"
  | "external_link"
  | "manual_note";
export type EditablePaymentProofType = Exclude<PaymentProofType, "external_link">;

export interface PaymentProofAttachment {
  provider: "google_drive";
  fileId: string;
  fileName: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  size: number;
  uploadedAt: Timestamp;
  uploadedBy: string;
}

export interface SalePaymentProof {
  id: string;
  saleId: string;
  agentId: string;
  clientId: string;
  status: PaymentProofStatus;
  type: PaymentProofType;
  paymentMethod: PaymentMethod;
  amount: number;
  operationReference?: string;
  externalUrl?: string;
  notes?: string;
  attachment?: PaymentProofAttachment;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  verifiedBy?: string;
  verifiedAt?: Timestamp;
  rejectedBy?: string;
  rejectedAt?: Timestamp;
  rejectionReason?: string;
}

export interface PaymentProofInput {
  type: EditablePaymentProofType;
  operationReference?: string;
  notes?: string;
}

export interface PaymentProofFilters {
  search: string;
  status: "all" | PaymentProofStatus;
  agentId: string;
  paymentMethod: "all" | PaymentMethod;
  dateFrom: string;
  dateTo: string;
}
