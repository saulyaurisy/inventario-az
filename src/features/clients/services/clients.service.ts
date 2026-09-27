import { FirebaseError } from "firebase/app";
import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  type DocumentSnapshot,
} from "firebase/firestore";

import { getFirebaseDb } from "@/lib/firebase";

import type {
  Client,
  ClientDocumentType,
  ClientInput,
} from "../types/client.types";
import {
  buildClientDocumentKey,
  CLIENT_DOCUMENT_TYPES,
  normalizeDocumentNumber,
} from "../utils/client-validation";

export class ClientDocumentConflictError extends Error {
  constructor() {
    super("Client document already exists");
    this.name = "ClientDocumentConflictError";
  }
}

export class ClientNotFoundError extends Error {
  constructor() {
    super("Client not found");
    this.name = "ClientNotFoundError";
  }
}

function isDocumentType(value: unknown): value is ClientDocumentType {
  return (
    typeof value === "string" &&
    CLIENT_DOCUMENT_TYPES.includes(value as ClientDocumentType)
  );
}

function parseClient(snapshot: DocumentSnapshot): Client {
  const data = snapshot.data();

  if (
    !data ||
    !isDocumentType(data.documentType) ||
    typeof data.documentNumber !== "string" ||
    typeof data.normalizedDocumentNumber !== "string" ||
    typeof data.name !== "string" ||
    typeof data.active !== "boolean" ||
    typeof data.createdBy !== "string" ||
    typeof data.updatedBy !== "string" ||
    !(data.createdAt instanceof Timestamp) ||
    !(data.updatedAt instanceof Timestamp)
  ) {
    throw new Error("Invalid client data");
  }

  return {
    id: snapshot.id,
    documentType: data.documentType,
    documentNumber: data.documentNumber,
    normalizedDocumentNumber: data.normalizedDocumentNumber,
    name: data.name,
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

function sanitizedInput(input: ClientInput): ClientInput & {
  normalizedDocumentNumber: string;
} {
  const normalizedDocumentNumber = normalizeDocumentNumber(
    input.documentNumber,
  );
  const name = input.name.trim();
  const email = input.email?.trim().toLowerCase();

  if (
    !CLIENT_DOCUMENT_TYPES.includes(input.documentType) ||
    !normalizedDocumentNumber ||
    !/^[A-Z0-9][A-Z0-9._ -]*$/.test(normalizedDocumentNumber) ||
    !name ||
    (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  ) {
    throw new Error("Invalid client input");
  }

  const phone = input.phone?.trim();
  const address = input.address?.trim();
  const notes = input.notes?.trim();

  return {
    documentType: input.documentType,
    documentNumber: normalizedDocumentNumber,
    normalizedDocumentNumber,
    name,
    ...(phone ? { phone } : {}),
    ...(email ? { email } : {}),
    ...(address ? { address } : {}),
    ...(notes ? { notes } : {}),
    active: input.active,
  };
}

export async function listClients(): Promise<Client[]> {
  const clientsQuery = query(
    collection(getFirebaseDb(), "clients"),
    orderBy("name"),
  );
  const snapshot = await getDocs(clientsQuery);
  return snapshot.docs.map(parseClient);
}

export async function getClientById(clientId: string): Promise<Client> {
  const snapshot = await getDoc(doc(getFirebaseDb(), "clients", clientId));
  if (!snapshot.exists()) {
    throw new ClientNotFoundError();
  }
  return parseClient(snapshot);
}

export async function createClient(
  input: ClientInput,
  actorUid: string,
): Promise<string> {
  const data = sanitizedInput(input);
  const db = getFirebaseDb();
  const clientRef = doc(collection(db, "clients"));
  const documentKey = buildClientDocumentKey(
    data.documentType,
    data.normalizedDocumentNumber,
  );
  const indexRef = doc(db, "client_documents", documentKey);

  await runTransaction(db, async (transaction) => {
    const indexSnapshot = await transaction.get(indexRef);
    if (indexSnapshot.exists()) {
      throw new ClientDocumentConflictError();
    }

    transaction.set(clientRef, {
      ...data,
      active: true,
      createdBy: actorUid,
      updatedBy: actorUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    transaction.set(indexRef, {
      clientId: clientRef.id,
      documentType: data.documentType,
      documentNumber: data.normalizedDocumentNumber,
    });
  });

  return clientRef.id;
}

export async function updateClient(
  clientId: string,
  input: ClientInput,
  actorUid: string,
): Promise<void> {
  const data = sanitizedInput(input);
  const db = getFirebaseDb();
  const clientRef = doc(db, "clients", clientId);

  await runTransaction(db, async (transaction) => {
    const clientSnapshot = await transaction.get(clientRef);
    if (!clientSnapshot.exists()) {
      throw new ClientNotFoundError();
    }

    const current = clientSnapshot.data();
    if (!isDocumentType(current.documentType)) {
      throw new Error("Invalid client data");
    }

    const currentDocumentKey = buildClientDocumentKey(
      current.documentType,
      String(current.normalizedDocumentNumber),
    );
    const newDocumentKey = buildClientDocumentKey(
      data.documentType,
      data.normalizedDocumentNumber,
    );
    const documentChanged = currentDocumentKey !== newDocumentKey;
    const newIndexRef = doc(db, "client_documents", newDocumentKey);

    if (documentChanged) {
      const newIndexSnapshot = await transaction.get(newIndexRef);
      if (newIndexSnapshot.exists()) {
        throw new ClientDocumentConflictError();
      }
    }

    transaction.update(clientRef, {
      documentType: data.documentType,
      documentNumber: data.documentNumber,
      normalizedDocumentNumber: data.normalizedDocumentNumber,
      name: data.name,
      phone: data.phone ?? deleteField(),
      email: data.email ?? deleteField(),
      address: data.address ?? deleteField(),
      notes: data.notes ?? deleteField(),
      active: data.active,
      updatedBy: actorUid,
      updatedAt: serverTimestamp(),
    });

    if (documentChanged) {
      transaction.set(newIndexRef, {
        clientId,
        documentType: data.documentType,
        documentNumber: data.normalizedDocumentNumber,
      });
      transaction.delete(doc(db, "client_documents", currentDocumentKey));
    }
  });
}

export async function setClientActive(
  clientId: string,
  active: boolean,
  actorUid: string,
): Promise<void> {
  await updateDoc(doc(getFirebaseDb(), "clients", clientId), {
    active,
    updatedBy: actorUid,
    updatedAt: serverTimestamp(),
  });
}

export function getClientErrorMessage(error: unknown): string {
  if (error instanceof ClientDocumentConflictError) {
    return "Ya existe un cliente con ese documento.";
  }

  if (error instanceof ClientNotFoundError) {
    return "El cliente ya no existe.";
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
