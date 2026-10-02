import { FirebaseError } from "firebase/app";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
  type DocumentSnapshot,
} from "firebase/firestore";

import type { UserRole } from "@/features/auth";
import type { ClientDocumentType } from "@/features/clients";
import type { InventoryRecord } from "@/features/inventory";
import { getInventoryId } from "@/features/inventory/utils/inventory-utils";
import type { Product } from "@/features/products";
import { getFirebaseDb } from "@/lib/firebase";

import type {
  CreateSaleInput,
  DiscountType,
  PaymentMethod,
  Sale,
  SaleClientSnapshot,
  SaleItem,
  SalePayment,
  SaleStatus,
  SaleUser,
} from "../types/sale.types";
import {
  calculateSale,
  formatSaleNumber,
  getSaleMovementId,
  MAX_AGENT_DISCOUNT_PERCENTAGE,
} from "../utils/sale-utils";

export class SaleValidationError extends Error {}
export class SaleStockError extends Error {}
export class SaleClientError extends Error {}
export class SaleProductError extends Error {}
export class SaleAgentError extends Error {}
export class SaleDiscountLimitError extends Error {}

const PAYMENT_METHODS: PaymentMethod[] = [
  "cash",
  "yape",
  "plin",
  "bank_transfer",
  "card",
  "bonus",
  "other",
];

function isPaymentMethod(value: unknown): value is PaymentMethod {
  return PAYMENT_METHODS.includes(value as PaymentMethod);
}

function isStatus(value: unknown): value is SaleStatus {
  return value === "completed" || value === "cancelled";
}

function isDiscountType(value: unknown): value is DiscountType {
  return value === "percentage" || value === "fixed";
}

function parseItems(value: unknown): SaleItem[] | null {
  if (!Array.isArray(value)) return null;
  const items = value.flatMap((item) => {
    if (
      typeof item !== "object" ||
      item === null ||
      !("productId" in item) ||
      !("sku" in item) ||
      !("name" in item) ||
      !("quantity" in item) ||
      !("unitPrice" in item) ||
      !("unitCost" in item) ||
      !("lineSubtotal" in item) ||
      !("discountAmount" in item) ||
      !("lineTotal" in item) ||
      typeof item.productId !== "string" ||
      typeof item.sku !== "string" ||
      typeof item.name !== "string" ||
      !Number.isInteger(item.quantity) ||
      !Number.isInteger(item.unitPrice) ||
      !Number.isInteger(item.unitCost) ||
      !Number.isInteger(item.lineSubtotal) ||
      !Number.isInteger(item.discountAmount) ||
      !Number.isInteger(item.lineTotal)
    ) {
      return [];
    }
    const discountType =
      "discountType" in item && isDiscountType(item.discountType)
        ? item.discountType
        : undefined;
    const discountValue =
      "discountValue" in item && typeof item.discountValue === "number"
        ? item.discountValue
        : undefined;
    return [{
      productId: item.productId,
      sku: item.sku,
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      unitCost: item.unitCost,
      lineSubtotal: item.lineSubtotal,
      ...(discountType ? { discountType } : {}),
      ...(discountValue !== undefined ? { discountValue } : {}),
      discountAmount: item.discountAmount,
      lineTotal: item.lineTotal,
    }];
  });
  return items.length === value.length ? items : null;
}

function parsePayments(value: unknown, total: number): SalePayment[] | null {
  if (!Array.isArray(value) || value.length < 2 || value.length > 3) return null;
  const seen = new Set<PaymentMethod>();
  const payments = value.flatMap((payment) => {
    if (
      typeof payment !== "object" ||
      payment === null ||
      !("method" in payment) ||
      !("amount" in payment) ||
      !isPaymentMethod(payment.method) ||
      seen.has(payment.method) ||
      !Number.isInteger(payment.amount) ||
      payment.amount <= 0 ||
      ("reference" in payment && (
        typeof payment.reference !== "string" ||
        !payment.reference ||
        payment.reference.length > 100
      ))
    ) return [];
    seen.add(payment.method);
    return [{
      method: payment.method,
      amount: payment.amount,
      ...("reference" in payment ? { reference: payment.reference as string } : {}),
    }];
  });
  return payments.length === value.length && payments.reduce((sum, payment) => sum + payment.amount, 0) === total
    ? payments
    : null;
}

function parseClientSnapshot(value: unknown): SaleClientSnapshot | null {
  if (
    typeof value !== "object" ||
    value === null ||
    !("name" in value) ||
    !("documentType" in value) ||
    !("documentNumber" in value) ||
    typeof value.name !== "string" ||
    typeof value.documentType !== "string" ||
    typeof value.documentNumber !== "string"
  ) return null;
  return {
    name: value.name,
    documentType: value.documentType,
    documentNumber: value.documentNumber,
  };
}

function parseSale(snapshot: DocumentSnapshot): Sale {
  const data = snapshot.data();
  const items = parseItems(data?.items);
  const clientSnapshot = parseClientSnapshot(data?.clientSnapshot);
  const payments = data?.payments === undefined ? undefined : parsePayments(data.payments, Number(data.total));
  if (
    !data ||
    typeof data.operationId !== "string" ||
    typeof data.number !== "string" ||
    !isStatus(data.status) ||
    typeof data.agentId !== "string" ||
    typeof data.clientId !== "string" ||
    !clientSnapshot ||
    !items ||
    !Number.isInteger(data.subtotal) ||
    !Number.isInteger(data.lineDiscountTotal) ||
    !Number.isInteger(data.globalDiscountAmount) ||
    !Number.isInteger(data.totalDiscount) ||
    !Number.isInteger(data.total) ||
    payments === null ||
    (payments !== undefined && (
      payments[0].method !== data.paymentMethod ||
      (payments[0].reference !== undefined
        ? data.paymentReference !== payments[0].reference
        : typeof data.paymentReference === "string")
    )) ||
    !isPaymentMethod(data.paymentMethod) ||
    typeof data.createdBy !== "string" ||
    !(data.createdAt instanceof Timestamp) ||
    !(data.updatedAt instanceof Timestamp)
  ) throw new Error("Invalid sale data");
  return {
    id: snapshot.id,
    operationId: data.operationId,
    number: data.number,
    status: data.status,
    agentId: data.agentId,
    clientId: data.clientId,
    clientSnapshot,
    items,
    subtotal: data.subtotal,
    lineDiscountTotal: data.lineDiscountTotal,
    ...(isDiscountType(data.globalDiscountType)
      ? { globalDiscountType: data.globalDiscountType }
      : {}),
    ...(typeof data.globalDiscountValue === "number"
      ? { globalDiscountValue: data.globalDiscountValue }
      : {}),
    globalDiscountAmount: data.globalDiscountAmount,
    totalDiscount: data.totalDiscount,
    total: data.total,
    paymentMethod: data.paymentMethod,
    ...(typeof data.paymentReference === "string"
      ? { paymentReference: data.paymentReference }
      : {}),
    ...(payments ? { payments } : {}),
    ...(typeof data.notes === "string" ? { notes: data.notes } : {}),
    createdBy: data.createdBy,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    ...(typeof data.cancelledBy === "string"
      ? { cancelledBy: data.cancelledBy }
      : {}),
    ...(data.cancelledAt instanceof Timestamp
      ? { cancelledAt: data.cancelledAt }
      : {}),
    ...(typeof data.cancellationReason === "string"
      ? { cancellationReason: data.cancellationReason }
      : {}),
  };
}

function parseInventory(snapshot: DocumentSnapshot): InventoryRecord {
  const data = snapshot.data();
  if (
    !data ||
    typeof data.productId !== "string" ||
    data.ownerType !== "agent" ||
    typeof data.ownerId !== "string" ||
    !Number.isInteger(data.quantity) ||
    typeof data.lastMovementId !== "string" ||
    !(data.createdAt instanceof Timestamp) ||
    !(data.updatedAt instanceof Timestamp)
  ) throw new SaleStockError();
  return {
    id: snapshot.id,
    productId: data.productId,
    ownerType: "agent",
    ownerId: data.ownerId,
    quantity: data.quantity,
    lastMovementId: data.lastMovementId,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

function sanitizeInput(input: CreateSaleInput): CreateSaleInput {
  const payments = input.payments?.map((payment) => {
    if (!isPaymentMethod(payment.method) || !Number.isInteger(payment.amount) || payment.amount <= 0) {
      throw new SaleValidationError();
    }
    const reference = payment.reference?.trim();
    if (reference && reference.length > 100) throw new SaleValidationError();
    return {
      method: payment.method,
      amount: payment.amount,
      ...(reference ? { reference } : {}),
    };
  });
  if (payments) {
    if (payments.length < 2 || payments.length > 3 || new Set(payments.map((payment) => payment.method)).size !== payments.length) {
      throw new SaleValidationError();
    }
  }
  const canonicalPaymentMethod = payments?.[0].method ?? input.paymentMethod;
  const canonicalPaymentReference = payments ? payments[0].reference : input.paymentReference?.trim();
  if (
    !/^[A-Za-z0-9_-]{8,100}$/.test(input.operationId) ||
    !input.clientId.trim() ||
    !isPaymentMethod(canonicalPaymentMethod)
  ) throw new SaleValidationError();
  const notes = input.notes?.trim();
  if ((canonicalPaymentReference && canonicalPaymentReference.length > 100) || (notes && notes.length > 300)) {
    throw new SaleValidationError();
  }
  return {
    operationId: input.operationId,
    clientId: input.clientId.trim(),
    items: input.items.map((item) => ({
      productId: item.productId.trim(),
      quantity: item.quantity,
      ...(item.discountType ? { discountType: item.discountType } : {}),
      ...(item.discountValue !== undefined
        ? { discountValue: item.discountValue }
        : {}),
    })),
    ...(input.globalDiscountType
      ? { globalDiscountType: input.globalDiscountType }
      : {}),
    ...(input.globalDiscountValue !== undefined
      ? { globalDiscountValue: input.globalDiscountValue }
      : {}),
    paymentMethod: canonicalPaymentMethod,
    ...(canonicalPaymentReference ? { paymentReference: canonicalPaymentReference } : {}),
    ...(payments ? { payments } : {}),
    ...(notes ? { notes } : {}),
  };
}

export async function createSale(
  rawInput: CreateSaleInput,
  actorUid: string,
): Promise<string> {
  const input = sanitizeInput(rawInput);
  const db = getFirebaseDb();
  const saleRef = doc(db, "sales", input.operationId);
  const intentRef = doc(db, "sale_intents", input.operationId);
  const counterRef = doc(db, "system_counters", "sales");

  const existingBefore = await getDoc(saleRef);
  if (existingBefore.exists()) {
    if (existingBefore.data().createdBy !== actorUid) {
      throw new SaleValidationError();
    }
    return saleRef.id;
  }

  const [userSnapshot, clientSnapshot, productSnapshots] = await Promise.all([
    getDoc(doc(db, "users", actorUid)),
    getDoc(doc(db, "clients", input.clientId)),
    Promise.all(
      input.items.map((item) => getDoc(doc(db, "products", item.productId))),
    ),
  ]);
  if (
    !userSnapshot.exists() ||
    userSnapshot.data().role !== "agent" ||
    userSnapshot.data().active !== true
  ) throw new SaleAgentError();
  if (!clientSnapshot.exists() || clientSnapshot.data().active !== true) {
    throw new SaleClientError();
  }

  const products = new Map<string, Product>();
  productSnapshots.forEach((snapshot) => {
    const data = snapshot.data();
    if (
      !snapshot.exists() ||
      !data ||
      data.active !== true ||
      typeof data.sku !== "string" ||
      typeof data.name !== "string" ||
      typeof data.category !== "string" ||
      typeof data.salePrice !== "number" ||
      typeof data.costPrice !== "number" ||
      typeof data.minimumStock !== "number" ||
      !(data.createdAt instanceof Timestamp) ||
      !(data.updatedAt instanceof Timestamp)
    ) throw new SaleProductError();
    products.set(snapshot.id, {
      id: snapshot.id,
      sku: data.sku,
      name: data.name,
      category: data.category,
      salePrice: data.salePrice,
      costPrice: data.costPrice,
      minimumStock: data.minimumStock,
      active: true,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    });
  });

  let calculated;
  try {
    calculated = calculateSale(input, products, true);
  } catch (error) {
    if (error instanceof Error && error.message === "Agent discount limit") {
      throw new SaleDiscountLimitError();
    }
    throw new SaleValidationError();
  }
  const clientData = clientSnapshot.data();
  const clientDocumentType = String(clientData.documentType) as ClientDocumentType;

  const number = await runTransaction(db, async (transaction) => {
    const counterSnapshot = await transaction.get(counterRef);
    const count = counterSnapshot.exists()
      ? Number(counterSnapshot.data().count)
      : 0;
    if (!Number.isInteger(count) || count < 0) throw new SaleValidationError();
    transaction.set(counterRef, { count: count + 1 });
    return formatSaleNumber(count + 1);
  });

  const saleCandidate = {
    operationId: input.operationId,
    number,
    status: "completed",
    agentId: actorUid,
    clientId: input.clientId,
    clientSnapshot: {
      name: String(clientData.name),
      documentType: clientDocumentType,
      documentNumber: String(clientData.documentNumber),
    },
    items: calculated.items,
    subtotal: calculated.subtotal,
    lineDiscountTotal: calculated.lineDiscountTotal,
    ...(input.globalDiscountType
      ? { globalDiscountType: input.globalDiscountType }
      : {}),
    ...(input.globalDiscountType
      ? { globalDiscountValue: Number(input.globalDiscountValue) }
      : {}),
    globalDiscountAmount: calculated.globalDiscountAmount,
    totalDiscount: calculated.totalDiscount,
    total: calculated.total,
    paymentMethod: input.paymentMethod,
    ...(input.paymentReference
      ? { paymentReference: input.paymentReference }
      : {}),
    ...(input.payments ? { payments: input.payments } : {}),
    ...(input.notes ? { notes: input.notes } : {}),
    createdBy: actorUid,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };

  let intentSnapshot = await getDoc(intentRef);
  if (!intentSnapshot.exists()) {
    try {
      await setDoc(intentRef, {
        status: "prepared",
        agentId: actorUid,
        sale: saleCandidate,
      });
    } catch (error) {
      if (!(error instanceof FirebaseError && error.code === "permission-denied")) {
        throw error;
      }
    }
    intentSnapshot = await getDoc(intentRef);
  }
  const intentData = intentSnapshot.data();
  if (
    !intentSnapshot.exists() ||
    !intentData ||
    intentData.status !== "prepared" ||
    intentData.agentId !== actorUid ||
    typeof intentData.sale !== "object" ||
    intentData.sale === null
  ) throw new SaleValidationError();
  const persistedSale = intentData.sale as Record<string, unknown>;

  try {
    await runTransaction(db, async (transaction) => {
      const currentIntent = await transaction.get(intentRef);
      if (!currentIntent.exists() || currentIntent.data().status !== "prepared") {
        throw new SaleValidationError();
      }
      const inventorySnapshots: DocumentSnapshot[] = [];
      for (const item of calculated.items) {
        inventorySnapshots.push(
          await transaction.get(
            doc(db, "inventory", getInventoryId("agent", actorUid, item.productId)),
          ),
        );
      }
      const inventories = inventorySnapshots.map((snapshot, index) => {
        if (!snapshot.exists()) throw new SaleStockError();
        const inventory = parseInventory(snapshot);
        if (
          inventory.ownerId !== actorUid ||
          inventory.productId !== calculated.items[index].productId ||
          inventory.quantity < calculated.items[index].quantity
        ) throw new SaleStockError();
        return inventory;
      });

      transaction.set(saleRef, persistedSale);
      transaction.update(intentRef, { status: "consumed" });
      calculated.items.forEach((item, index) => {
        const inventory = inventories[index];
        const movementId = getSaleMovementId(saleRef.id, item.productId);
        const quantityAfter = inventory.quantity - item.quantity;
        transaction.update(doc(db, "inventory", inventory.id), {
          quantity: quantityAfter,
          lastMovementId: movementId,
          updatedAt: serverTimestamp(),
        });
        transaction.set(doc(db, "inventory_movements", movementId), {
          inventoryId: inventory.id,
          productId: item.productId,
          ownerType: "agent",
          ownerId: actorUid,
          type: "sale",
          quantity: item.quantity,
          quantityBefore: inventory.quantity,
          quantityAfter,
          reason: `Venta ${number}`,
          referenceType: "sale",
          referenceId: saleRef.id,
          createdBy: actorUid,
          createdAt: serverTimestamp(),
        });
      });
    });
    return saleRef.id;
  } catch (error) {
    if (error instanceof FirebaseError && error.code === "permission-denied") {
      const existing = await getDoc(saleRef);
      if (existing.exists() && existing.data().createdBy === actorUid) {
        return saleRef.id;
      }
    }
    throw error;
  }
}

export async function listSales(
  role: UserRole,
  actorUid: string,
  agentId?: string,
): Promise<Sale[]> {
  const ref = collection(getFirebaseDb(), "sales");
  const scopedAgentId = role === "admin" ? agentId : actorUid;
  const salesQuery = scopedAgentId
    ? query(ref, where("agentId", "==", scopedAgentId))
    : query(ref);
  const snapshot = await getDocs(salesQuery);
  return snapshot.docs
    .map(parseSale)
    .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
}

export async function getSaleById(saleId: string): Promise<Sale | null> {
  const snapshot = await getDoc(doc(getFirebaseDb(), "sales", saleId));
  return snapshot.exists() ? parseSale(snapshot) : null;
}

export async function listSalesByClient(
  clientId: string,
  role: UserRole,
  actorUid: string,
): Promise<Sale[]> {
  return (await listSales(role, actorUid)).filter(
    (sale) => sale.clientId === clientId,
  );
}

export async function listSaleUsers(): Promise<SaleUser[]> {
  const snapshot = await getDocs(collection(getFirebaseDb(), "users"));
  return snapshot.docs.flatMap((item) => {
    const data = item.data();
    if (
      typeof data.uid !== "string" ||
      typeof data.displayName !== "string" ||
      typeof data.email !== "string" ||
      (data.role !== "admin" && data.role !== "agent") ||
      typeof data.active !== "boolean"
    ) return [];
    return [{
      uid: data.uid,
      displayName: data.displayName,
      email: data.email,
      role: data.role,
      active: data.active,
    }];
  });
}

export function getSaleErrorMessage(error: unknown): string {
  if (error instanceof SaleStockError) {
    return "Uno o más productos no tienen stock suficiente en tu inventario.";
  }
  if (error instanceof SaleClientError) return "Selecciona un cliente activo.";
  if (error instanceof SaleProductError) {
    return "Uno o más productos no existen o están inactivos.";
  }
  if (error instanceof SaleAgentError) {
    return "Tu usuario no es un agente activo autorizado para vender.";
  }
  if (error instanceof SaleDiscountLimitError) {
    return `El descuento total del agente no puede superar el ${MAX_AGENT_DISCOUNT_PERCENTAGE}% del subtotal.`;
  }
  if (error instanceof SaleValidationError) {
    return "Revisa cantidades, productos, descuentos y datos de pago.";
  }
  if (error instanceof FirebaseError) {
    if (error.code === "permission-denied") {
      return "No tienes permisos para realizar esta operación.";
    }
    if (error.code === "unavailable") {
      return "No se pudo conectar. Revisa tu conexión e intenta nuevamente.";
    }
  }
  return "No se pudo completar la venta. Intenta nuevamente.";
}
