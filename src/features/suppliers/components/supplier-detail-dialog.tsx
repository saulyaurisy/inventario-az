"use client";

import type { Supplier } from "../types/supplier.types";

export function SupplierDetailDialog({ supplier, onClose }: { supplier: Supplier; onClose: () => void }) {
  const fields = [["Estado", supplier.active ? "Activo" : "Inactivo"], ["RUC / Tax ID", supplier.taxId], ["Contacto", supplier.contactName], ["Teléfono", supplier.phone], ["Email", supplier.email], ["Dirección", supplier.address], ["Notas", supplier.notes]];
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 sm:items-center sm:p-6"><section aria-labelledby="supplier-detail-title" aria-modal="true" className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl" role="dialog"><div className="flex items-start justify-between border-b border-slate-200 p-5 sm:px-7"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Detalle de proveedor</p><h2 className="mt-1 text-2xl font-bold" id="supplier-detail-title">{supplier.name}</h2></div><button aria-label="Cerrar detalle" className="size-10 rounded-xl border border-slate-200 text-2xl" onClick={onClose} type="button">×</button></div><dl className="grid gap-5 p-5 sm:grid-cols-2 sm:p-7">{fields.map(([label, value]) => <div className={label === "Dirección" || label === "Notas" ? "sm:col-span-2" : ""} key={label}><dt className="text-xs font-semibold uppercase text-slate-500">{label}</dt><dd className="mt-1 whitespace-pre-wrap text-sm font-semibold text-slate-900">{value || "No registrado"}</dd></div>)}</dl></section></div>;
}
