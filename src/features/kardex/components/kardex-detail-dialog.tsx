"use client";

import type { KardexRow } from "../types/kardex.types";
import { formatKardexDate } from "../utils/kardex-utils";

interface KardexDetailDialogProps {
  onClose: () => void;
  row: KardexRow;
}

function DetailItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm font-semibold text-slate-950">
        {value}
      </dd>
    </div>
  );
}

export function KardexDetailDialog({ onClose, row }: KardexDetailDialogProps) {
  const { movement } = row;
  const signedQuantity = `${row.direction === "out" ? "−" : row.direction === "in" ? "+" : ""}${movement.quantity}`;
  const quantityTone =
    row.direction === "out"
      ? "text-amber-700"
      : row.direction === "in"
        ? "text-emerald-700"
        : "text-slate-700";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <section
        aria-labelledby="kardex-detail-title"
        aria-modal="true"
        className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
        role="dialog"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white/95 px-5 py-5 backdrop-blur sm:px-7">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
              Movimiento inmutable
            </p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950" id="kardex-detail-title">
              Detalle del movimiento
            </h2>
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

        <div className="space-y-6 px-5 py-6 sm:px-7">
          <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl bg-slate-50 p-4">
            <div>
              <p className="font-bold text-slate-950">{row.productName}</p>
              <p className="mt-1 font-mono text-xs text-slate-500">{row.sku}</p>
            </div>
            <span className={row.direction === "out" ? "rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800" : "rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800"}>
              {row.typeLabel}
            </span>
          </div>

          <dl className="grid gap-5 sm:grid-cols-2">
            <DetailItem label="Fecha y hora" value={formatKardexDate(movement.createdAt.toDate())} />
            <DetailItem label="Producto" value={row.productName} />
            <DetailItem label="SKU" value={<span className="font-mono">{row.sku}</span>} />
            <DetailItem label="Propietario" value={row.ownerLabel} />
            <DetailItem label="Movimiento" value={row.typeLabel} />
            <DetailItem label="Cantidad" value={<span className={quantityTone}>{signedQuantity}</span>} />
            <DetailItem label="Stock anterior" value={movement.quantityBefore} />
            <DetailItem label="Stock posterior" value={movement.quantityAfter} />
            <DetailItem label="Usuario" value={row.createdByLabel} />
            <DetailItem label="Referencia relacionada" value={row.referenceLabel} />
            <DetailItem label="ID exacto de referencia" value={movement.referenceId ?? "Sin referencia"} />
            <div className="sm:col-span-2">
              <DetailItem label="Motivo" value={movement.reason} />
            </div>
          </dl>

          <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">
            Este registro es de solo lectura y no puede editarse ni eliminarse desde el Kardex.
          </p>
        </div>
      </section>
    </div>
  );
}
