"use client";

import { useMemo, useState, type FormEvent } from "react";

import type {
  InventoryAdjustmentDirection,
  InventoryViewRow,
} from "../types/inventory.types";

interface InventoryOperationDialogProps {
  mode: "initial" | "adjust";
  onClose: () => void;
  onSubmit: (data: {
    direction: InventoryAdjustmentDirection;
    quantity: number;
    reason: string;
  }) => Promise<void>;
  row: InventoryViewRow;
}

export function InventoryOperationDialog({
  mode,
  onClose,
  onSubmit,
  row,
}: InventoryOperationDialogProps) {
  const [direction, setDirection] =
    useState<InventoryAdjustmentDirection>("in");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<{
    quantity?: string;
    reason?: string;
    submit?: string;
  }>({});
  const [submitting, setSubmitting] = useState(false);
  const currentQuantity = row.inventory?.quantity ?? 0;
  const numericQuantity = Number(quantity);
  const resultingQuantity = useMemo(() => {
    if (!Number.isFinite(numericQuantity)) return currentQuantity;
    if (mode === "initial") return numericQuantity;
    return direction === "in"
      ? currentQuantity + numericQuantity
      : currentQuantity - numericQuantity;
  }, [currentQuantity, direction, mode, numericQuantity]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: typeof errors = {};
    if (!quantity || !Number.isInteger(numericQuantity) || numericQuantity <= 0) {
      nextErrors.quantity = "Ingresa un número entero mayor que cero.";
    }
    if (!reason.trim()) {
      nextErrors.reason = "Ingresa un motivo para la operación.";
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setSubmitting(true);
    setErrors({});
    try {
      await onSubmit({
        direction,
        quantity: numericQuantity,
        reason: reason.trim(),
      });
    } catch (error) {
      setErrors({
        submit:
          error instanceof Error
            ? error.message
            : "No se pudo completar la operación.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <section aria-labelledby="inventory-operation-title" aria-modal="true" className="max-h-[94vh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl" role="dialog">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white/95 px-5 py-5 backdrop-blur sm:px-7">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Control de existencias</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950" id="inventory-operation-title">
              {mode === "initial" ? "Registrar stock inicial" : "Ajustar inventario"}
            </h2>
          </div>
          <button aria-label="Cerrar formulario" className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-2xl text-slate-600 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600" onClick={onClose} type="button"><span aria-hidden="true">×</span></button>
        </div>

        <form className="space-y-5 px-5 py-6 sm:px-7" noValidate onSubmit={handleSubmit}>
          <div className="grid gap-4 rounded-2xl bg-slate-50 p-4 sm:grid-cols-2">
            <div><p className="text-xs text-slate-500">Producto</p><p className="mt-1 font-semibold text-slate-950">{row.product.name}</p><p className="font-mono text-xs text-slate-500">{row.product.sku}</p></div>
            <div><p className="text-xs text-slate-500">Propietario</p><p className="mt-1 font-semibold text-slate-950">{row.ownerLabel}</p></div>
          </div>

          {mode === "adjust" ? (
            <div>
              <label className="text-sm font-semibold text-slate-800" htmlFor="adjustment-direction">Tipo de ajuste</label>
              <select className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" id="adjustment-direction" onChange={(event) => setDirection(event.target.value as InventoryAdjustmentDirection)} value={direction}>
                <option value="in">Entrada</option>
                <option value="out">Salida</option>
              </select>
            </div>
          ) : null}

          <div>
            <label className="text-sm font-semibold text-slate-800" htmlFor="inventory-quantity">Cantidad <span className="text-red-600">*</span></label>
            <input aria-describedby={errors.quantity ? "inventory-quantity-error" : undefined} aria-invalid={Boolean(errors.quantity)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" id="inventory-quantity" min="1" onChange={(event) => { setQuantity(event.target.value); setErrors((current) => ({ ...current, quantity: undefined, submit: undefined })); }} step="1" type="number" value={quantity} />
            {errors.quantity ? <p className="mt-1.5 text-xs font-medium text-red-700" id="inventory-quantity-error">{errors.quantity}</p> : null}
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-800" htmlFor="inventory-reason">Motivo <span className="text-red-600">*</span></label>
            <textarea aria-describedby={errors.reason ? "inventory-reason-error" : undefined} aria-invalid={Boolean(errors.reason)} className="mt-2 min-h-24 w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" id="inventory-reason" onChange={(event) => { setReason(event.target.value); setErrors((current) => ({ ...current, reason: undefined, submit: undefined })); }} placeholder="Ej. Corrección de conteo" value={reason} />
            {errors.reason ? <p className="mt-1.5 text-xs font-medium text-red-700" id="inventory-reason-error">{errors.reason}</p> : null}
          </div>

          <dl className="grid grid-cols-2 gap-4 rounded-2xl border border-slate-200 p-4 text-sm">
            <div><dt className="text-slate-500">Stock actual</dt><dd className="mt-1 text-lg font-bold text-slate-950">{currentQuantity}</dd></div>
            <div><dt className="text-slate-500">Stock resultante</dt><dd className={resultingQuantity < 0 ? "mt-1 text-lg font-bold text-red-700" : "mt-1 text-lg font-bold text-emerald-700"}>{Number.isFinite(resultingQuantity) ? resultingQuantity : "—"}</dd></div>
          </dl>

          {errors.submit ? <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{errors.submit}</p> : null}

          <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
            <button className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:opacity-60" disabled={submitting} onClick={onClose} type="button">Cancelar</button>
            <button className="rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:opacity-60" disabled={submitting} type="submit">{submitting ? "Guardando..." : mode === "initial" ? "Registrar stock inicial" : "Aplicar ajuste"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}
