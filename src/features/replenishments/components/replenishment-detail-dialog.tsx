"use client";

import type { Product } from "@/features/products";

import type { Replenishment } from "../types/replenishment.types";
import { REPLENISHMENT_STATUS_LABELS } from "../utils/replenishment-utils";

interface Props {
  agentLabel: string;
  actorLabels: Map<string, string>;
  onClose: () => void;
  products: Map<string, Product>;
  replenishment: Replenishment;
}

function formatDate(value?: { toDate: () => Date }) {
  return value
    ? new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeStyle: "short" }).format(value.toDate())
    : "Pendiente";
}

export function ReplenishmentDetailDialog({ agentLabel, actorLabels, onClose, products, replenishment }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <section aria-labelledby="replenishment-detail-title" aria-modal="true" className="max-h-[96vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl" role="dialog">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white/95 px-5 py-5 backdrop-blur sm:px-7"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Detalle de reposición</p><h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950" id="replenishment-detail-title">{replenishment.number}</h2></div><button aria-label="Cerrar detalle" className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-2xl text-slate-600 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600" onClick={onClose} type="button"><span aria-hidden="true">×</span></button></div>
        <div className="space-y-6 p-5 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50 p-4"><div><p className="text-xs text-slate-500">Agente destino</p><p className="mt-1 font-bold text-slate-950">{agentLabel}</p></div><span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">{REPLENISHMENT_STATUS_LABELS[replenishment.status]}</span></div>
          <ol aria-label="Estado del flujo" className="grid gap-2 text-sm sm:grid-cols-3"><li className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 font-semibold text-emerald-900">1. Creada<br /><span className="text-xs font-normal">{formatDate(replenishment.createdAt)}</span></li><li className={replenishment.sentAt ? "rounded-xl border border-emerald-200 bg-emerald-50 p-3 font-semibold text-emerald-900" : "rounded-xl border border-slate-200 bg-slate-50 p-3 font-semibold text-slate-500"}>2. Enviada<br /><span className="text-xs font-normal">{formatDate(replenishment.sentAt)}</span></li><li className={replenishment.receivedAt ? "rounded-xl border border-emerald-200 bg-emerald-50 p-3 font-semibold text-emerald-900" : "rounded-xl border border-slate-200 bg-slate-50 p-3 font-semibold text-slate-500"}>3. Recibida<br /><span className="text-xs font-normal">{formatDate(replenishment.receivedAt)}</span></li></ol>
          <div><h3 className="font-bold text-slate-950">Productos</h3><div className="mt-3 space-y-2">{replenishment.items.map((item) => { const product = products.get(item.productId); return <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 px-4 py-3" key={item.productId}><div><p className="font-semibold text-slate-950">{product?.name ?? "Producto no disponible"}</p><p className="font-mono text-xs text-slate-500">{product?.sku ?? item.productId}</p></div><span className="text-lg font-bold text-slate-950">{item.quantity}</span></div>; })}</div></div>
          <dl className="grid gap-4 text-sm sm:grid-cols-2"><div><dt className="text-xs text-slate-500">Creado por</dt><dd className="font-semibold text-slate-900">{actorLabels.get(replenishment.createdBy) ?? "Usuario del sistema"}</dd></div><div><dt className="text-xs text-slate-500">Enviado por</dt><dd className="font-semibold text-slate-900">{replenishment.sentBy ? actorLabels.get(replenishment.sentBy) ?? "Usuario del sistema" : "Pendiente"}</dd></div><div><dt className="text-xs text-slate-500">Recibido por</dt><dd className="font-semibold text-slate-900">{replenishment.receivedBy ? actorLabels.get(replenishment.receivedBy) ?? agentLabel : "Pendiente"}</dd></div><div><dt className="text-xs text-slate-500">Observación</dt><dd className="font-semibold text-slate-900">{replenishment.notes || "Sin observación"}</dd></div></dl>
          {replenishment.status === "sent" ? <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Si las cantidades recibidas no coinciden, no confirmes la recepción y contacta al administrador.</p> : null}
        </div>
      </section>
    </div>
  );
}
