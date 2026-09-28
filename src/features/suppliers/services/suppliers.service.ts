import { FirebaseError } from "firebase/app";
import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  type DocumentSnapshot,
} from "firebase/firestore";

import { getFirebaseDb } from "@/lib/firebase";

import type { Supplier, SupplierInput } from "../types/supplier.types";
import { sanitizeSupplierInput } from "../utils/supplier-validation";

export class SupplierNotFoundError extends Error {}

function parseSupplier(snapshot: DocumentSnapshot): Supplier {
  const data = snapshot.data();
  if (!data || typeof data.name !== "string" || typeof data.active !== "boolean" ||
    typeof data.createdBy !== "string" || typeof data.updatedBy !== "string" ||
    !(data.createdAt instanceof Timestamp) || !(data.updatedAt instanceof Timestamp)) {
    throw new Error("Invalid supplier data");
  }
  return {
    id: snapshot.id,
    name: data.name,
    ...(typeof data.taxId === "string" ? { taxId: data.taxId } : {}),
    ...(typeof data.contactName === "string" ? { contactName: data.contactName } : {}),
    ...(typeof data.phone === "string" ? { phone: data.phone } : {}),
    ...(typeof data.email === "string" ? { email: data.email } : {}),
    ...(typeof data.address === "string" ? { address: data.address } : {}),
    ...(typeof data.notes === "string" ? { notes: data.notes } : {}),
    active: data.active,
    createdBy: data.createdBy,
    updatedBy: data.updatedBy,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

export async function createSupplier(input: SupplierInput, actorUid: string): Promise<string> {
  const data = sanitizeSupplierInput(input);
  const ref = doc(collection(getFirebaseDb(), "suppliers"));
  await setDoc(ref, { ...data, active: true, createdBy: actorUid, updatedBy: actorUid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return ref.id;
}

export async function updateSupplier(id: string, input: SupplierInput, actorUid: string): Promise<void> {
  const ref = doc(getFirebaseDb(), "suppliers", id);
  if (!(await getDoc(ref)).exists()) throw new SupplierNotFoundError();
  const data = sanitizeSupplierInput(input);
  await updateDoc(ref, {
    name: data.name,
    taxId: data.taxId ?? deleteField(),
    contactName: data.contactName ?? deleteField(),
    phone: data.phone ?? deleteField(),
    email: data.email ?? deleteField(),
    address: data.address ?? deleteField(),
    notes: data.notes ?? deleteField(),
    updatedBy: actorUid,
    updatedAt: serverTimestamp(),
  });
}

export async function listSuppliers(): Promise<Supplier[]> {
  const snapshot = await getDocs(query(collection(getFirebaseDb(), "suppliers"), orderBy("name")));
  return snapshot.docs.map(parseSupplier);
}

export async function getSupplierById(id: string): Promise<Supplier | null> {
  const snapshot = await getDoc(doc(getFirebaseDb(), "suppliers", id));
  return snapshot.exists() ? parseSupplier(snapshot) : null;
}

export async function setSupplierActive(id: string, active: boolean, actorUid: string): Promise<void> {
  await updateDoc(doc(getFirebaseDb(), "suppliers", id), { active, updatedBy: actorUid, updatedAt: serverTimestamp() });
}

export function getSupplierErrorMessage(error: unknown): string {
  if (error instanceof SupplierNotFoundError) return "El proveedor ya no existe.";
  if (error instanceof FirebaseError && error.code === "permission-denied") return "No tienes permisos para realizar esta acción.";
  if (error instanceof FirebaseError && error.code === "unavailable") return "No se pudo conectar. Intenta nuevamente.";
  if (error instanceof Error && error.message === "Invalid supplier email") return "El correo del proveedor no es válido.";
  return "Revisa los datos del proveedor e intenta nuevamente.";
}
