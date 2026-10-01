import { createHash } from "node:crypto";

import {
  authenticatePaymentProofRequest,
  getAuthorizedAttachmentInfo,
  openAuthorizedAttachment,
  PaymentProofAttachmentError,
} from "@/features/payment-proofs/server/payment-proof-attachments.server";

export async function GET(request: Request, context: { params: Promise<{ saleId: string }> }) {
  try {
    const actor = await authenticatePaymentProofRequest(request);
    const { saleId } = await context.params;
    const { attachment, status } = await getAuthorizedAttachmentInfo(actor, saleId);
    const version = `${saleId}:${attachment.fileId}:${attachment.size}:${attachment.uploadedAt.toMillis()}`;
    const etag = `"${createHash("sha256").update(version).digest("base64url")}"`;
    const cacheControl = status === "verified"
      ? "private, max-age=86400, immutable"
      : "private, max-age=60, must-revalidate";
    const sharedHeaders = {
      "Cache-Control": cacheControl,
      ETag: etag,
      Vary: "Authorization",
      "X-Content-Type-Options": "nosniff",
    };
    if (request.headers.get("if-none-match") === etag) {
      return new Response(null, { status: 304, headers: sharedHeaders });
    }
    const response = await openAuthorizedAttachment(saleId, attachment);
    return new Response(response.body, {
      status: 200,
      headers: {
        ...sharedHeaders,
        "Content-Type": attachment.mimeType,
        "Content-Length": String(attachment.size),
        "Content-Disposition": `inline; filename="${attachment.fileName.replace(/["\\]/g, "_")}"`,
      },
    });
  } catch (error) {
    if (error instanceof PaymentProofAttachmentError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("Payment proof attachment download failed", error);
    return Response.json({ error: "No se pudo abrir el comprobante." }, { status: 500 });
  }
}
