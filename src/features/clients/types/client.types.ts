import type { Timestamp } from "firebase/firestore";

export type ClientDocumentType = "DNI" | "RUC" | "CE" | "OTHER";

export interface Client {
  id: string;
  documentType: ClientDocumentType;
  documentNumber: string;
  normalizedDocumentNumber: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  active: boolean;
  createdBy: string;
  updatedBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ClientInput {
  documentType: ClientDocumentType;
  documentNumber: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  active: boolean;
}

export interface ClientFormValues {
  documentType: ClientDocumentType;
  documentNumber: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  active: boolean;
}

export type ClientFormErrors = Partial<
  Record<Exclude<keyof ClientFormValues, "active">, string>
>;
