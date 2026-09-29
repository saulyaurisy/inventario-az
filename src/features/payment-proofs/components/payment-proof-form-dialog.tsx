"use client";

import { useEffect, useState } from "react";

import {
  PAYMENT_PROOF_ACCEPT,
  validatePaymentProofFile,
} from "../services/payment-proof-attachment.service";
import type {
  PaymentProofInput,
  PaymentProofType,
  SalePaymentProof,
} from "../types/payment-proof.types";
import {
  isSafeExternalUrl,
  PAYMENT_PROOF_TYPE_LABELS,
} from "../utils/payment-proof-utils";

interface PaymentProofFormDialogProps {
  initial: SalePaymentProof | null;
  onClose: () => void;
  onSubmit: (
    input: PaymentProofInput,
    file: File | null,
    onProgress: (percentage: number) => void,
  ) => Promise<void>;
}

function formatFileSize(size: number): string {
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

export function PaymentProofFormDialog({ initial, onClose, onSubmit }: PaymentProofFormDialogProps) {
  const [type, setType] = useState<PaymentProofType>(initial?.type ?? "operation_reference");
  const [operationReference, setOperationReference] = useState(initial?.operationReference ?? "");
  const [externalUrl, setExternalUrl] = useState(initial?.externalUrl ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  function selectFile(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    event.target.value = "";
    setError(null);
    if (!selected) return;
    const validationError = validatePaymentProofFile(selected);
    if (validationError) {
      setFile(null);
      setPreviewUrl(null);
      setError(validationError);
      return;
    }
    setFile(selected);
    setPreviewUrl(URL.createObjectURL(selected));
  }

  function removeFile() {
    setFile(null);
    setPreviewUrl(null);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (externalUrl && !isSafeExternalUrl(externalUrl.trim())) {
      setError("La URL debe usar HTTPS y no incluir credenciales.");
      return;
    }
    if (file) {
      const validationError = validatePaymentProofFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }
    }
    setSaving(true);
    setProgress(file ? 0 : null);
    try {
      await onSubmit({
        type,
        ...(operationReference.trim() ? { operationReference } : {}),
        ...(externalUrl.trim() ? { externalUrl } : {}),
        ...(notes.trim() ? { notes } : {}),
      }, file, setProgress);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar.");
      setSaving(false);
      setProgress(null);
    }
  }

  return <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/60 sm:items-center sm:p-6">
    <section aria-labelledby="proof-form-title" aria-modal="true" className="max-h-[95vh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl" role="dialog">
      <div className="sticky top-0 z-10 flex items-start justify-between border-b bg-white p-5 sm:px-7">
        <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Evidencia de pago</p><h2 className="mt-1 text-2xl font-bold" id="proof-form-title">{initial ? "Corregir comprobante" : "Registrar comprobante"}</h2></div>
        <button aria-label="Cerrar" className="size-10 rounded-xl border text-2xl" disabled={saving} onClick={onClose} type="button">×</button>
      </div>
      <form className="space-y-5 p-5 sm:p-7" onSubmit={submit}>
        <div><label className="text-sm font-semibold" htmlFor="proof-type">Tipo</label><select className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm" id="proof-type" onChange={(event) => setType(event.target.value as PaymentProofType)} value={type}>{Object.entries(PAYMENT_PROOF_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        <div><label className="text-sm font-semibold" htmlFor="proof-reference">Referencia de operación</label><input className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm" id="proof-reference" maxLength={100} onChange={(event) => setOperationReference(event.target.value)} required={type === "operation_reference"} value={operationReference} /></div>
        <div><label className="text-sm font-semibold" htmlFor="proof-url">URL externa HTTPS</label><input className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm" id="proof-url" maxLength={500} onChange={(event) => setExternalUrl(event.target.value)} placeholder="https://..." required={type === "external_link"} type="url" value={externalUrl} /><p className="mt-1 text-xs text-slate-500">Solo se guarda la referencia. El sistema no descarga ni incrusta su contenido.</p></div>
        <div><label className="text-sm font-semibold" htmlFor="proof-notes">Notas</label><textarea className="mt-2 min-h-28 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm" id="proof-notes" maxLength={500} onChange={(event) => setNotes(event.target.value)} required={type === "manual_note"} value={notes} /></div>

        <div className="rounded-2xl border border-slate-200 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="text-sm font-semibold text-slate-900">Foto del comprobante</p><p className="mt-1 text-xs text-slate-500">JPG, PNG o WEBP · máximo 5 MB</p></div>
            <label className="cursor-pointer rounded-xl border border-emerald-300 px-4 py-2.5 text-center text-sm font-semibold text-emerald-800">
              Seleccionar comprobante
              <input accept={PAYMENT_PROOF_ACCEPT} className="sr-only" disabled={saving} onChange={selectFile} type="file" />
            </label>
          </div>
          {file ? <div className="mt-4 space-y-3 rounded-xl bg-slate-50 p-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
            {previewUrl ? <img alt="Previsualización del comprobante seleccionado" className="max-h-64 w-full rounded-lg object-contain" src={previewUrl} /> : null}
            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{file.name}</p><p className="text-xs text-slate-500">{formatFileSize(file.size)}</p></div><button className="text-sm font-semibold text-red-700" disabled={saving} onClick={removeFile} type="button">Quitar</button></div>
          </div> : initial?.attachment ? <p className="mt-4 text-xs text-slate-600">Se conservará el archivo actual: <strong>{initial.attachment.fileName}</strong>. Selecciona otra imagen solo si deseas reemplazarlo.</p> : null}
          {progress !== null ? <div className="mt-4"><div className="mb-1 flex justify-between text-xs font-semibold text-slate-600"><span>Subiendo...</span><span>{progress}%</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-emerald-600 transition-all" style={{ width: `${progress}%` }} /></div></div> : null}
        </div>

        {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p> : null}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button className="rounded-xl border px-5 py-3 text-sm font-semibold" disabled={saving} onClick={onClose} type="button">Cancelar</button><button className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60" disabled={saving} type="submit">{saving ? (file ? "Subiendo..." : "Guardando...") : "Guardar comprobante"}</button></div>
      </form>
    </section>
  </div>;
}
