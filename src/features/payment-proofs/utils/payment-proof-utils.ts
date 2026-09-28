import type {
  PaymentProofInput,
  PaymentProofStatus,
  PaymentProofType,
} from "../types/payment-proof.types";

export const PAYMENT_PROOF_STATUS_LABELS: Record<PaymentProofStatus, string> = {
  provided: "Registrado",
  verified: "Verificado",
  rejected: "Rechazado",
};

export const PAYMENT_PROOF_TYPE_LABELS: Record<PaymentProofType, string> = {
  operation_reference: "Referencia de operación",
  external_link: "Enlace externo",
  manual_note: "Nota manual",
};

export function normalizeOperationReference(value?: string): string | undefined {
  const normalized = value?.trim().replace(/\s+/g, " ");
  return normalized || undefined;
}

export function isSafeExternalUrl(value?: string): boolean {
  if (!value) return true;
  if (value.length > 500) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname) && url.username === "" && url.password === "";
  } catch {
    return false;
  }
}

export function sanitizePaymentProofInput(input: PaymentProofInput): PaymentProofInput {
  const operationReference = normalizeOperationReference(input.operationReference);
  const externalUrl = input.externalUrl?.trim() || undefined;
  const notes = input.notes?.trim() || undefined;
  if (!(["operation_reference", "external_link", "manual_note"] as string[]).includes(input.type)) throw new Error("Invalid proof type");
  if (operationReference && operationReference.length > 100) throw new Error("Invalid operation reference");
  if (!isSafeExternalUrl(externalUrl)) throw new Error("Invalid external URL");
  if (notes && notes.length > 500) throw new Error("Invalid notes");
  if (input.type === "operation_reference" && !operationReference) throw new Error("Operation reference required");
  if (input.type === "external_link" && !externalUrl) throw new Error("External URL required");
  if (input.type === "manual_note" && !notes) throw new Error("Notes required");
  return {
    type: input.type,
    ...(operationReference ? { operationReference } : {}),
    ...(externalUrl ? { externalUrl } : {}),
    ...(notes ? { notes } : {}),
  };
}
