"use client";

import { getFirebaseAuth } from "@/lib/firebase";

import type { PaymentProofAttachment } from "../types/payment-proof.types";

export const MAX_PAYMENT_PROOF_FILE_SIZE = 5 * 1024 * 1024;
export const PAYMENT_PROOF_ACCEPT = "image/jpeg,image/png,image/webp";
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_LONG_SIDE = 1800;
const IMAGE_QUALITY = 0.84;
const SMALL_IMAGE_THRESHOLD = 1024 * 1024;
const MAX_CACHED_ATTACHMENTS = 6;

export type PaymentProofUploadStage = "preparing" | "uploading" | "confirming" | "complete";

export interface PaymentProofUploadProgress {
  percentage: number;
  stage: PaymentProofUploadStage;
}

export interface OptimizedPaymentProofFile {
  file: File;
  originalSize: number;
  optimizedSize: number;
  optimized: boolean;
}

const attachmentBlobCache = new Map<string, Blob>();
const attachmentRequestCache = new Map<string, Promise<Blob>>();

interface UploadSessionResponse {
  uploadId: string;
  sessionUrl: string;
}

async function authenticatedHeaders(): Promise<Record<string, string>> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error("Tu sesión venció. Vuelve a iniciar sesión.");
  return { Authorization: `Bearer ${await user.getIdToken()}` };
}

async function apiError(response: Response, fallback: string): Promise<Error> {
  const body = await response.json().catch(() => null) as { error?: string } | null;
  return new Error(body?.error ?? fallback);
}

export function validatePaymentProofFile(file: File): string | null {
  if (file.size <= 0) return "El archivo está vacío.";
  if (file.size > MAX_PAYMENT_PROOF_FILE_SIZE) return "La imagen no puede superar 5 MB.";
  if (!ALLOWED_MIME_TYPES.has(file.type)) return "Selecciona una imagen JPG, PNG o WEBP.";
  return null;
}

function uploadToDriveSession(
  sessionUrl: string,
  file: File,
  onProgress: (percentage: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", sessionUrl);
    request.setRequestHeader("Content-Type", file.type);
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    });
    request.addEventListener("load", () => {
      if (request.status === 200 || request.status === 201) {
        resolve();
      } else {
        reject(new Error("Google Drive rechazó la subida. Intenta nuevamente."));
      }
    });
    // Drive accepts the bytes but omits CORS headers from the final resumable-upload
    // response. A status-0 network event is therefore indeterminate; the backend
    // confirmation below remains authoritative and rejects missing uploads safely.
    request.addEventListener("error", () => resolve());
    request.addEventListener("abort", () => reject(new Error("La subida fue cancelada.")));
    request.send(file);
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, mimeType, IMAGE_QUALITY));
}

export async function optimizePaymentProofFile(file: File): Promise<OptimizedPaymentProofFile> {
  const fallback = {
    file,
    originalSize: file.size,
    optimizedSize: file.size,
    optimized: false,
  };
  if (typeof createImageBitmap !== "function") return fallback;

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    const longSide = Math.max(bitmap.width, bitmap.height);
    if (longSide <= MAX_IMAGE_LONG_SIDE && file.size <= SMALL_IMAGE_THRESHOLD) return fallback;

    const scale = Math.min(1, MAX_IMAGE_LONG_SIDE / longSide);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d", { alpha: file.type === "image/png" });
    if (!context) return fallback;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await canvasToBlob(canvas, file.type);
    if (!blob || blob.size >= file.size) return fallback;

    const optimizedFile = new File([blob], file.name, {
      type: file.type,
      lastModified: file.lastModified,
    });
    return {
      file: optimizedFile,
      originalSize: file.size,
      optimizedSize: optimizedFile.size,
      optimized: true,
    };
  } catch {
    return fallback;
  } finally {
    bitmap?.close();
  }
}

export async function uploadPaymentProofAttachment(
  saleId: string,
  file: File,
  onProgress: (progress: PaymentProofUploadProgress) => void,
): Promise<void> {
  const validationError = validatePaymentProofFile(file);
  if (validationError) throw new Error(validationError);
  onProgress({ stage: "preparing", percentage: 5 });
  const headers = await authenticatedHeaders();
  const sessionResponse = await fetch("/api/payment-proofs/upload-session", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ saleId, mimeType: file.type, size: file.size }),
  });
  if (!sessionResponse.ok) throw await apiError(sessionResponse, "No se pudo iniciar la subida.");
  const session = await sessionResponse.json() as UploadSessionResponse;
  if (!session.uploadId || !session.sessionUrl) throw new Error("La sesión de subida no es válida.");

  onProgress({ stage: "uploading", percentage: 10 });
  await uploadToDriveSession(session.sessionUrl, file, (percentage) => {
    onProgress({ stage: "uploading", percentage: 10 + Math.round(percentage * 0.8) });
  });

  onProgress({ stage: "confirming", percentage: 92 });
  const confirmResponse = await fetch("/api/payment-proofs/confirm-upload", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ uploadId: session.uploadId }),
  });
  if (!confirmResponse.ok) throw await apiError(confirmResponse, "No se pudo confirmar el archivo.");
  onProgress({ stage: "complete", percentage: 100 });
}

function attachmentCacheKey(userId: string, saleId: string, attachment: PaymentProofAttachment): string {
  return `${userId}:${saleId}:${attachment.fileId}:${attachment.size}:${attachment.uploadedAt.toMillis()}`;
}

function cacheAttachment(key: string, blob: Blob): Blob {
  attachmentBlobCache.set(key, blob);
  while (attachmentBlobCache.size > MAX_CACHED_ATTACHMENTS) {
    const oldestKey = attachmentBlobCache.keys().next().value;
    if (typeof oldestKey !== "string") break;
    attachmentBlobCache.delete(oldestKey);
  }
  return blob;
}

export async function fetchPaymentProofAttachment(
  saleId: string,
  attachment: PaymentProofAttachment,
): Promise<Blob> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error("Tu sesión venció. Vuelve a iniciar sesión.");
  const key = attachmentCacheKey(user.uid, saleId, attachment);
  const cached = attachmentBlobCache.get(key);
  if (cached) return cached;
  const pending = attachmentRequestCache.get(key);
  if (pending) return pending;

  for (const cachedKey of attachmentBlobCache.keys()) {
    if (cachedKey.startsWith(`${user.uid}:${saleId}:`) && cachedKey !== key) {
      attachmentBlobCache.delete(cachedKey);
    }
  }

  const request = (async () => {
    const version = `${attachment.uploadedAt.toMillis()}-${attachment.size}`;
    const response = await fetch(
      `/api/payment-proofs/${encodeURIComponent(saleId)}/attachment?v=${encodeURIComponent(version)}`,
      { headers: await authenticatedHeaders(), cache: "default" },
    );
    if (!response.ok) throw await apiError(response, "No se pudo abrir el comprobante.");
    return cacheAttachment(key, await response.blob());
  })();
  attachmentRequestCache.set(key, request);
  try {
    return await request;
  } finally {
    attachmentRequestCache.delete(key);
  }
}
