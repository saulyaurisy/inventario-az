import { FirebaseError } from "firebase/app";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  where,
  type DocumentSnapshot,
  type Transaction,
} from "firebase/firestore";

import type { UserRole } from "@/features/auth";
import type { InventoryRecord } from "@/features/inventory";
import { getInventoryId } from "@/features/inventory/utils/inventory-utils";
import { getFirebaseDb } from "@/lib/firebase";

import type {
  Replenishment,
  ReplenishmentInput,
  ReplenishmentItem,
  ReplenishmentStatus,
  ReplenishmentUser,
} from "../types/replenishment.types";
import {
  formatReplenishmentNumber,
  getReplenishmentMovementId,
  validateReplenishmentItems,
} from "../utils/replenishment-utils";

export class ReplenishmentValidationError extends Error {}
export class ReplenishmentNotFoundError extends Error {}
export class ReplenishmentTransitionError extends Error {}
export class ReplenishmentInsufficientStockError extends Error {}
export class ReplenishmentProductError extends Error {}
export class ReplenishmentAgentError extends Error {}

function isStatus(value: unknown): value is ReplenishmentStatus {
  return ["pending", "sent", "received", "cancelled"].includes(String(value));
}

function parseItems(value: unknown): ReplenishmentItem[] | null {
  if (!Array.isArray(value)) return null;
  const items = value.flatMap((item) => {
    if (
      typeof item !== "object" ||
      item === null ||
      !("productId" in item) ||
      !("quantity" in item) ||
      typeof item.productId !== "string" ||
      !Number.isInteger(item.quantity)
    ) {
      return [];
    }
    return [{ productId: item.productId, quantity: Number(item.quantity) }];
  });
  return items.length === value.length && validateReplenishmentItems(items)
    ? items
    : null;
}

function parseReplenishment(snapshot: DocumentSnapshot): Replenishment {
  const data = snapshot.data();
  const items = parseItems(data?.items);
  if (
    !data ||
    typeof data.number !== "string" ||
    !isStatus(data.status) ||
    typeof data.agentId !== "string" ||
    !items ||
    typeof data.createdBy !== "string" ||
    !(data.createdAt instanceof Timestamp) ||
    !(data.updatedAt instanceof Timestamp)
  ) {
    throw new Error("Invalid replenishment data");
  }

  return {
    id: snapshot.id,
    number: data.number,
    status: data.status,
    agentId: data.agentId,
    items,
    ...(typeof data.notes === "string" ? { notes: data.notes } : {}),
    createdBy: data.createdBy,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    ...(typeof data.sentBy === "string" ? { sentBy: data.sentBy } : {}),
    ...(data.sentAt instanceof Timestamp ? { sentAt: data.sentAt } : {}),
    ...(typeof data.receivedBy === "string"
      ? { receivedBy: data.receivedBy }
      : {}),
    ...(data.receivedAt instanceof Timestamp
      ? { receivedAt: data.receivedAt }
      : {}),
    ...(typeof data.cancelledBy === "string"
      ? { cancelledBy: data.cancelledBy }
      : {}),
    ...(data.cancelledAt instanceof Timestamp
      ? { cancelledAt: data.cancelledAt }
      : {}),
  };
}

function parseInventory(snapshot: DocumentSnapshot): InventoryRecord {
  const data = snapshot.data();
  if (
    !data ||
    typeof data.productId !== "string" ||
    (data.ownerType !== "company" && data.ownerType !== "agent") ||
    typeof data.ownerId !== "string" ||
    !Number.isInteger(data.quantity) ||
    data.quantity < 0 ||
    typeof data.lastMovementId !== "string" ||
    !(data.createdAt instanceof Timestamp) ||
    !(data.updatedAt instanceof Timestamp)
  ) {
    throw new Error("Invalid inventory data");
  }
  return {
    id: snapshot.id,
    productId: data.productId,
    ownerType: data.ownerType,
    ownerId: data.ownerId,
    quantity: data.quantity,
    lastMovementId: data.lastMovementId,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

function sanitizeInput(input: ReplenishmentInput): ReplenishmentInput {
  const items = input.items.map((item) => ({
    productId: item.productId.trim(),
    quantity: item.quantity,
  }));
  if (!input.agentId.trim() || !validateReplenishmentItems(items)) {
    throw new ReplenishmentValidationError();
  }
  const notes = input.notes?.trim();
  return {
    agentId: input.agentId.trim(),
    items,
    ...(notes ? { notes } : {}),
  };
}

async function readValidAgentAndProducts(
  transaction: Transaction,
  input: ReplenishmentInput,
  requireActiveProducts: boolean,
) {
  const db = getFirebaseDb();
  const agentSnapshot = await transaction.get(doc(db, "users", input.agentId));
  if (
    !agentSnapshot.exists() ||
    agentSnapshot.data().role !== "agent" ||
    agentSnapshot.data().active !== true
  ) {
    throw new ReplenishmentAgentError();
  }
  for (const item of input.items) {
    const productSnapshot = await transaction.get(doc(db, "products", item.productId));
    if (
      !productSnapshot.exists() ||
      (requireActiveProducts && productSnapshot.data().active !== true)
    ) {
      throw new ReplenishmentProductError();
    }
  }
}

export async function createReplenishment(
  rawInput: ReplenishmentInput,
  actorUid: string,
): Promise<string> {
  const input = sanitizeInput(rawInput);
  const db = getFirebaseDb();
  const replenishmentRef = doc(collection(db, "replenishments"));
  const counterRef = doc(db, "system_counters", "replenishments");

  await runTransaction(db, async (transaction) => {
    const counterSnapshot = await transaction.get(counterRef);
    await readValidAgentAndProducts(transaction, input, true);
    const currentCount = counterSnapshot.exists()
      ? Number(counterSnapshot.data().count)
      : 0;
    if (!Number.isInteger(currentCount) || currentCount < 0) {
      throw new ReplenishmentValidationError();
    }
    const nextCount = currentCount + 1;
    transaction.set(counterRef, { count: nextCount });
    transaction.set(replenishmentRef, {
      number: formatReplenishmentNumber(nextCount),
      status: "pending",
      agentId: input.agentId,
      items: input.items,
      notes: input.notes ?? "",
      createdBy: actorUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
  return replenishmentRef.id;
}

export async function updatePendingReplenishment(
  replenishmentId: string,
  rawInput: ReplenishmentInput,
): Promise<void> {
  const input = sanitizeInput(rawInput);
  const db = getFirebaseDb();
  const replenishmentRef = doc(db, "replenishments", replenishmentId);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(replenishmentRef);
    if (!snapshot.exists()) throw new ReplenishmentNotFoundError();
    const current = parseReplenishment(snapshot);
    if (current.status !== "pending") throw new ReplenishmentTransitionError();
    await readValidAgentAndProducts(transaction, input, true);
    transaction.update(replenishmentRef, {
      agentId: input.agentId,
      items: input.items,
      notes: input.notes ?? "",
      updatedAt: serverTimestamp(),
    });
  });
}

export async function listReplenishments(
  role: UserRole,
  actorUid: string,
): Promise<Replenishment[]> {
  const ref = collection(getFirebaseDb(), "replenishments");
  const replenishmentsQuery =
    role === "admin"
      ? query(ref, orderBy("createdAt", "desc"))
      : query(ref, where("agentId", "==", actorUid));
  const snapshot = await getDocs(replenishmentsQuery);
  return snapshot.docs
    .map(parseReplenishment)
    .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
}

export async function getReplenishmentById(
  replenishmentId: string,
): Promise<Replenishment | null> {
  const snapshot = await getDoc(
    doc(getFirebaseDb(), "replenishments", replenishmentId),
  );
  return snapshot.exists() ? parseReplenishment(snapshot) : null;
}

export async function listReplenishmentUsers(): Promise<ReplenishmentUser[]> {
  const snapshot = await getDocs(collection(getFirebaseDb(), "users"));
  return snapshot.docs.flatMap((item) => {
    const data = item.data();
    if (
      typeof data.uid !== "string" ||
      typeof data.displayName !== "string" ||
      typeof data.email !== "string" ||
      (data.role !== "admin" && data.role !== "agent") ||
      typeof data.active !== "boolean"
    ) {
      return [];
    }
    return [{
      uid: data.uid,
      displayName: data.displayName,
      email: data.email,
      role: data.role,
      active: data.active,
    }];
  });
}

export async function cancelReplenishment(
  replenishmentId: string,
  actorUid: string,
): Promise<void> {
  const db = getFirebaseDb();
  const replenishmentRef = doc(db, "replenishments", replenishmentId);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(replenishmentRef);
    if (!snapshot.exists()) throw new ReplenishmentNotFoundError();
    if (parseReplenishment(snapshot).status !== "pending") {
      throw new ReplenishmentTransitionError();
    }
    transaction.update(replenishmentRef, {
      status: "cancelled",
      cancelledBy: actorUid,
      cancelledAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
}

export async function sendReplenishment(
  replenishmentId: string,
  actorUid: string,
): Promise<void> {
  const db = getFirebaseDb();
  const replenishmentRef = doc(db, "replenishments", replenishmentId);
  try {
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(replenishmentRef);
      if (!snapshot.exists()) throw new ReplenishmentNotFoundError();
      const replenishment = parseReplenishment(snapshot);
      if (replenishment.status !== "pending") {
        throw new ReplenishmentTransitionError();
      }
      await readValidAgentAndProducts(transaction, replenishment, true);
      const inventories: InventoryRecord[] = [];
      for (const item of replenishment.items) {
        const inventorySnapshot = await transaction.get(
          doc(db, "inventory", getInventoryId("company", "company", item.productId)),
        );
        if (!inventorySnapshot.exists()) throw new ReplenishmentInsufficientStockError();
        const inventory = parseInventory(inventorySnapshot);
        if (inventory.quantity < item.quantity) {
          throw new ReplenishmentInsufficientStockError();
        }
        inventories.push(inventory);
      }

      replenishment.items.forEach((item, index) => {
        const inventory = inventories[index];
        const movementId = getReplenishmentMovementId(
          replenishmentId,
          "sent",
          item.productId,
        );
        transaction.update(doc(db, "inventory", inventory.id), {
          quantity: inventory.quantity - item.quantity,
          lastMovementId: movementId,
          updatedAt: serverTimestamp(),
        });
        transaction.set(doc(db, "inventory_movements", movementId), {
          inventoryId: inventory.id,
          productId: item.productId,
          ownerType: "company",
          ownerId: "company",
          type: "replenishment_out",
          quantity: item.quantity,
          quantityBefore: inventory.quantity,
          quantityAfter: inventory.quantity - item.quantity,
          reason: `Reposición ${replenishment.number} enviada`,
          referenceType: "replenishment",
          referenceId: replenishmentId,
          createdBy: actorUid,
          createdAt: serverTimestamp(),
        });
      });
      transaction.update(replenishmentRef, {
        status: "sent",
        sentBy: actorUid,
        sentAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
  } catch (error) {
    if (error instanceof FirebaseError && error.code === "permission-denied") {
      const latest = await getReplenishmentById(replenishmentId);
      if (latest && latest.status !== "pending") {
        throw new ReplenishmentTransitionError();
      }
    }
    throw error;
  }
}

export async function receiveReplenishment(
  replenishmentId: string,
  actorUid: string,
): Promise<void> {
  const db = getFirebaseDb();
  const replenishmentRef = doc(db, "replenishments", replenishmentId);
  try {
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(replenishmentRef);
      if (!snapshot.exists()) throw new ReplenishmentNotFoundError();
      const replenishment = parseReplenishment(snapshot);
      if (replenishment.status !== "sent" || replenishment.agentId !== actorUid) {
        throw new ReplenishmentTransitionError();
      }
      const input: ReplenishmentInput = {
        agentId: replenishment.agentId,
        items: replenishment.items,
      };
      await readValidAgentAndProducts(transaction, input, false);
      const inventorySnapshots: DocumentSnapshot[] = [];
      for (const item of replenishment.items) {
        inventorySnapshots.push(
          await transaction.get(
            doc(db, "inventory", getInventoryId("agent", actorUid, item.productId)),
          ),
        );
      }

      replenishment.items.forEach((item, index) => {
        const inventorySnapshot = inventorySnapshots[index];
        const inventoryId = getInventoryId("agent", actorUid, item.productId);
        const movementId = getReplenishmentMovementId(
          replenishmentId,
          "received",
          item.productId,
        );
        const quantityBefore = inventorySnapshot.exists()
          ? parseInventory(inventorySnapshot).quantity
          : 0;
        const inventoryData = {
          productId: item.productId,
          ownerType: "agent",
          ownerId: actorUid,
          quantity: quantityBefore + item.quantity,
          lastMovementId: movementId,
          updatedAt: serverTimestamp(),
        };
        if (inventorySnapshot.exists()) {
          transaction.update(doc(db, "inventory", inventoryId), inventoryData);
        } else {
          transaction.set(doc(db, "inventory", inventoryId), {
            ...inventoryData,
            createdAt: serverTimestamp(),
          });
        }
        transaction.set(doc(db, "inventory_movements", movementId), {
          inventoryId,
          productId: item.productId,
          ownerType: "agent",
          ownerId: actorUid,
          type: "replenishment_in",
          quantity: item.quantity,
          quantityBefore,
          quantityAfter: quantityBefore + item.quantity,
          reason: `Reposición ${replenishment.number} recibida`,
          referenceType: "replenishment",
          referenceId: replenishmentId,
          createdBy: actorUid,
          createdAt: serverTimestamp(),
        });
      });
      transaction.update(replenishmentRef, {
        status: "received",
        receivedBy: actorUid,
        receivedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
  } catch (error) {
    if (error instanceof FirebaseError && error.code === "permission-denied") {
      const latest = await getReplenishmentById(replenishmentId);
      if (latest && latest.status !== "sent") {
        throw new ReplenishmentTransitionError();
      }
    }
    throw error;
  }
}

export function getReplenishmentErrorMessage(error: unknown): string {
  if (error instanceof ReplenishmentValidationError) {
    return "Revisa el agente y los productos. Usa cantidades enteras mayores que cero y no repitas productos.";
  }
  if (error instanceof ReplenishmentNotFoundError) return "La reposición ya no existe.";
  if (error instanceof ReplenishmentTransitionError) {
    return "La operación ya fue realizada o el estado de la reposición cambió.";
  }
  if (error instanceof ReplenishmentInsufficientStockError) {
    return "La empresa no tiene stock suficiente de uno o más productos.";
  }
  if (error instanceof ReplenishmentProductError) {
    return "Uno o más productos no existen o están inactivos.";
  }
  if (error instanceof ReplenishmentAgentError) {
    return "El agente no existe, está inactivo o no tiene el rol correcto.";
  }
  if (error instanceof FirebaseError) {
    if (error.code === "permission-denied") return "No tienes permisos para realizar esta acción.";
    if (error.code === "unavailable") return "No se pudo conectar. Revisa tu conexión e intenta nuevamente.";
  }
  return "No se pudo completar la operación. Intenta nuevamente.";
}
