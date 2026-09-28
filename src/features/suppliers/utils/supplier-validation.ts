import type { SupplierInput } from "../types/supplier.types";

export function normalizeSupplierTaxId(value: string): string {
  return value.trim().replace(/\s+/g, "").toUpperCase();
}

export function sanitizeSupplierInput(input: SupplierInput): SupplierInput {
  const name = input.name.trim();
  if (!name || name.length > 160) throw new Error("Invalid supplier input");
  const taxId = input.taxId ? normalizeSupplierTaxId(input.taxId) : undefined;
  const email = input.email?.trim().toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Invalid supplier email");
  }
  if (taxId && taxId.length > 40) throw new Error("Invalid supplier tax id");
  const optional = (value?: string) => value?.trim() || undefined;
  return {
    name,
    ...(taxId ? { taxId } : {}),
    ...(optional(input.contactName) ? { contactName: optional(input.contactName) } : {}),
    ...(optional(input.phone) ? { phone: optional(input.phone) } : {}),
    ...(email ? { email } : {}),
    ...(optional(input.address) ? { address: optional(input.address) } : {}),
    ...(optional(input.notes) ? { notes: optional(input.notes) } : {}),
  };
}
