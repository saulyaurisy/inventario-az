"use client";

/* eslint-disable @next/next/no-img-element -- authenticated blob URLs cannot use next/image */

import { useEffect, useState } from "react";

import { fetchPaymentProofAttachment } from "../services/payment-proof-attachment.service";
import type { PaymentProofAttachment } from "../types/payment-proof.types";

function formatFileSize(size: number): string {
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

export function PaymentProofAttachmentViewer({
  attachment,
  saleId,
}: {
  attachment: PaymentProofAttachment;
  saleId: string;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }, [objectUrl]);

  async function open() {
    setLoading(true);
    setError(null);
    try {
      const nextUrl = URL.createObjectURL(await fetchPaymentProofAttachment(saleId));
      setObjectUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return nextUrl;
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo abrir el comprobante.");
    } finally {
      setLoading(false);
    }
  }

  function close() {
    setObjectUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
  }

  return <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-900">{attachment.fileName}</p>
        <p className="mt-1 text-xs text-slate-500">{formatFileSize(attachment.size)} · Imagen privada en Google Drive</p>
      </div>
      <button className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" disabled={loading} onClick={() => void open()} type="button">{loading ? "Abriendo..." : "Ver comprobante"}</button>
    </div>
    {error ? <p className="mt-2 text-sm text-red-700" role="alert">{error}</p> : null}
    {objectUrl ? <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/80 p-4"><section aria-label="Vista previa del comprobante" aria-modal="true" className="flex max-h-[95vh] w-full max-w-4xl flex-col rounded-2xl bg-white p-4" role="dialog"><div className="mb-3 flex items-center justify-between gap-3"><p className="truncate text-sm font-semibold">{attachment.fileName}</p><button aria-label="Cerrar vista previa" className="size-10 rounded-xl border text-2xl" onClick={close} type="button">×</button></div><img alt="Comprobante de pago" className="min-h-0 flex-1 object-contain" src={objectUrl} /></section></div> : null}
  </div>;
}
