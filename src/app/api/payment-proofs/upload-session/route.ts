import { NextResponse } from "next/server";

import {
  authenticatePaymentProofRequest,
  createPaymentProofUploadSession,
  PaymentProofAttachmentError,
} from "@/features/payment-proofs/server/payment-proof-attachments.server";

export async function POST(request: Request) {
  try {
    const actor = await authenticatePaymentProofRequest(request);
    const input = await request.json() as { saleId?: unknown; mimeType?: unknown; size?: unknown };
    return NextResponse.json(await createPaymentProofUploadSession(actor, input));
  } catch (error) {
    if (error instanceof PaymentProofAttachmentError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Payment proof upload session failed", error);
    return NextResponse.json({ error: "No se pudo iniciar la subida." }, { status: 500 });
  }
}
