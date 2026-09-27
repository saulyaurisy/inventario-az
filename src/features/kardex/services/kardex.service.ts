import { FirebaseError } from "firebase/app";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  Timestamp,
  where,
  type DocumentSnapshot,
} from "firebase/firestore";

import type { UserRole } from "@/features/auth";
import { getFirebaseDb } from "@/lib/firebase";

import type {
  KardexMovement,
  KardexUserOption,
} from "../types/kardex.types";

const ADMIN_INITIAL_LIMIT = 250;

function parseMovement(snapshot: DocumentSnapshot): KardexMovement {
  const data = snapshot.data();
  if (
    !data ||
    typeof data.inventoryId !== "string" ||
    typeof data.productId !== "string" ||
    (data.ownerType !== "company" && data.ownerType !== "agent") ||
    typeof data.ownerId !== "string" ||
    typeof data.type !== "string" ||
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

export async function listKardexMovements(
  role: UserRole,
  actorUid: string,
): Promise<KardexMovement[]> {
  const movementsRef = collection(getFirebaseDb(), "inventory_movements");
  const movementsQuery =
    role === "admin"
      ? query(movementsRef, orderBy("createdAt", "desc"), limit(ADMIN_INITIAL_LIMIT))
      : query(
          movementsRef,
          where("ownerType", "==", "agent"),
          where("ownerId", "==", actorUid),
        );
  const snapshot = await getDocs(movementsQuery);
  return snapshot.docs
    .map(parseMovement)
    .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
}

export async function getKardexMovementById(
  movementId: string,
): Promise<KardexMovement | null> {
  const snapshot = await getDoc(
    doc(getFirebaseDb(), "inventory_movements", movementId),
  );
  return snapshot.exists() ? parseMovement(snapshot) : null;
}

export async function listKardexUsers(): Promise<KardexUserOption[]> {
  const snapshot = await getDocs(collection(getFirebaseDb(), "users"));
  return snapshot.docs.flatMap((item) => {
    const data = item.data();
    if (
      typeof data.uid !== "string" ||
      typeof data.displayName !== "string" ||
      (data.role !== "admin" && data.role !== "agent")
    ) {
      return [];
    }
    return [{ uid: data.uid, displayName: data.displayName, role: data.role }];
  });
}

export function getKardexErrorMessage(error: unknown): string {
  if (error instanceof FirebaseError) {
    if (error.code === "permission-denied") {
      return "No tienes permisos para consultar estos movimientos.";
    }
    if (error.code === "unavailable") {
      return "No se pudo conectar. Revisa tu conexión e intenta nuevamente.";
    }
  }
  return "No se pudo cargar el Kardex. Intenta nuevamente.";
}
