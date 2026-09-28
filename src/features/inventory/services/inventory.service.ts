import { FirebaseError } from "firebase/app";
import {
  collection,
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

import { getFirebaseDb } from "@/lib/firebase";

import type {
  InitialStockInput,
  InventoryAdjustmentInput,
  InventoryAgent,
  InventoryMovement,
  InventoryMovementType,
  InventoryOwnerType,
  InventoryRecord,
} from "../types/inventory.types";
import {
  getInventoryId,
  validatePositiveInteger,
} from "../utils/inventory-utils";

export class InventoryAlreadyInitializedError extends Error {}
export class InventoryNotInitializedError extends Error {}
export class InsufficientStockError extends Error {}
export class InvalidInventoryQuantityError extends Error {}
export class InventoryReasonRequiredError extends Error {}
export class InventoryProductError extends Error {}
export class InventoryOwnerError extends Error {}

function isOwnerType(value: unknown): value is InventoryOwnerType {
  return value === "company" || value === "agent";
}

function isMovementType(value: unknown): value is InventoryMovementType {
  return [
    "initial",
    "adjustment_in",
    "adjustment_out",
    "replenishment_out",
    "replenishment_in",
    "sale",
    "purchase_in",
  ].includes(String(value));
}

function parseInventory(snapshot: DocumentSnapshot): InventoryRecord {
  const data = snapshot.data();
  if (
    !data ||
    typeof data.productId !== "string" ||
    !isOwnerType(data.ownerType) ||
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

function parseMovement(snapshot: DocumentSnapshot): InventoryMovement {
  const data = snapshot.data();
  if (
    !data ||
    typeof data.inventoryId !== "string" ||
    typeof data.productId !== "string" ||
    !isOwnerType(data.ownerType) ||
    typeof data.ownerId !== "string" ||
    !isMovementType(data.type) ||
    !Number.isInteger(data.quantity) ||
    !Number.isInteger(data.quantityBefore) ||
    !Number.isInteger(data.quantityAfter) ||
    typeof data.reason !== "string" ||
    typeof data.createdBy !== "string" ||
    !(data.createdAt instanceof Timestamp)
  ) {
    throw new Error("Invalid inventory movement data");
  }

  return {
    id: snapshot.id,
    inventoryId: data.inventoryId,
    productId: data.productId,
    ownerType: data.ownerType,
    ownerId: data.ownerId,
    type: data.type,
    quantity: data.quantity,
    quantityBefore: data.quantityBefore,
    quantityAfter: data.quantityAfter,
    reason: data.reason,
    ...(typeof data.referenceType === "string"
      ? { referenceType: data.referenceType }
      : {}),
    ...(typeof data.referenceId === "string"
      ? { referenceId: data.referenceId }
      : {}),
    createdBy: data.createdBy,
    createdAt: data.createdAt,
  };
}

function validateOperation(quantity: number, reason: string) {
  if (!validatePositiveInteger(quantity)) {
    throw new InvalidInventoryQuantityError();
  }
  if (!reason.trim()) {
    throw new InventoryReasonRequiredError();
  }
}

export async function listInventory(
  role: "admin" | "agent",
  actorUid: string,
): Promise<InventoryRecord[]> {
  const db = getFirebaseDb();
  const inventoryQuery =
    role === "admin"
      ? query(collection(db, "inventory"))
      : query(
          collection(db, "inventory"),
          where("ownerType", "==", "agent"),
          where("ownerId", "==", actorUid),
        );
  const snapshot = await getDocs(inventoryQuery);
  return snapshot.docs.map(parseInventory);
}

export async function getInventoryRecord(
  inventoryId: string,
): Promise<InventoryRecord | null> {
  const snapshot = await getDoc(doc(getFirebaseDb(), "inventory", inventoryId));
  return snapshot.exists() ? parseInventory(snapshot) : null;
}

export async function getInventoryByProductAndOwner(
  productId: string,
  ownerType: InventoryOwnerType,
  ownerId: string,
): Promise<InventoryRecord | null> {
  return getInventoryRecord(getInventoryId(ownerType, ownerId, productId));
}

export async function listInventoryAgents(): Promise<InventoryAgent[]> {
  const snapshot = await getDocs(collection(getFirebaseDb(), "users"));
  return snapshot.docs
    .map((item) => item.data())
    .filter(
      (data) =>
        data.role === "agent" &&
        data.active === true &&
        typeof data.uid === "string" &&
        typeof data.displayName === "string" &&
        typeof data.email === "string",
    )
    .map((data) => ({
      uid: String(data.uid),
      displayName: String(data.displayName),
      email: String(data.email),
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "es"));
}

export async function setInitialStock(
  input: InitialStockInput,
  actorUid: string,
): Promise<void> {
  validateOperation(input.quantity, input.reason);
  if (
    (input.ownerType === "company" && input.ownerId !== "company") ||
    (input.ownerType === "agent" && !input.ownerId)
  ) {
    throw new InventoryOwnerError();
  }

  const db = getFirebaseDb();
  const inventoryId = getInventoryId(
    input.ownerType,
    input.ownerId,
    input.productId,
  );
  const inventoryRef = doc(db, "inventory", inventoryId);
  const productRef = doc(db, "products", input.productId);
  const movementRef = doc(collection(db, "inventory_movements"));
  const ownerRef =
    input.ownerType === "agent" ? doc(db, "users", input.ownerId) : null;

  await runTransaction(db, async (transaction) => {
    const productSnapshot = await transaction.get(productRef);
    const inventorySnapshot = await transaction.get(inventoryRef);
    const ownerSnapshot = ownerRef ? await transaction.get(ownerRef) : null;

    if (!productSnapshot.exists() || productSnapshot.data().active !== true) {
      throw new InventoryProductError();
    }
    if (inventorySnapshot.exists()) {
      throw new InventoryAlreadyInitializedError();
    }
    if (
      ownerSnapshot &&
      (!ownerSnapshot.exists() ||
        ownerSnapshot.data().role !== "agent" ||
        ownerSnapshot.data().active !== true)
    ) {
      throw new InventoryOwnerError();
    }

    transaction.set(inventoryRef, {
      productId: input.productId,
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      quantity: input.quantity,
      lastMovementId: movementRef.id,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    transaction.set(movementRef, {
      inventoryId,
      productId: input.productId,
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      type: "initial",
      quantity: input.quantity,
      quantityBefore: 0,
      quantityAfter: input.quantity,
      reason: input.reason.trim(),
      createdBy: actorUid,
      createdAt: serverTimestamp(),
    });
  });
}

export async function adjustInventory(
  input: InventoryAdjustmentInput,
  actorUid: string,
): Promise<void> {
  validateOperation(input.quantity, input.reason);
  if (input.direction !== "in" && input.direction !== "out") {
    throw new InvalidInventoryQuantityError();
  }
  const db = getFirebaseDb();
  const inventoryRef = doc(db, "inventory", input.inventoryId);
  const movementRef = doc(collection(db, "inventory_movements"));

  try {
    await runTransaction(db, async (transaction) => {
      const inventorySnapshot = await transaction.get(inventoryRef);
      if (!inventorySnapshot.exists()) {
        throw new InventoryNotInitializedError();
      }
      const inventory = parseInventory(inventorySnapshot);
      const productSnapshot = await transaction.get(
        doc(db, "products", inventory.productId),
      );
      if (!productSnapshot.exists()) {
        throw new InventoryProductError();
      }

      const quantityAfter =
        input.direction === "in"
          ? inventory.quantity + input.quantity
          : inventory.quantity - input.quantity;
      if (quantityAfter < 0) {
        throw new InsufficientStockError();
      }

      const type: InventoryMovementType =
        input.direction === "in" ? "adjustment_in" : "adjustment_out";
      transaction.update(inventoryRef, {
        quantity: quantityAfter,
        lastMovementId: movementRef.id,
        updatedAt: serverTimestamp(),
      });
      transaction.set(movementRef, {
        inventoryId: inventory.id,
        productId: inventory.productId,
        ownerType: inventory.ownerType,
        ownerId: inventory.ownerId,
        type,
        quantity: input.quantity,
        quantityBefore: inventory.quantity,
        quantityAfter,
        reason: input.reason.trim(),
        createdBy: actorUid,
        createdAt: serverTimestamp(),
      });
    });
  } catch (error) {
    if (
      input.direction === "out" &&
      error instanceof FirebaseError &&
      error.code === "permission-denied"
    ) {
      const latestSnapshot = await getDoc(inventoryRef);
      if (
        latestSnapshot.exists() &&
        parseInventory(latestSnapshot).quantity < input.quantity
      ) {
        throw new InsufficientStockError();
      }
    }
    throw error;
  }
}

export async function listInventoryMovements(
  inventoryId: string,
): Promise<InventoryMovement[]> {
  const snapshot = await getDocs(
    query(
      collection(getFirebaseDb(), "inventory_movements"),
      where("inventoryId", "==", inventoryId),
    ),
  );
  return snapshot.docs
    .map(parseMovement)
    .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
}

export function getInventoryErrorMessage(error: unknown): string {
  if (error instanceof InventoryAlreadyInitializedError) {
    return "El inventario ya fue inicializado. Usa un ajuste.";
  }
  if (error instanceof InventoryNotInitializedError) {
    return "Este inventario todavía no está inicializado.";
  }
  if (error instanceof InsufficientStockError) {
    return "No hay stock suficiente para realizar esta salida.";
  }
  if (error instanceof InvalidInventoryQuantityError) {
    return "La cantidad debe ser un entero mayor que cero.";
  }
  if (error instanceof InventoryReasonRequiredError) {
    return "Ingresa un motivo para la operación.";
  }
  if (error instanceof InventoryProductError) {
    return "El producto no existe o no está disponible para inicialización.";
  }
  if (error instanceof InventoryOwnerError) {
    return "Selecciona un agente activo válido.";
  }
  if (error instanceof FirebaseError) {
    if (error.code === "permission-denied") {
      return "No tienes permisos para realizar esta acción.";
    }
    if (error.code === "unavailable") {
      return "No se pudo conectar. Revisa tu conexión e intenta nuevamente.";
    }
  }
  return "No se pudo completar la operación. Intenta nuevamente.";
}
