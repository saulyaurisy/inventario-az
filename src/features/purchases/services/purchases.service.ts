import { FirebaseError } from "firebase/app";
import { collection, deleteField, doc, getDoc, getDocs, query, runTransaction, serverTimestamp, Timestamp, type DocumentSnapshot, type Transaction } from "firebase/firestore";

import type { InventoryRecord } from "@/features/inventory";
import { getInventoryId } from "@/features/inventory/utils/inventory-utils";
import type { Product } from "@/features/products";
import { getFirebaseDb } from "@/lib/firebase";

import type { Purchase, PurchaseInput, PurchaseItem, PurchaseStatus, PurchaseSupplierSnapshot } from "../types/purchase.types";
import { calculatePurchase, formatPurchaseNumber, getPurchaseMovementId, MAX_RECEIVABLE_PURCHASE_ITEMS } from "../utils/purchase-utils";

export class PurchaseValidationError extends Error {}
export class PurchaseNotFoundError extends Error {}
export class PurchaseTransitionError extends Error {}
export class PurchaseSupplierError extends Error {}
export class PurchaseProductError extends Error {}
export class PurchaseReceptionLimitError extends Error {}

function isStatus(value: unknown): value is PurchaseStatus { return value === "draft" || value === "received" || value === "cancelled"; }
function parseItems(value: unknown): PurchaseItem[] | null {
  if (!Array.isArray(value)) return null;
  const items = value.flatMap((item) => typeof item === "object" && item !== null && "productId" in item && "sku" in item && "name" in item && "quantity" in item && "unitCost" in item && "lineTotal" in item && typeof item.productId === "string" && typeof item.sku === "string" && typeof item.name === "string" && Number.isInteger(item.quantity) && Number.isInteger(item.unitCost) && Number.isInteger(item.lineTotal) ? [{ productId: item.productId, sku: item.sku, name: item.name, quantity: Number(item.quantity), unitCost: Number(item.unitCost), lineTotal: Number(item.lineTotal) }] : []);
  return items.length === value.length ? items : null;
}
function parseSupplierSnapshot(value: unknown): PurchaseSupplierSnapshot | null {
  if (typeof value !== "object" || value === null || !("name" in value) || typeof value.name !== "string") return null;
  return { name: value.name, ...("taxId" in value && typeof value.taxId === "string" ? { taxId: value.taxId } : {}) };
}
function parsePurchase(snapshot: DocumentSnapshot): Purchase {
  const data = snapshot.data(); const items = parseItems(data?.items); const supplierSnapshot = parseSupplierSnapshot(data?.supplierSnapshot);
  if (!data || typeof data.number !== "string" || !isStatus(data.status) || typeof data.supplierId !== "string" || !supplierSnapshot || !items || !Number.isInteger(data.subtotal) || !Number.isInteger(data.total) || typeof data.createdBy !== "string" || !(data.createdAt instanceof Timestamp) || !(data.updatedAt instanceof Timestamp)) throw new Error("Invalid purchase data");
  return { id: snapshot.id, number: data.number, status: data.status, supplierId: data.supplierId, supplierSnapshot,
    ...(typeof data.supplierDocumentType === "string" ? { supplierDocumentType: data.supplierDocumentType } : {}), ...(typeof data.supplierDocumentNumber === "string" ? { supplierDocumentNumber: data.supplierDocumentNumber } : {}), ...(typeof data.supplierDocumentDate === "string" ? { supplierDocumentDate: data.supplierDocumentDate } : {}), items, subtotal: data.subtotal, total: data.total, ...(typeof data.notes === "string" ? { notes: data.notes } : {}), createdBy: data.createdBy, createdAt: data.createdAt, updatedAt: data.updatedAt, ...(typeof data.receivedBy === "string" ? { receivedBy: data.receivedBy } : {}), ...(data.receivedAt instanceof Timestamp ? { receivedAt: data.receivedAt } : {}), ...(typeof data.cancelledBy === "string" ? { cancelledBy: data.cancelledBy } : {}), ...(data.cancelledAt instanceof Timestamp ? { cancelledAt: data.cancelledAt } : {}) };
}
function parseInventory(snapshot: DocumentSnapshot): InventoryRecord {
  const data = snapshot.data(); if (!data || typeof data.productId !== "string" || data.ownerType !== "company" || data.ownerId !== "company" || !Number.isInteger(data.quantity) || typeof data.lastMovementId !== "string" || !(data.createdAt instanceof Timestamp) || !(data.updatedAt instanceof Timestamp)) throw new PurchaseValidationError();
  return { id: snapshot.id, productId: data.productId, ownerType: "company", ownerId: "company", quantity: data.quantity, lastMovementId: data.lastMovementId, createdAt: data.createdAt, updatedAt: data.updatedAt };
}
function sanitize(input: PurchaseInput): PurchaseInput {
  const optional = (value?: string) => value?.trim() || undefined;
  const items = input.items.map((item) => ({ productId: item.productId.trim(), quantity: item.quantity, unitCost: item.unitCost }));
  if (!input.supplierId.trim()) throw new PurchaseValidationError();
  return { supplierId: input.supplierId.trim(), ...(optional(input.supplierDocumentType) ? { supplierDocumentType: optional(input.supplierDocumentType) } : {}), ...(optional(input.supplierDocumentNumber) ? { supplierDocumentNumber: optional(input.supplierDocumentNumber) } : {}), ...(optional(input.supplierDocumentDate) ? { supplierDocumentDate: optional(input.supplierDocumentDate) } : {}), items, ...(optional(input.notes) ? { notes: optional(input.notes) } : {}) };
}
async function resolvePurchase(transaction: Transaction, input: PurchaseInput) {
  const db = getFirebaseDb();
  const supplier = await transaction.get(doc(db, "suppliers", input.supplierId));
  if (!supplier.exists() || supplier.data().active !== true || typeof supplier.data().name !== "string") throw new PurchaseSupplierError();
  const products = new Map<string, Product>();
  for (const item of input.items) {
    const snapshot = await transaction.get(doc(db, "products", item.productId)); const data = snapshot.data();
    if (!snapshot.exists() || !data || data.active !== true || typeof data.sku !== "string" || typeof data.name !== "string" || typeof data.category !== "string" || typeof data.salePrice !== "number" || typeof data.costPrice !== "number" || typeof data.minimumStock !== "number" || !(data.createdAt instanceof Timestamp) || !(data.updatedAt instanceof Timestamp)) throw new PurchaseProductError();
    products.set(snapshot.id, { id: snapshot.id, sku: data.sku, name: data.name, category: data.category, salePrice: data.salePrice, costPrice: data.costPrice, minimumStock: data.minimumStock, active: true, createdAt: data.createdAt, updatedAt: data.updatedAt });
  }
  let calculated; try { calculated = calculatePurchase(input.items, products); } catch { throw new PurchaseValidationError(); }
  return { calculated, supplierSnapshot: { name: String(supplier.data().name), ...(typeof supplier.data().taxId === "string" ? { taxId: supplier.data().taxId } : {}) } };
}
function draftData(input: PurchaseInput, supplierSnapshot: PurchaseSupplierSnapshot, calculated: ReturnType<typeof calculatePurchase>) { return { supplierId: input.supplierId, supplierSnapshot, ...(input.supplierDocumentType ? { supplierDocumentType: input.supplierDocumentType } : {}), ...(input.supplierDocumentNumber ? { supplierDocumentNumber: input.supplierDocumentNumber } : {}), ...(input.supplierDocumentDate ? { supplierDocumentDate: input.supplierDocumentDate } : {}), items: calculated.items, subtotal: calculated.subtotal, total: calculated.total, notes: input.notes ?? "" }; }

export async function createPurchase(raw: PurchaseInput, actorUid: string): Promise<string> {
  const input = sanitize(raw); const db = getFirebaseDb(); const ref = doc(collection(db, "purchases")); const counter = doc(db, "system_counters", "purchases");
  const number = await runTransaction(db, async (transaction) => { const counterSnapshot = await transaction.get(counter); const count = counterSnapshot.exists() ? Number(counterSnapshot.data().count) : 0; if (!Number.isInteger(count) || count < 0) throw new PurchaseValidationError(); transaction.set(counter, { count: count + 1 }); return formatPurchaseNumber(count + 1); });
  await runTransaction(db, async (transaction) => { const { calculated, supplierSnapshot } = await resolvePurchase(transaction, input); transaction.set(ref, { number, status: "draft", ...draftData(input, supplierSnapshot, calculated), createdBy: actorUid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }); });
  return ref.id;
}
export async function updateDraftPurchase(id: string, raw: PurchaseInput): Promise<void> {
  const input = sanitize(raw); const db = getFirebaseDb(); const ref = doc(db, "purchases", id);
  await runTransaction(db, async (transaction) => { const snapshot = await transaction.get(ref); if (!snapshot.exists()) throw new PurchaseNotFoundError(); if (parsePurchase(snapshot).status !== "draft") throw new PurchaseTransitionError(); const { calculated, supplierSnapshot } = await resolvePurchase(transaction, input); transaction.update(ref, { ...draftData(input, supplierSnapshot, calculated), supplierDocumentType: input.supplierDocumentType ?? deleteField(), supplierDocumentNumber: input.supplierDocumentNumber ?? deleteField(), supplierDocumentDate: input.supplierDocumentDate ?? deleteField(), updatedAt: serverTimestamp() }); });
}
export async function listPurchases(): Promise<Purchase[]> { const snapshot = await getDocs(query(collection(getFirebaseDb(), "purchases"))); return snapshot.docs.map(parsePurchase).sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis()); }
export async function getPurchaseById(id: string): Promise<Purchase | null> { const snapshot = await getDoc(doc(getFirebaseDb(), "purchases", id)); return snapshot.exists() ? parsePurchase(snapshot) : null; }
export async function cancelPurchase(id: string, actorUid: string): Promise<void> { const db = getFirebaseDb(); const ref = doc(db, "purchases", id); await runTransaction(db, async (transaction) => { const snapshot = await transaction.get(ref); if (!snapshot.exists()) throw new PurchaseNotFoundError(); if (parsePurchase(snapshot).status !== "draft") throw new PurchaseTransitionError(); transaction.update(ref, { status: "cancelled", cancelledBy: actorUid, cancelledAt: serverTimestamp(), updatedAt: serverTimestamp() }); }); }
export async function receivePurchase(id: string, actorUid: string): Promise<void> {
  const db = getFirebaseDb(); const ref = doc(db, "purchases", id);
  try { const candidate = await getPurchaseById(id); if (!candidate) throw new PurchaseNotFoundError(); if (candidate.status !== "draft") throw new PurchaseTransitionError(); if (candidate.items.length > MAX_RECEIVABLE_PURCHASE_ITEMS) throw new PurchaseReceptionLimitError(); const [supplier, ...products] = await Promise.all([getDoc(doc(db, "suppliers", candidate.supplierId)), ...candidate.items.map((item) => getDoc(doc(db, "products", item.productId)))]); if (!supplier.exists() || supplier.data().active !== true) throw new PurchaseSupplierError(); candidate.items.forEach((item, index) => { const product = products[index]; if (!product.exists() || product.data().active !== true || product.data().sku !== item.sku || product.data().name !== item.name) throw new PurchaseProductError(); });
    await runTransaction(db, async (transaction) => { const snapshot = await transaction.get(ref); if (!snapshot.exists()) throw new PurchaseNotFoundError(); const purchase = parsePurchase(snapshot); if (purchase.status !== "draft") throw new PurchaseTransitionError();
      const inventorySnapshots: DocumentSnapshot[] = [];
      for (const item of purchase.items) inventorySnapshots.push(await transaction.get(doc(db, "inventory", getInventoryId("company", "company", item.productId))));
      purchase.items.forEach((item, index) => { const inventorySnapshot = inventorySnapshots[index]; const inventoryId = getInventoryId("company", "company", item.productId); const movementId = getPurchaseMovementId(id, item.productId); const before = inventorySnapshot.exists() ? parseInventory(inventorySnapshot).quantity : 0; const inventoryData = { productId: item.productId, ownerType: "company", ownerId: "company", quantity: before + item.quantity, lastMovementId: movementId, updatedAt: serverTimestamp() }; if (inventorySnapshot.exists()) transaction.update(doc(db, "inventory", inventoryId), inventoryData); else transaction.set(doc(db, "inventory", inventoryId), { ...inventoryData, createdAt: serverTimestamp() }); transaction.set(doc(db, "inventory_movements", movementId), { inventoryId, productId: item.productId, ownerType: "company", ownerId: "company", type: "purchase_in", quantity: item.quantity, quantityBefore: before, quantityAfter: before + item.quantity, reason: `Compra ${purchase.number} recibida`, referenceType: "purchase", referenceId: id, createdBy: actorUid, createdAt: serverTimestamp() }); }); transaction.update(ref, { status: "received", receivedBy: actorUid, receivedAt: serverTimestamp(), updatedAt: serverTimestamp() }); }); }
  catch (error) { if (error instanceof FirebaseError && error.code === "permission-denied") { const latest = await getPurchaseById(id); if (latest && latest.status !== "draft") throw new PurchaseTransitionError(); } throw error; }
}
export function getPurchaseErrorMessage(error: unknown): string { if (error instanceof PurchaseNotFoundError) return "La compra ya no existe."; if (error instanceof PurchaseTransitionError) return "La operación ya se realizó o la compra cambió de estado."; if (error instanceof PurchaseSupplierError) return "El proveedor no existe o está inactivo."; if (error instanceof PurchaseProductError) return "Uno o más productos no existen, están inactivos o cambiaron."; if (error instanceof PurchaseReceptionLimitError) return "La recepción segura está disponible únicamente para compras de 1 producto. Edita el borrador antes de recibirlo."; if (error instanceof PurchaseValidationError) return "Usa de 1 a 3 productos distintos, cantidades enteras positivas y costos válidos."; if (error instanceof FirebaseError && error.code === "permission-denied") return "No tienes permisos para realizar esta acción."; return "No se pudo completar la operación."; }
