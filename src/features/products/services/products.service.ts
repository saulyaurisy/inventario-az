import { FirebaseError } from "firebase/app";
import {
  collection,
  deleteField,
  doc,
  documentId,
  getDoc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  type DocumentSnapshot,
} from "firebase/firestore";

import { getFirebaseDb } from "@/lib/firebase";

import type { Product, ProductInput } from "../types/product.types";
import { normalizeSku } from "../utils/product-validation";

export class ProductSkuConflictError extends Error {
  constructor() {
    super("Product SKU already exists");
    this.name = "ProductSkuConflictError";
  }
}

export class ProductNotFoundError extends Error {
  constructor() {
    super("Product not found");
    this.name = "ProductNotFoundError";
  }
}

function parseProduct(snapshot: DocumentSnapshot): Product {
  const data = snapshot.data();

  if (
    !data ||
    typeof data.sku !== "string" ||
    typeof data.name !== "string" ||
    typeof data.category !== "string" ||
    typeof data.salePrice !== "number" ||
    typeof data.costPrice !== "number" ||
    typeof data.minimumStock !== "number" ||
    typeof data.active !== "boolean" ||
    !(data.createdAt instanceof Timestamp) ||
    !(data.updatedAt instanceof Timestamp)
  ) {
    throw new Error("Invalid product data");
  }

  return {
    id: snapshot.id,
    sku: data.sku,
    ...(typeof data.internalCode === "string"
      ? { internalCode: data.internalCode }
      : {}),
    name: data.name,
    ...(typeof data.description === "string"
      ? { description: data.description }
      : {}),
    category: data.category,
    salePrice: data.salePrice,
    costPrice: data.costPrice,
    minimumStock: data.minimumStock,
    active: data.active,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

function sanitizedInput(input: ProductInput): ProductInput {
  const sku = normalizeSku(input.sku);
  const name = input.name.trim();
  const category = input.category.trim();

  if (
    !sku ||
    !/^[A-Z0-9][A-Z0-9._ -]*$/.test(sku) ||
    !name ||
    !category ||
    !Number.isFinite(input.salePrice) ||
    input.salePrice < 0 ||
    !Number.isFinite(input.costPrice) ||
    input.costPrice < 0 ||
    !Number.isInteger(input.minimumStock) ||
    input.minimumStock < 0
  ) {
    throw new Error("Invalid product input");
  }

  const internalCode = input.internalCode?.trim();
  const description = input.description?.trim();

  return {
    sku,
    ...(internalCode ? { internalCode } : {}),
    name,
    ...(description ? { description } : {}),
    category,
    salePrice: input.salePrice,
    costPrice: input.costPrice,
    minimumStock: input.minimumStock,
    active: input.active,
  };
}

export async function listProducts(): Promise<Product[]> {
  const productsQuery = query(
    collection(getFirebaseDb(), "products"),
    orderBy("name"),
  );
  const snapshot = await getDocs(productsQuery);
  return snapshot.docs.map(parseProduct);
}

export async function listProductsByIds(productIds: string[]): Promise<Product[]> {
  const uniqueIds = [...new Set(productIds.filter(Boolean))];
  if (uniqueIds.length === 0) return [];

  const batches: string[][] = [];
  for (let index = 0; index < uniqueIds.length; index += 30) {
    batches.push(uniqueIds.slice(index, index + 30));
  }
  const snapshots = await Promise.all(
    batches.map((ids) =>
      getDocs(
        query(
          collection(getFirebaseDb(), "products"),
          where(documentId(), "in", ids),
        ),
      ),
    ),
  );

  return snapshots
    .flatMap((snapshot) => snapshot.docs.map(parseProduct))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export async function getProductById(productId: string): Promise<Product> {
  const snapshot = await getDoc(
    doc(getFirebaseDb(), "products", productId),
  );
  if (!snapshot.exists()) {
    throw new ProductNotFoundError();
  }
  return parseProduct(snapshot);
}

export async function createProduct(input: ProductInput): Promise<string> {
  const data = sanitizedInput(input);
  const db = getFirebaseDb();
  const productRef = doc(collection(db, "products"));
  const skuRef = doc(db, "product_skus", data.sku);

  await runTransaction(db, async (transaction) => {
    const skuSnapshot = await transaction.get(skuRef);
    if (skuSnapshot.exists()) {
      throw new ProductSkuConflictError();
    }

    transaction.set(productRef, {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    transaction.set(skuRef, { productId: productRef.id, sku: data.sku });
  });

  return productRef.id;
}

export async function updateProduct(
  productId: string,
  input: ProductInput,
): Promise<void> {
  const data = sanitizedInput(input);
  const db = getFirebaseDb();
  const productRef = doc(db, "products", productId);

  await runTransaction(db, async (transaction) => {
    const productSnapshot = await transaction.get(productRef);
    if (!productSnapshot.exists()) {
      throw new ProductNotFoundError();
    }

    const currentSku = normalizeSku(String(productSnapshot.data().sku));
    const skuChanged = currentSku !== data.sku;
    const newSkuRef = doc(db, "product_skus", data.sku);

    if (skuChanged) {
      const newSkuSnapshot = await transaction.get(newSkuRef);
      if (newSkuSnapshot.exists()) {
        throw new ProductSkuConflictError();
      }
    }

    transaction.update(productRef, {
      sku: data.sku,
      internalCode: data.internalCode ?? deleteField(),
      name: data.name,
      description: data.description ?? deleteField(),
      category: data.category,
      salePrice: data.salePrice,
      costPrice: data.costPrice,
      minimumStock: data.minimumStock,
      active: data.active,
      updatedAt: serverTimestamp(),
    });

    if (skuChanged) {
      transaction.set(newSkuRef, { productId, sku: data.sku });
      transaction.delete(doc(db, "product_skus", currentSku));
    }
  });
}

export async function setProductActive(
  productId: string,
  active: boolean,
): Promise<void> {
  await updateDoc(doc(getFirebaseDb(), "products", productId), {
    active,
    updatedAt: serverTimestamp(),
  });
}

export function getProductErrorMessage(error: unknown): string {
  if (error instanceof ProductSkuConflictError) {
    return "Ya existe un producto con ese SKU.";
  }

  if (error instanceof ProductNotFoundError) {
    return "El producto ya no existe.";
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
