import type { Timestamp } from "firebase/firestore";

export interface Product {
  id: string;
  sku: string;
  internalCode?: string;
  name: string;
  description?: string;
  category: string;
  salePrice: number;
  costPrice: number;
  minimumStock: number;
  active: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ProductInput {
  sku: string;
  internalCode?: string;
  name: string;
  description?: string;
  category: string;
  salePrice: number;
  costPrice: number;
  minimumStock: number;
  active: boolean;
}

export interface ProductFormValues {
  sku: string;
  internalCode: string;
  name: string;
  description: string;
  category: string;
  salePrice: string;
  costPrice: string;
  minimumStock: string;
  active: boolean;
}

export type ProductFormErrors = Partial<
  Record<Exclude<keyof ProductFormValues, "active">, string>
>;
