"use client";

import { useEffect, useMemo, useState } from "react";

import type { UserRole } from "@/features/auth";
import { listSalesByClient } from "@/features/sales/services/sales.service";
import type { Sale } from "@/features/sales/types/sale.types";
import { formatMoney } from "@/features/sales/utils/sale-utils";

import type { Client } from "../types/client.types";
import { DOCUMENT_TYPE_LABELS } from "../utils/client-validation";

interface ClientDetailDialogProps {
  actorLabel: string;
  actorUid: string;
  client: Client;
  onClose: () => void;
  role: UserRole;
}

function DetailItem({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium text-slate-900">
        {value || "No registrado"}
      </dd>
    </div>
  );
}

export function ClientDetailDialog({
  actorLabel,
  actorUid,
  client,
  onClose,
  role,
}: ClientDetailDialogProps) {
  const [sales, setSales] = useState<Sale[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const totalPurchased = useMemo(() => sales.reduce((sum, sale) => sum + sale.total, 0), [sales]);

  useEffect(() => {
    let ignore = false;
    listSalesByClient(client.id, role, actorUid)
      .then((result) => { if (!ignore) setSales(result); })
      .catch(() => { if (!ignore) setHistoryError("No se pudo cargar el historial de ventas."); })
      .finally(() => { if (!ignore) setHistoryLoading(false); });
    return () => { ignore = true; };
  }, [actorUid, client.id, role]);
  const createdAt = new Intl.DateTimeFormat("es-PE", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(client.createdAt.toDate());

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <section
        aria-labelledby="client-detail-title"
        aria-modal="true"
        className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
        role="dialog"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white/95 px-5 py-5 backdrop-blur sm:px-7">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
              Detalle del cliente
            </p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950" id="client-detail-title">
              {client.name}
            </h2>
          </div>
          <button
            aria-label="Cerrar detalle"
            className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-2xl text-slate-600 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
            onClick={onClose}
            type="button"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <div className="space-y-6 px-5 py-6 sm:px-7">
          <div className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 p-4">
            <div>
              <p className="text-xs text-slate-500">Documento</p>
              <p className="mt-1 font-mono text-sm font-semibold text-slate-900">
                {DOCUMENT_TYPE_LABELS[client.documentType]} {client.documentNumber}
              </p>
            </div>
            <span className={client.active ? "rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800" : "rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700"}>
              {client.active ? "Activo" : "Inactivo"}
            </span>
          </div>

          <dl className="grid gap-5 sm:grid-cols-2">
            <DetailItem label="Teléfono" value={client.phone} />
            <DetailItem label="Email" value={client.email} />
            <DetailItem label="Dirección" value={client.address} />
            <DetailItem label="Fecha de creación" value={createdAt} />
            <div className="sm:col-span-2">
              <DetailItem label="Observaciones" value={client.notes} />
            </div>
          </dl>

          <section aria-labelledby="purchase-history-title" className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <h3 className="font-bold text-slate-950" id="purchase-history-title">
              Historial de compras
            </h3>
            {historyLoading ? <p className="mt-2 text-sm text-slate-600">Cargando historial...</p> : historyError ? <p className="mt-2 text-sm text-red-700">{historyError}</p> : sales.length === 0 ? <p className="mt-2 text-sm text-slate-600">Aún no hay ventas registradas para este cliente.</p> : <div className="mt-4 space-y-3"><div className="flex items-center justify-between rounded-xl bg-white p-3 text-sm"><span className="text-slate-600">Total histórico</span><strong className="text-emerald-800">{formatMoney(totalPurchased)}</strong></div>{sales.map((sale) => <article className="rounded-xl border border-slate-200 bg-white p-3" key={sale.id}><div className="flex items-start justify-between gap-3"><div><p className="font-bold text-slate-950">{sale.number}</p><p className="mt-1 text-xs text-slate-500">{new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeStyle: "short" }).format(sale.createdAt.toDate())}</p></div><strong className="text-emerald-800">{formatMoney(sale.total)}</strong></div><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600"><span>{sale.items.length} {sale.items.length === 1 ? "producto" : "productos"}</span><span>Agente: {role === "agent" ? actorLabel : sale.agentId}</span><span>{sale.status === "completed" ? "Completada" : "Anulada"}</span></div></article>)}</div>}
          </section>
        </div>
      </section>
    </div>
  );
}
