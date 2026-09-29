"use client";

import { getFirebaseAuth } from "@/lib/firebase";

export const MAX_PAYMENT_PROOF_FILE_SIZE = 5 * 1024 * 1024;
export const PAYMENT_PROOF_ACCEPT = "image/jpeg,image/png,image/webp";
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

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

export async function uploadPaymentProofAttachment(
  saleId: string,
  file: File,
  onProgress: (percentage: number) => void,
): Promise<void> {
  const validationError = validatePaymentProofFile(file);
  if (validationError) throw new Error(validationError);
  const headers = await authenticatedHeaders();
  const sessionResponse = await fetch("/api/payment-proofs/upload-session", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ saleId, mimeType: file.type, size: file.size }),
  });
  if (!sessionResponse.ok) throw await apiError(sessionResponse, "No se pudo iniciar la subida.");
  const session = await sessionResponse.json() as UploadSessionResponse;
  if (!session.uploadId || !session.sessionUrl) throw new Error("La sesión de subida no es válida.");

  await uploadToDriveSession(session.sessionUrl, file, onProgress);

  const confirmResponse = await fetch("/api/payment-proofs/confirm-upload", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ uploadId: session.uploadId }),
  });
  if (!confirmResponse.ok) throw await apiError(confirmResponse, "No se pudo confirmar el archivo.");
  onProgress(100);
}

export async function fetchPaymentProofAttachment(saleId: string): Promise<Blob> {
  const response = await fetch(`/api/payment-proofs/${encodeURIComponent(saleId)}/attachment`, {
    headers: await authenticatedHeaders(),
    cache: "no-store",
  });
  if (!response.ok) throw await apiError(response, "No se pudo abrir el comprobante.");
  return response.blob();
}
