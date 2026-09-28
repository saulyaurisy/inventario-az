"use client";

import type { InventoryMovement, InventoryViewRow } from "../types/inventory.types";

const MOVEMENT_LABELS: Record<InventoryMovement["type"], string> = {
  initial: "Stock inicial",
  adjustment_in: "Entrada",
  adjustment_out: "Salida",
  replenishment_out: "Salida por reposición",
  replenishment_in: "Entrada por reposición",
  sale: "Venta",
  purchase_in: "Entrada por compra",
};

interface InventoryMovementsDialogProps {
  actorLabels: Record<string, string>;
  error: string | null;
  loading: boolean;
  movements: InventoryMovement[];
  onClose: () => void;
  row: InventoryViewRow;
}

export function InventoryMovementsDialog({ actorLabels, error, loading, movements, onClose, row }: InventoryMovementsDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <section aria-labelledby="inventory-movements-title" aria-modal="true" className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl" role="dialog">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white/95 px-5 py-5 backdrop-blur sm:px-7">
          <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Trazabilidad básica</p><h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950" id="inventory-movements-title">Movimientos recientes</h2><p className="mt-1 text-sm text-slate-500">{row.product.sku} · {row.ownerLabel}</p></div>
          <button aria-label="Cerrar movimientos" className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-2xl text-slate-600 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600" onClick={onClose} type="button"><span aria-hidden="true">×</span></button>
        </div>
        <div className="p-5 sm:p-7">
          {loading ? <p className="py-10 text-center text-sm text-slate-600">Cargando movimientos...</p> : error ? <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">{error}</p> : movements.length === 0 ? <p className="py-10 text-center text-sm text-slate-600">No hay movimientos registrados.</p> : (
            <div className="space-y-3">
              {movements.map((movement) => (
                <article className="rounded-2xl border border-slate-200 p-4" key={movement.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold text-slate-950">{MOVEMENT_LABELS[movement.type]}</h3><p className="mt-1 text-xs text-slate-500">{new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeStyle: "short" }).format(movement.createdAt.toDate())}</p></div><span className={movement.type === "adjustment_out" || movement.type === "replenishment_out" || movement.type === "sale" ? "rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800" : "rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800"}>{movement.type === "adjustment_out" || movement.type === "replenishment_out" || movement.type === "sale" ? "−" : "+"}{movement.quantity}</span></div>
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4"><div><dt className="text-xs text-slate-500">Anterior</dt><dd className="font-semibold text-slate-900">{movement.quantityBefore}</dd></div><div><dt className="text-xs text-slate-500">Posterior</dt><dd className="font-semibold text-slate-900">{movement.quantityAfter}</dd></div><div className="col-span-2"><dt className="text-xs text-slate-500">Registrado por</dt><dd className="font-semibold text-slate-900">{actorLabels[movement.createdBy] ?? movement.createdBy}</dd></div></dl>
                  <p className="mt-3 text-sm text-slate-700"><span className="font-semibold">Motivo:</span> {movement.reason}</p>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
