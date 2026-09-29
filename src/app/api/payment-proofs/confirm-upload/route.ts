import { NextResponse } from "next/server";

import {
  authenticatePaymentProofRequest,
  confirmPaymentProofUpload,
  PaymentProofAttachmentError,
} from "@/features/payment-proofs/server/payment-proof-attachments.server";

export async function POST(request: Request) {
  try {
    const actor = await authenticatePaymentProofRequest(request);
    const input = await request.json() as { uploadId?: unknown };
    await confirmPaymentProofUpload(actor, input.uploadId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof PaymentProofAttachmentError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Payment proof upload confirmation failed", error);
    return NextResponse.json({ error: "No se pudo confirmar la subida." }, { status: 500 });
  }
}
