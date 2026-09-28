import { FirebaseError } from "firebase/app";
import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  where,
  type DocumentSnapshot,
} from "firebase/firestore";

import type { UserRole } from "@/features/auth";
import type { PaymentMethod, Sale } from "@/features/sales";
import { getFirebaseDb } from "@/lib/firebase";

import type {
  PaymentProofInput,
  PaymentProofStatus,
  PaymentProofType,
  SalePaymentProof,
} from "../types/payment-proof.types";
import { sanitizePaymentProofInput } from "../utils/payment-proof-utils";

export class PaymentProofValidationError extends Error {}
export class PaymentProofNotFoundError extends Error {}
export class PaymentProofTransitionError extends Error {}
export class PaymentProofSaleError extends Error {}

const PAYMENT_METHODS: PaymentMethod[] = ["cash", "yape", "plin", "bank_transfer", "card", "other"];
const PROOF_STATUSES: PaymentProofStatus[] = ["provided", "verified", "rejected"];
const PROOF_TYPES: PaymentProofType[] = ["operation_reference", "external_link", "manual_note"];

function parseProof(snapshot: DocumentSnapshot): SalePaymentProof {
  const data = snapshot.data();
  if (!data || typeof data.saleId !== "string" || typeof data.agentId !== "string" || typeof data.clientId !== "string" || !PROOF_STATUSES.includes(data.status) || !PROOF_TYPES.includes(data.type) || !PAYMENT_METHODS.includes(data.paymentMethod) || !Number.isInteger(data.amount) || typeof data.createdBy !== "string" || !(data.createdAt instanceof Timestamp) || !(data.updatedAt instanceof Timestamp)) throw new Error("Invalid payment proof data");
  return {
    id: snapshot.id, saleId: data.saleId, agentId: data.agentId, clientId: data.clientId,
    status: data.status, type: data.type, paymentMethod: data.paymentMethod, amount: data.amount,
    ...(typeof data.operationReference === "string" ? { operationReference: data.operationReference } : {}),
    ...(typeof data.externalUrl === "string" ? { externalUrl: data.externalUrl } : {}),
    ...(typeof data.notes === "string" ? { notes: data.notes } : {}),
    createdBy: data.createdBy, createdAt: data.createdAt, updatedAt: data.updatedAt,
    ...(typeof data.verifiedBy === "string" ? { verifiedBy: data.verifiedBy } : {}),
    ...(data.verifiedAt instanceof Timestamp ? { verifiedAt: data.verifiedAt } : {}),
    ...(typeof data.rejectedBy === "string" ? { rejectedBy: data.rejectedBy } : {}),
    ...(data.rejectedAt instanceof Timestamp ? { rejectedAt: data.rejectedAt } : {}),
    ...(typeof data.rejectionReason === "string" ? { rejectionReason: data.rejectionReason } : {}),
  };
}

function saleSnapshot(data: Record<string, unknown>, id: string): Pick<Sale, "id" | "status" | "agentId" | "clientId" | "paymentMethod" | "total"> {
  if ((data.status !== "completed" && data.status !== "cancelled") || typeof data.agentId !== "string" || typeof data.clientId !== "string" || !PAYMENT_METHODS.includes(data.paymentMethod as PaymentMethod) || !Number.isInteger(data.total)) throw new PaymentProofSaleError();
  return { id, status: data.status, agentId: data.agentId, clientId: data.clientId, paymentMethod: data.paymentMethod as PaymentMethod, total: Number(data.total) };
}

export async function getProofBySaleId(saleId: string): Promise<SalePaymentProof | null> {
  const snapshot = await getDoc(doc(getFirebaseDb(), "sale_payment_proofs", saleId));
  return snapshot.exists() ? parseProof(snapshot) : null;
}

export async function listProofs(role: UserRole, actorUid: string): Promise<SalePaymentProof[]> {
  const ref = collection(getFirebaseDb(), "sale_payment_proofs");
  const proofQuery = role === "admin" ? query(ref) : query(ref, where("agentId", "==", actorUid));
  const snapshot = await getDocs(proofQuery);
  return snapshot.docs.map(parseProof).sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
}

export async function createOrUpdateProof(saleId: string, rawInput: PaymentProofInput, actorUid: string): Promise<void> {
  let input: PaymentProofInput;
  try { input = sanitizePaymentProofInput(rawInput); } catch { throw new PaymentProofValidationError(); }
  const db = getFirebaseDb(); const proofRef = doc(db, "sale_payment_proofs", saleId); const saleRef = doc(db, "sales", saleId);
  await runTransaction(db, async (transaction) => {
    const [saleDocument, proofDocument] = await Promise.all([transaction.get(saleRef), transaction.get(proofRef)]);
    if (!saleDocument.exists()) throw new PaymentProofSaleError();
    const sale = saleSnapshot(saleDocument.data(), saleDocument.id);
    if (sale.status !== "completed" || sale.agentId !== actorUid) throw new PaymentProofSaleError();
    const editable = { type: input.type, operationReference: input.operationReference ?? deleteField(), externalUrl: input.externalUrl ?? deleteField(), notes: input.notes ?? deleteField(), updatedAt: serverTimestamp() };
    if (!proofDocument.exists()) {
      transaction.set(proofRef, { saleId, agentId: sale.agentId, clientId: sale.clientId, status: "provided", type: input.type, paymentMethod: sale.paymentMethod, amount: sale.total, ...(input.operationReference ? { operationReference: input.operationReference } : {}), ...(input.externalUrl ? { externalUrl: input.externalUrl } : {}), ...(input.notes ? { notes: input.notes } : {}), createdBy: actorUid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      return;
    }
    const proof = parseProof(proofDocument);
    if (proof.status === "verified") throw new PaymentProofTransitionError();
    transaction.update(proofRef, { ...editable, status: "provided", rejectedBy: deleteField(), rejectedAt: deleteField(), rejectionReason: deleteField() });
  });
}

export async function verifyProof(saleId: string, actorUid: string): Promise<void> {
  await reviewProof(saleId, actorUid, "verified");
}

export async function rejectProof(saleId: string, actorUid: string, reason: string): Promise<void> {
  const normalized = reason.trim();
  if (!normalized || normalized.length > 300) throw new PaymentProofValidationError();
  await reviewProof(saleId, actorUid, "rejected", normalized);
}

async function reviewProof(saleId: string, actorUid: string, status: "verified" | "rejected", reason?: string): Promise<void> {
  const db = getFirebaseDb(); const proofRef = doc(db, "sale_payment_proofs", saleId); const saleRef = doc(db, "sales", saleId);
  await runTransaction(db, async (transaction) => {
    const [proofDocument, saleDocument] = await Promise.all([transaction.get(proofRef), transaction.get(saleRef)]);
    if (!proofDocument.exists()) throw new PaymentProofNotFoundError();
    if (!saleDocument.exists() || saleSnapshot(saleDocument.data(), saleDocument.id).status !== "completed") throw new PaymentProofSaleError();
    if (parseProof(proofDocument).status !== "provided") throw new PaymentProofTransitionError();
    transaction.update(proofRef, status === "verified"
      ? { status, verifiedBy: actorUid, verifiedAt: serverTimestamp(), updatedAt: serverTimestamp() }
      : { status, rejectedBy: actorUid, rejectedAt: serverTimestamp(), rejectionReason: reason, updatedAt: serverTimestamp() });
  });
}

export function getPaymentProofErrorMessage(error: unknown): string {
  if (error instanceof PaymentProofValidationError) return "Revisa el tipo, la referencia, la URL segura y las notas del comprobante.";
  if (error instanceof PaymentProofNotFoundError) return "El comprobante ya no existe.";
  if (error instanceof PaymentProofTransitionError) return "El comprobante cambió de estado o ya no admite esta acción.";
  if (error instanceof PaymentProofSaleError) return "La venta no existe, está anulada o no te pertenece.";
  if (error instanceof FirebaseError && error.code === "permission-denied") return "No tienes permisos para realizar esta acción.";
  if (error instanceof FirebaseError && error.code === "unavailable") return "No se pudo conectar. Intenta nuevamente.";
  return "No se pudo completar la operación con el comprobante.";
}
