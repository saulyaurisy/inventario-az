"use client";

import type { InventoryStockStatus, InventoryViewRow } from "../types/inventory.types";
import { STOCK_STATUS_LABELS } from "../utils/inventory-utils";

const STATUS_CLASSES: Record<InventoryStockStatus, string> = {
  uninitialized: "bg-slate-200 text-slate-700",
  out: "bg-red-100 text-red-800",
  low: "bg-amber-100 text-amber-800",
  available: "bg-emerald-100 text-emerald-800",
};

interface InventoryDetailDialogProps {
  onClose: () => void;
  onViewMovements: () => void;
  row: InventoryViewRow;
}

export function InventoryDetailDialog({
  onClose,
  onViewMovements,
  row,
}: InventoryDetailDialogProps) {
  const updatedAt = row.inventory
    ? new Intl.DateTimeFormat("es-PE", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(row.inventory.updatedAt.toDate())
    : "Sin inventario inicializado";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <section
        aria-labelledby="inventory-detail-title"
        aria-modal="true"
        className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
        role="dialog"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white/95 px-5 py-5 backdrop-blur sm:px-7">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
              Detalle de existencias
            </p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950" id="inventory-detail-title">
              {row.product.name}
            </h2>
            <p className="mt-1 font-mono text-xs text-slate-500">{row.product.sku}</p>
          </div>
          <button
            aria-label="Cerrar detalle"
            className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-2xl text-slate-600 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
            onClick={onClose}
            type="button"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <div className="space-y-5 p-5 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div>
              <p className="text-xs font-medium text-slate-500">Propietario</p>
              <p className="mt-1 font-semibold text-slate-950">{row.ownerLabel}</p>
            </div>
            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_CLASSES[row.status]}`}>
              {STOCK_STATUS_LABELS[row.status]}
            </span>
          </div>

          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 p-3">
              <dt className="text-xs text-slate-500">Stock inicial</dt>
              <dd className="mt-1 font-bold text-slate-950">{row.inventory ? row.movementSummary.initialStock : "—"}</dd>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
              <dt className="text-xs text-emerald-700">Entradas</dt>
              <dd className="mt-1 font-bold text-emerald-800">{row.inventory ? row.movementSummary.entries : "—"}</dd>
            </div>
            <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3">
              <dt className="text-xs text-blue-700">Vendido</dt>
              <dd className="mt-1 font-bold text-blue-800">{row.inventory ? row.movementSummary.sold : "—"}</dd>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
              <dt className="text-xs text-amber-700">Otras salidas</dt>
              <dd className="mt-1 font-bold text-amber-800">{row.inventory ? row.movementSummary.otherExits : "—"}</dd>
            </div>
            <div className="rounded-xl border border-slate-300 bg-slate-950 p-3 text-white">
              <dt className="text-xs text-slate-300">Stock actual</dt>
              <dd className="mt-1 text-xl font-bold">{row.inventory?.quantity ?? "—"}</dd>
            </div>
            <div className="rounded-xl border border-slate-200 p-3">
              <dt className="text-xs text-slate-500">Stock mínimo</dt>
              <dd className="mt-1 font-bold text-slate-950">{row.product.minimumStock}</dd>
            </div>
          </dl>

          <div className="rounded-xl border border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-500">Última actualización</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{updatedAt}</p>
          </div>

          {row.inventory ? (
            <div className={row.movementSummary.consistent
              ? "rounded-xl border border-emerald-200 bg-emerald-50 p-4"
              : "rounded-xl border border-red-200 bg-red-50 p-4"}
            >
              <p className={row.movementSummary.consistent ? "text-sm font-semibold text-emerald-900" : "text-sm font-semibold text-red-900"}>
                {row.movementSummary.consistent ? "Histórico consistente" : "Histórico inconsistente"}
              </p>
              <p className={row.movementSummary.consistent ? "mt-1 text-xs text-emerald-800" : "mt-1 text-xs text-red-800"}>
                Stock esperado según movimientos: {row.movementSummary.expectedStock}. El stock actual sigue tomando el valor de inventario.
              </p>
            </div>
          ) : null}

          <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-5">
            {row.inventory ? (
              <button
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                onClick={onViewMovements}
                type="button"
              >
                Ver movimientos
              </button>
            ) : null}
            <button
              className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
              onClick={onClose}
              type="button"
            >
              Cerrar
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
