import "server-only";

import { randomUUID } from "node:crypto";

import { FieldValue, Timestamp } from "firebase-admin/firestore";

import type { UserRole } from "@/features/auth";
import {
  getFirebaseAdminAuth,
  getFirebaseAdminDb,
} from "@/lib/firebase/admin";
import {
  createDriveResumableSession,
  deleteDriveFile,
  downloadDriveFile,
  findDriveFileByUploadId,
  getDriveFileMetadata,
  getDriveFolderId,
  type DriveFileMetadata,
} from "@/lib/google-drive/google-drive.server";

import type { PaymentProofAttachment } from "../types/payment-proof.types";

export const MAX_PAYMENT_PROOF_FILE_SIZE = 5 * 1024 * 1024;
export const PAYMENT_PROOF_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

type AllowedMimeType = (typeof PAYMENT_PROOF_MIME_TYPES)[number];

const EXTENSION_BY_MIME: Record<AllowedMimeType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

interface BackendActor {
  uid: string;
  role: UserRole;
}

interface UploadIntent {
  saleId: string;
  uploadedBy: string;
  expectedFileName: string;
  expectedMimeType: AllowedMimeType;
  expectedSize: number;
  status: "pending" | "confirmed" | "failed";
  expiresAt: Timestamp;
  fileId?: string;
  previousFileId?: string;
  cleanupStatus?: "pending" | "completed";
}

export class PaymentProofAttachmentError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function isAllowedMimeType(value: unknown): value is AllowedMimeType {
  return typeof value === "string" && PAYMENT_PROOF_MIME_TYPES.includes(value as AllowedMimeType);
}

function parseBearerToken(request: Request): string {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new PaymentProofAttachmentError("Sesión no válida.", 401);
  }
  const token = authorization.slice("Bearer ".length).trim();
  if (!token) throw new PaymentProofAttachmentError("Sesión no válida.", 401);
  return token;
}

export async function authenticatePaymentProofRequest(request: Request): Promise<BackendActor> {
  const token = parseBearerToken(request);
  let decodedToken;
  try {
    decodedToken = await getFirebaseAdminAuth().verifyIdToken(token, true);
  } catch {
    throw new PaymentProofAttachmentError("Sesión no válida o vencida.", 401);
  }

  const userDocument = await getFirebaseAdminDb().doc(`users/${decodedToken.uid}`).get();
  const data = userDocument.data();
  if (!userDocument.exists || !data || data.active !== true || !["admin", "agent"].includes(data.role)) {
    throw new PaymentProofAttachmentError("Usuario inactivo o sin autorización.", 403);
  }
  return { uid: decodedToken.uid, role: data.role as UserRole };
}

function validateUploadMetadata(mimeType: unknown, size: unknown): asserts mimeType is AllowedMimeType {
  if (!isAllowedMimeType(mimeType)) {
    throw new PaymentProofAttachmentError("Formato no permitido. Usa JPG, PNG o WEBP.", 400);
  }
  if (!Number.isInteger(size) || Number(size) <= 0 || Number(size) > MAX_PAYMENT_PROOF_FILE_SIZE) {
    throw new PaymentProofAttachmentError("La imagen debe pesar entre 1 byte y 5 MB.", 400);
  }
}

function parseUploadIntent(data: FirebaseFirestore.DocumentData | undefined): UploadIntent {
  if (
    !data ||
    typeof data.saleId !== "string" ||
    typeof data.uploadedBy !== "string" ||
    typeof data.expectedFileName !== "string" ||
    !isAllowedMimeType(data.expectedMimeType) ||
    !Number.isInteger(data.expectedSize) ||
    !["pending", "confirmed", "failed"].includes(data.status) ||
    !(data.expiresAt instanceof Timestamp)
  ) {
    throw new PaymentProofAttachmentError("La sesión de subida no es válida.", 400);
  }
  return {
    saleId: data.saleId,
    uploadedBy: data.uploadedBy,
    expectedFileName: data.expectedFileName,
    expectedMimeType: data.expectedMimeType,
    expectedSize: data.expectedSize,
    status: data.status,
    expiresAt: data.expiresAt,
    ...(typeof data.fileId === "string" ? { fileId: data.fileId } : {}),
    ...(typeof data.previousFileId === "string" ? { previousFileId: data.previousFileId } : {}),
    ...(data.cleanupStatus === "pending" || data.cleanupStatus === "completed"
      ? { cleanupStatus: data.cleanupStatus }
      : {}),
  };
}

function generatedFileName(saleNumber: string, mimeType: AllowedMimeType): string {
  const safeSaleNumber = saleNumber.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 60) || "sin_numero";
  return `venta_${safeSaleNumber}_${Date.now()}.${EXTENSION_BY_MIME[mimeType]}`;
}

async function assertEditableProof(actor: BackendActor, saleId: string) {
  if (actor.role !== "agent") {
    throw new PaymentProofAttachmentError("Solo el agente propietario puede adjuntar comprobantes.", 403);
  }
  const db = getFirebaseAdminDb();
  const [saleDocument, proofDocument] = await Promise.all([
    db.doc(`sales/${saleId}`).get(),
    db.doc(`sale_payment_proofs/${saleId}`).get(),
  ]);
  const sale = saleDocument.data();
  const proof = proofDocument.data();
  if (
    !saleDocument.exists ||
    !sale ||
    sale.status !== "completed" ||
    sale.agentId !== actor.uid ||
    typeof sale.number !== "string"
  ) {
    throw new PaymentProofAttachmentError("La venta no existe, está anulada o no te pertenece.", 403);
  }
  if (!proofDocument.exists || !proof || proof.saleId !== saleId || proof.agentId !== actor.uid) {
    throw new PaymentProofAttachmentError("Primero registra los datos del comprobante.", 409);
  }
  if (proof.status === "verified") {
    throw new PaymentProofAttachmentError("El comprobante verificado es inmutable.", 409);
  }
  return { sale, proof };
}

export async function createPaymentProofUploadSession(
  actor: BackendActor,
  input: { saleId?: unknown; mimeType?: unknown; size?: unknown },
) {
  if (typeof input.saleId !== "string" || !input.saleId.trim()) {
    throw new PaymentProofAttachmentError("Venta inválida.", 400);
  }
  validateUploadMetadata(input.mimeType, input.size);
  const saleId = input.saleId.trim();
  const { sale } = await assertEditableProof(actor, saleId);
  const uploadId = randomUUID();
  const fileName = generatedFileName(String(sale.number), input.mimeType);
  const expiresAt = Timestamp.fromMillis(Date.now() + 15 * 60 * 1000);
  const intentReference = getFirebaseAdminDb().doc(`payment_proof_uploads/${uploadId}`);

  await intentReference.create({
    saleId,
    uploadedBy: actor.uid,
    expectedFileName: fileName,
    expectedMimeType: input.mimeType,
    expectedSize: input.size,
    status: "pending",
    createdAt: FieldValue.serverTimestamp(),
    expiresAt,
  });

  try {
    const sessionUrl = await createDriveResumableSession({
      fileName,
      mimeType: input.mimeType,
      size: Number(input.size),
      saleId,
      uploadId,
      uploadedBy: actor.uid,
    });
    return { uploadId, sessionUrl, fileName, expiresAt: expiresAt.toDate().toISOString() };
  } catch (error) {
    await intentReference.delete().catch(() => undefined);
    throw error;
  }
}

function validateDriveMetadata(file: DriveFileMetadata, intent: UploadIntent, uploadId: string): void {
  if (
    file.trashed === true ||
    file.name !== intent.expectedFileName ||
    file.mimeType !== intent.expectedMimeType ||
    Number(file.size) !== intent.expectedSize ||
    !file.parents?.includes(getDriveFolderId()) ||
    file.appProperties?.uploadId !== uploadId ||
    file.appProperties?.saleId !== intent.saleId ||
    file.appProperties?.uploadedBy !== intent.uploadedBy
  ) {
    throw new PaymentProofAttachmentError("El archivo subido no coincide con la sesión autorizada.", 400);
  }
}

function detectImageMimeType(bytes: Uint8Array): AllowedMimeType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return "image/png";
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) return "image/webp";
  return null;
}

async function verifyDriveFileContent(file: DriveFileMetadata, expectedMimeType: AllowedMimeType): Promise<void> {
  const response = await downloadDriveFile(file.id);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_PAYMENT_PROOF_FILE_SIZE || bytes.length !== Number(file.size)) {
    throw new PaymentProofAttachmentError("El tamaño real del archivo no es válido.", 400);
  }
  if (detectImageMimeType(bytes) !== expectedMimeType) {
    throw new PaymentProofAttachmentError("El contenido real del archivo no coincide con su formato.", 400);
  }
}

export async function confirmPaymentProofUpload(actor: BackendActor, uploadIdValue: unknown): Promise<void> {
  if (typeof uploadIdValue !== "string" || !/^[0-9a-f-]{36}$/.test(uploadIdValue)) {
    throw new PaymentProofAttachmentError("Sesión de subida inválida.", 400);
  }
  const uploadId = uploadIdValue;
  const db = getFirebaseAdminDb();
  const intentReference = db.doc(`payment_proof_uploads/${uploadId}`);
  const initialIntent = parseUploadIntent((await intentReference.get()).data());
  if (initialIntent.uploadedBy !== actor.uid) {
    throw new PaymentProofAttachmentError("No puedes confirmar esta subida.", 403);
  }
  if (initialIntent.status === "confirmed") {
    if (initialIntent.previousFileId && initialIntent.cleanupStatus !== "completed") {
      await deleteDriveFile(initialIntent.previousFileId);
      await intentReference.update({ cleanupStatus: "completed" });
    }
    return;
  }
  if (initialIntent.status === "failed" && initialIntent.fileId && initialIntent.cleanupStatus === "pending") {
    await deleteDriveFile(initialIntent.fileId);
    await intentReference.update({ cleanupStatus: "completed" });
  }
  if (initialIntent.status !== "pending" || initialIntent.expiresAt.toMillis() < Date.now()) {
    throw new PaymentProofAttachmentError("La sesión de subida venció o ya no está disponible.", 410);
  }

  const driveFile = await findDriveFileByUploadId(uploadId);
  if (!driveFile) throw new PaymentProofAttachmentError("Google Drive todavía no confirmó el archivo.", 409);

  try {
    validateDriveMetadata(driveFile, initialIntent, uploadId);
    await verifyDriveFileContent(driveFile, initialIntent.expectedMimeType);
  } catch (error) {
    let cleanupStatus: "pending" | "completed" = "completed";
    try { await deleteDriveFile(driveFile.id); } catch { cleanupStatus = "pending"; }
    await intentReference.update({
      status: "failed",
      failedAt: FieldValue.serverTimestamp(),
      fileId: driveFile.id,
      cleanupStatus,
    });
    throw error;
  }

  let previousFileId: string | undefined;
  try {
    await db.runTransaction(async (transaction) => {
      const userReference = db.doc(`users/${actor.uid}`);
      const saleReference = db.doc(`sales/${initialIntent.saleId}`);
      const proofReference = db.doc(`sale_payment_proofs/${initialIntent.saleId}`);
      const [intentDocument, userDocument, saleDocument, proofDocument] = await Promise.all([
        transaction.get(intentReference),
        transaction.get(userReference),
        transaction.get(saleReference),
        transaction.get(proofReference),
      ]);
      const intent = parseUploadIntent(intentDocument.data());
      const user = userDocument.data();
      const sale = saleDocument.data();
      const proof = proofDocument.data();
      if (
        intent.status !== "pending" ||
        intent.uploadedBy !== actor.uid ||
        intent.expiresAt.toMillis() < Date.now() ||
        !userDocument.exists || user?.active !== true || user.role !== "agent" ||
        !saleDocument.exists || sale?.status !== "completed" || sale.agentId !== actor.uid ||
        !proofDocument.exists || proof?.agentId !== actor.uid || proof.status === "verified"
      ) {
        throw new PaymentProofAttachmentError("El comprobante ya no admite este archivo.", 409);
      }
      previousFileId = typeof proof.attachment?.fileId === "string" ? proof.attachment.fileId : undefined;
      const uploadedAt = Timestamp.now();
      const attachment: PaymentProofAttachment = {
        provider: "google_drive",
        fileId: driveFile.id,
        fileName: driveFile.name,
        mimeType: initialIntent.expectedMimeType,
        size: initialIntent.expectedSize,
        uploadedAt: uploadedAt as PaymentProofAttachment["uploadedAt"],
        uploadedBy: actor.uid,
      };
      transaction.update(proofReference, { attachment, updatedAt: uploadedAt });
      transaction.update(intentReference, {
        status: "confirmed",
        fileId: driveFile.id,
        confirmedAt: uploadedAt,
        ...(previousFileId ? { previousFileId, cleanupStatus: "pending" } : {}),
      });
    });
  } catch (error) {
    await deleteDriveFile(driveFile.id).catch(() => undefined);
    throw error;
  }

  if (previousFileId && previousFileId !== driveFile.id) {
    try {
      await deleteDriveFile(previousFileId);
      await intentReference.update({ cleanupStatus: "completed" });
    } catch {
      await intentReference.update({
        cleanupStatus: "pending",
        previousFileId,
      });
    }
  }
}

export async function getAuthorizedAttachment(actor: BackendActor, saleId: string) {
  const db = getFirebaseAdminDb();
  const [saleDocument, proofDocument] = await Promise.all([
    db.doc(`sales/${saleId}`).get(),
    db.doc(`sale_payment_proofs/${saleId}`).get(),
  ]);
  const sale = saleDocument.data();
  const proof = proofDocument.data();
  if (!saleDocument.exists || !sale || !proofDocument.exists || !proof) {
    throw new PaymentProofAttachmentError("Comprobante no encontrado.", 404);
  }
  if (actor.role === "agent" && sale.agentId !== actor.uid) {
    throw new PaymentProofAttachmentError("No puedes ver comprobantes de otras ventas.", 403);
  }
  const attachment = proof.attachment as PaymentProofAttachment | undefined;
  if (!attachment || attachment.provider !== "google_drive") {
    throw new PaymentProofAttachmentError("El comprobante no tiene una imagen adjunta.", 404);
  }
  const file = await getDriveFileMetadata(attachment.fileId);
  if (
    file.trashed === true ||
    file.name !== attachment.fileName ||
    file.mimeType !== attachment.mimeType ||
    Number(file.size) !== attachment.size ||
    !file.parents?.includes(getDriveFolderId()) ||
    file.appProperties?.saleId !== saleId ||
    file.appProperties?.uploadedBy !== attachment.uploadedBy
  ) {
    throw new PaymentProofAttachmentError("El archivo almacenado no superó la validación de seguridad.", 409);
  }
  return { attachment, response: await downloadDriveFile(file.id) };
}
