import { FirebaseError } from "firebase/app";
import {
  collection,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";

import { getFirebaseDb } from "@/lib/firebase";

import type {
  InventoryImportDestination,
  InventoryImportPreviewRow,
  InventoryImportRowResult,
  InventoryImportSummary,
} from "../types/inventory-import.types";
import { INVENTORY_IMPORT_MAX_ROWS } from "../utils/inventory-import-utils";
import { getInventoryId } from "../utils/inventory-utils";

export class InventoryImportUnauthorizedError extends Error {}
export class InventoryImportConflictError extends Error {}
export class InventoryImportInvalidRowError extends Error {}
export class InventoryImportOwnerError extends Error {}

async function validateDestination(
  destination: InventoryImportDestination,
): Promise<void> {
  if (destination.ownerType === "company") {
    if (destination.ownerId !== "company") {
      throw new InventoryImportOwnerError();
    }
    return;
  }

  if (!destination.ownerId) {
    throw new InventoryImportOwnerError();
  }

  const ownerSnapshot = await getDoc(
    doc(getFirebaseDb(), "users", destination.ownerId),
  );
  if (
    !ownerSnapshot.exists() ||
    ownerSnapshot.data().role !== "agent" ||
    ownerSnapshot.data().active !== true
  ) {
    throw new InventoryImportOwnerError();
  }
}

function assertImportableRow(
  row: InventoryImportPreviewRow,
): asserts row is InventoryImportPreviewRow & {
  initialStock: number;
  minimumStock: number;
} {
  if (
    row.errors.length > 0 ||
    !row.sku ||
    row.initialStock === null ||
    row.minimumStock === null ||
    row.initialStock < 0 ||
    row.minimumStock < 0 ||
    !Number.isInteger(row.initialStock) ||
    !Number.isInteger(row.minimumStock)
  ) {
    throw new InventoryImportInvalidRowError();
  }
}

async function importInventoryRow(
  row: InventoryImportPreviewRow,
  actorUid: string,
  destination: InventoryImportDestination,
): Promise<InventoryImportRowResult> {
  assertImportableRow(row);
  const db = getFirebaseDb();
  const skuRef = doc(db, "product_skus", row.sku);
  const newProductRef = doc(collection(db, "products"));
  const expectedProductId = row.productId ?? newProductRef.id;
  const productRef = doc(db, "products", expectedProductId);
  const inventoryId = getInventoryId(
    destination.ownerType,
    destination.ownerId,
    expectedProductId,
  );
  const inventoryRef = doc(db, "inventory", inventoryId);
  const movementRef = doc(collection(db, "inventory_movements"));

  return runTransaction(db, async (transaction) => {
    const skuSnapshot = await transaction.get(skuRef);
    const skuProductId = skuSnapshot.exists()
      ? String(skuSnapshot.data().productId ?? "")
      : null;

    if (row.productState === "new" && skuSnapshot.exists()) {
      throw new InventoryImportConflictError();
    }
    if (
      row.productState === "existing" &&
      (!skuSnapshot.exists() || skuProductId !== row.productId)
    ) {
      throw new InventoryImportConflictError();
    }

    if (row.productState === "new") {
      const inventorySnapshot = await transaction.get(inventoryRef);
      if (inventorySnapshot.exists()) {
        throw new InventoryImportConflictError();
      }

      transaction.set(productRef, {
        sku: row.sku,
        name: row.importedName.trim(),
        ...(row.description?.trim()
          ? { description: row.description.trim() }
          : {}),
        category: "Importado",
        salePrice: row.salePrice ?? 0,
        costPrice: 0,
        minimumStock: row.minimumStock,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      transaction.set(skuRef, {
        productId: productRef.id,
        sku: row.sku,
      });
      transaction.set(inventoryRef, {
        productId: productRef.id,
        ownerType: destination.ownerType,
        ownerId: destination.ownerId,
        quantity: row.initialStock,
        lastMovementId: movementRef.id,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      transaction.set(movementRef, {
        inventoryId,
        productId: productRef.id,
        ownerType: destination.ownerType,
        ownerId: destination.ownerId,
        type: "initial",
        quantity: row.initialStock,
        quantityBefore: 0,
        quantityAfter: row.initialStock,
        reason: "Importación masiva de inventario",
        createdBy: actorUid,
        createdAt: serverTimestamp(),
      });

      return {
        rowNumber: row.rowNumber,
        sku: row.sku,
        success: true,
        productCreated: true,
        productExisting: false,
        inventoryCreated: true,
        adjustment: null,
        skipped: false,
      };
    }

    const [productSnapshot, inventorySnapshot] = await Promise.all([
      transaction.get(productRef),
      transaction.get(inventoryRef),
    ]);
    if (!productSnapshot.exists() || productSnapshot.data().active !== true) {
      throw new InventoryImportConflictError();
    }

    const currentMinimumStock = Number(productSnapshot.data().minimumStock);
    if (currentMinimumStock !== row.minimumStock) {
      transaction.update(productRef, {
        minimumStock: row.minimumStock,
        updatedAt: serverTimestamp(),
      });
    }

    if (!inventorySnapshot.exists()) {
      transaction.set(inventoryRef, {
        productId: productRef.id,
        ownerType: destination.ownerType,
        ownerId: destination.ownerId,
        quantity: row.initialStock,
        lastMovementId: movementRef.id,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      transaction.set(movementRef, {
        inventoryId,
        productId: productRef.id,
        ownerType: destination.ownerType,
        ownerId: destination.ownerId,
        type: "initial",
        quantity: row.initialStock,
        quantityBefore: 0,
        quantityAfter: row.initialStock,
        reason: "Importación masiva de inventario",
        createdBy: actorUid,
        createdAt: serverTimestamp(),
      });
      return {
        rowNumber: row.rowNumber,
        sku: row.sku,
        success: true,
        productCreated: false,
        productExisting: true,
        inventoryCreated: true,
        adjustment: null,
        skipped: false,
      };
    }

    const currentQuantity = Number(inventorySnapshot.data().quantity);
    if (
      !Number.isInteger(currentQuantity) ||
      currentQuantity < 0 ||
      inventorySnapshot.data().productId !== productRef.id ||
      inventorySnapshot.data().ownerType !== destination.ownerType ||
      inventorySnapshot.data().ownerId !== destination.ownerId
    ) {
      throw new InventoryImportConflictError();
    }

    if (row.action !== "adjust" || currentQuantity === row.initialStock) {
      return {
        rowNumber: row.rowNumber,
        sku: row.sku,
        success: true,
        productCreated: false,
        productExisting: true,
        inventoryCreated: false,
        adjustment: null,
        skipped: row.action === "no_change",
      };
    }

    const difference = row.initialStock - currentQuantity;
    const adjustment = difference > 0 ? "in" : "out";
    transaction.update(inventoryRef, {
      quantity: row.initialStock,
      lastMovementId: movementRef.id,
      updatedAt: serverTimestamp(),
    });
    transaction.set(movementRef, {
      inventoryId,
      productId: productRef.id,
      ownerType: destination.ownerType,
      ownerId: destination.ownerId,
      type: adjustment === "in" ? "adjustment_in" : "adjustment_out",
      quantity: Math.abs(difference),
      quantityBefore: currentQuantity,
      quantityAfter: row.initialStock,
      reason: "Ajuste por importación masiva de inventario",
      createdBy: actorUid,
      createdAt: serverTimestamp(),
    });

    return {
      rowNumber: row.rowNumber,
      sku: row.sku,
      success: true,
      productCreated: false,
      productExisting: true,
      inventoryCreated: false,
      adjustment,
      skipped: false,
    };
  });
}

export async function importInventoryRows(
  rows: InventoryImportPreviewRow[],
  destination: InventoryImportDestination,
  actor: { uid: string; role: "admin" | "agent" },
  onProgress?: (completed: number, total: number) => void,
): Promise<InventoryImportSummary> {
  if (actor.role !== "admin") {
    throw new InventoryImportUnauthorizedError();
  }
  if (
    rows.length === 0 ||
    rows.length > INVENTORY_IMPORT_MAX_ROWS ||
    rows.some((row) => row.errors.length > 0)
  ) {
    throw new InventoryImportInvalidRowError();
  }
  await validateDestination(destination);

  const results: InventoryImportRowResult[] = [];
  for (const row of rows) {
    try {
      results.push(await importInventoryRow(row, actor.uid, destination));
    } catch (error) {
      results.push({
        rowNumber: row.rowNumber,
        sku: row.sku,
        success: false,
        productCreated: false,
        productExisting: row.productState === "existing",
        inventoryCreated: false,
        adjustment: null,
        skipped: false,
        error: getInventoryImportErrorMessage(error),
      });
    }
    onProgress?.(results.length, rows.length);
  }

  return {
    rowsProcessed: results.filter((result) => result.success).length,
    productsCreated: results.filter((result) => result.productCreated).length,
    productsExisting: results.filter(
      (result) => result.success && result.productExisting,
    ).length,
    inventoriesCreated: results.filter((result) => result.inventoryCreated).length,
    adjustmentsIn: results.filter((result) => result.adjustment === "in").length,
    adjustmentsOut: results.filter((result) => result.adjustment === "out").length,
    rowsSkipped: results.filter((result) => result.skipped).length,
    errors: results.filter((result) => !result.success).length,
    results,
  };
}

export function getInventoryImportErrorMessage(error: unknown): string {
  if (error instanceof InventoryImportUnauthorizedError) {
    return "Solo un administrador puede importar inventario.";
  }
  if (error instanceof InventoryImportInvalidRowError) {
    return "La fila contiene datos inválidos.";
  }
  if (error instanceof InventoryImportOwnerError) {
    return "El propietario seleccionado no es válido o ya no está activo.";
  }
  if (error instanceof InventoryImportConflictError) {
    return "Los datos cambiaron después de la vista previa. Vuelve a cargar el archivo.";
  }
  if (error instanceof FirebaseError) {
    if (error.code === "permission-denied") {
      return "No tienes permisos para importar inventario.";
    }
    if (error.code === "unavailable") {
      return "No se pudo conectar con Firestore.";
    }
  }
  return "No se pudo importar esta fila.";
}
