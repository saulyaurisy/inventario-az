import {
  authenticatePaymentProofRequest,
  getAuthorizedAttachment,
  PaymentProofAttachmentError,
} from "@/features/payment-proofs/server/payment-proof-attachments.server";

export async function GET(request: Request, context: { params: Promise<{ saleId: string }> }) {
  try {
    const actor = await authenticatePaymentProofRequest(request);
    const { saleId } = await context.params;
    const { attachment, response } = await getAuthorizedAttachment(actor, saleId);
    return new Response(response.body, {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Type": attachment.mimeType,
        "Content-Length": String(attachment.size),
        "Content-Disposition": `inline; filename="${attachment.fileName.replace(/["\\]/g, "_")}"`,
        "X-Content-Type-Options": "nosniff",
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
