"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/features/auth";
import type { Product } from "@/features/products";
import { listProducts } from "@/features/products/services/products.service";

import {
  cancelReplenishment,
  createReplenishment,
  getReplenishmentErrorMessage,
  listReplenishments,
  listReplenishmentUsers,
  receiveReplenishment,
  sendReplenishment,
  updatePendingReplenishment,
} from "../services/replenishment.service";
import type {
  Replenishment,
  ReplenishmentFilters,
  ReplenishmentInput,
  ReplenishmentUser,
} from "../types/replenishment.types";
import { REPLENISHMENT_STATUS_LABELS } from "../utils/replenishment-utils";
import { ReplenishmentDetailDialog } from "./replenishment-detail-dialog";
import { ReplenishmentFormDialog } from "./replenishment-form-dialog";

const INITIAL_FILTERS: ReplenishmentFilters = {
  status: "all",
  agentId: "all",
  search: "",
};

const STATUS_STYLES = {
  pending: "bg-amber-100 text-amber-800",
  sent: "bg-blue-100 text-blue-800",
  received: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-slate-200 text-slate-700",
} as const;

function formatDate(date: { toDate: () => Date }) {
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date.toDate());
}

export function ReplenishmentsContent() {
  const { profile, user } = useAuth();
  const [replenishments, setReplenishments] = useState<Replenishment[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [users, setUsers] = useState<ReplenishmentUser[]>([]);
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [formTarget, setFormTarget] = useState<Replenishment | "new" | null>(null);
  const [detailTarget, setDetailTarget] = useState<Replenishment | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{
    action: "cancel" | "send" | "receive";
    item: Replenishment;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const isAdmin = profile?.role === "admin";

  const loadData = useCallback(async () => {
    if (!user || !profile) return;
    setLoading(true);
    setError(null);
    try {
      const [nextReplenishments, nextProducts, nextUsers] = await Promise.all([
        listReplenishments(profile.role, user.uid),
        listProducts(),
        isAdmin ? listReplenishmentUsers() : Promise.resolve([]),
      ]);
      setReplenishments(nextReplenishments);
      setProducts(nextProducts);
      setUsers(nextUsers);
    } catch (loadError) {
      setError(getReplenishmentErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [isAdmin, profile, user]);

  useEffect(() => {
    if (!user || !profile) return;
    let ignore = false;
    Promise.all([
      listReplenishments(profile.role, user.uid),
      listProducts(),
      profile.role === "admin" ? listReplenishmentUsers() : Promise.resolve([]),
    ])
      .then(([nextReplenishments, nextProducts, nextUsers]) => {
        if (ignore) return;
        setReplenishments(nextReplenishments);
        setProducts(nextProducts);
        setUsers(nextUsers);
      })
      .catch((loadError: unknown) => {
        if (!ignore) setError(getReplenishmentErrorMessage(loadError));
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [profile, user]);

  const userLabels = useMemo(() => {
    const labels = new Map(users.map((item) => [item.uid, item.displayName]));
    if (user && profile) labels.set(user.uid, profile.displayName);
    return labels;
  }, [profile, user, users]);
  const productMap = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );
  const agents = useMemo(
    () => users.filter((item) => item.role === "agent" && item.active),
    [users],
  );
  const filtered = useMemo(() => {
    const term = filters.search.trim().toLocaleLowerCase("es");
    return replenishments.filter((item) => {
      const productText = item.items
        .map((entry) => {
          const product = productMap.get(entry.productId);
          return `${product?.sku ?? ""} ${product?.name ?? ""}`;
        })
        .join(" ")
        .toLocaleLowerCase("es");
      return (
        (filters.status === "all" || item.status === filters.status) &&
        (filters.agentId === "all" || item.agentId === filters.agentId) &&
        (!term ||
          item.number.toLocaleLowerCase("es").includes(term) ||
          (userLabels.get(item.agentId) ?? "").toLocaleLowerCase("es").includes(term) ||
          productText.includes(term))
      );
    });
  }, [filters, productMap, replenishments, userLabels]);

  async function saveReplenishment(input: ReplenishmentInput) {
    if (!user) return;
    try {
      if (formTarget === "new") {
        await createReplenishment(input, user.uid);
        setNotice("Reposición creada en estado Pendiente. El stock no cambió.");
      } else if (formTarget) {
        await updatePendingReplenishment(formTarget.id, input);
        setNotice("Reposición pendiente actualizada.");
      }
      setFormTarget(null);
      await loadData();
    } catch (saveError) {
      throw new Error(getReplenishmentErrorMessage(saveError));
    }
  }

  async function performAction(
    item: Replenishment,
    action: "cancel" | "send" | "receive",
  ) {
    if (!user) return;
    setBusyId(item.id);
    setConfirmTarget(null);
    setError(null);
    setNotice(null);
    try {
      if (action === "cancel") await cancelReplenishment(item.id, user.uid);
      if (action === "send") await sendReplenishment(item.id, user.uid);
      if (action === "receive") await receiveReplenishment(item.id, user.uid);
      setNotice(
        action === "cancel"
          ? "Reposición cancelada."
          : action === "send"
            ? "Reposición enviada y stock de empresa actualizado."
            : "Recepción confirmada y stock del agente actualizado.",
      );
      await loadData();
    } catch (actionError) {
      setError(getReplenishmentErrorMessage(actionError));
    } finally {
      setBusyId(null);
    }
  }

  function Actions({ item }: { item: Replenishment }) {
    const disabled = busyId === item.id;
    return (
      <div className="flex flex-wrap gap-2">
        <button className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50" onClick={() => setDetailTarget(item)} type="button">Ver detalle</button>
        {isAdmin && item.status === "pending" ? <button className="rounded-lg border border-blue-200 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50" disabled={disabled} onClick={() => setFormTarget(item)} type="button">Editar</button> : null}
        {isAdmin && item.status === "pending" ? <button className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50" disabled={disabled} onClick={() => setConfirmTarget({ action: "cancel", item })} type="button">Cancelar</button> : null}
        {isAdmin && item.status === "pending" ? <button className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50" disabled={disabled} onClick={() => setConfirmTarget({ action: "send", item })} type="button">{disabled ? "Procesando..." : "Enviar"}</button> : null}
        {!isAdmin && item.status === "sent" && item.agentId === user?.uid ? <button className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50" disabled={disabled} onClick={() => setConfirmTarget({ action: "receive", item })} type="button">{disabled ? "Procesando..." : "Confirmar recepción"}</button> : null}
      </div>
    );
  }

  return (
    <section aria-labelledby="replenishments-title">
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-5 border-b border-slate-100 bg-gradient-to-br from-white to-emerald-50/70 p-6 sm:flex-row sm:items-end sm:justify-between sm:p-8">
          <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Inventario empresa → agente</p><h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-950" id="replenishments-title">Reposiciones</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Gestiona el envío y la recepción de stock con trazabilidad completa y movimientos atómicos.</p></div>
          {isAdmin ? <button className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600" onClick={() => setFormTarget("new")} type="button">Nueva reposición</button> : null}
        </div>

        <div className="space-y-6 p-5 sm:p-8">
          <div className={`grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 ${isAdmin ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
            <div><label className="text-sm font-semibold text-slate-800" htmlFor="replenishment-search">Buscar</label><input className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" id="replenishment-search" onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Número, agente, SKU o producto" type="search" value={filters.search} /></div>
            <div><label className="text-sm font-semibold text-slate-800" htmlFor="replenishment-status">Estado</label><select className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" id="replenishment-status" onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value as ReplenishmentFilters["status"] }))} value={filters.status}><option value="all">Todos los estados</option>{Object.entries(REPLENISHMENT_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
            {isAdmin ? <div><label className="text-sm font-semibold text-slate-800" htmlFor="replenishment-agent-filter">Agente</label><select className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" id="replenishment-agent-filter" onChange={(event) => setFilters((current) => ({ ...current, agentId: event.target.value }))} value={filters.agentId}><option value="all">Todos los agentes</option>{users.filter((item) => item.role === "agent").map((agent) => <option key={agent.uid} value={agent.uid}>{agent.displayName}</option>)}</select></div> : null}
          </div>

          {notice ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900" role="status">{notice}</p> : null}
          {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800" role="alert"><p>{error}</p><button className="mt-2 underline" onClick={() => void loadData()} type="button">Reintentar</button></div> : null}

          {loading ? <div className="flex min-h-48 items-center justify-center text-sm font-medium text-slate-600">Cargando reposiciones...</div> : filtered.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center"><p className="font-semibold text-slate-900">No hay reposiciones para mostrar.</p><p className="mt-1 text-sm text-slate-500">Ajusta los filtros o crea una nueva reposición.</p></div> : <>
            <p className="text-sm text-slate-500">{filtered.length} {filtered.length === 1 ? "reposición" : "reposiciones"}, de la más reciente a la más antigua.</p>
            <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 lg:block"><table className="min-w-[1180px] divide-y divide-slate-200 text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Número / creación</th><th className="px-4 py-3">Agente</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Productos</th><th className="px-4 py-3">Unidades</th><th className="px-4 py-3">Envío</th><th className="px-4 py-3">Recepción</th><th className="px-4 py-3">Acciones</th></tr></thead><tbody className="divide-y divide-slate-100">{filtered.map((item) => <tr key={item.id}><td className="px-4 py-4"><p className="font-bold text-slate-950">{item.number}</p><p className="mt-1 whitespace-nowrap text-xs text-slate-500">{formatDate(item.createdAt)}</p></td><td className="px-4 py-4 font-medium text-slate-800">{userLabels.get(item.agentId) ?? "Agente"}</td><td className="px-4 py-4"><span className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_STYLES[item.status]}`}>{REPLENISHMENT_STATUS_LABELS[item.status]}</span></td><td className="px-4 py-4 text-slate-700">{item.items.length}</td><td className="px-4 py-4 font-bold text-slate-950">{item.items.reduce((sum, entry) => sum + entry.quantity, 0)}</td><td className="whitespace-nowrap px-4 py-4 text-xs text-slate-600">{item.sentAt ? formatDate(item.sentAt) : "—"}</td><td className="whitespace-nowrap px-4 py-4 text-xs text-slate-600">{item.receivedAt ? formatDate(item.receivedAt) : "—"}</td><td className="px-4 py-4"><Actions item={item} /></td></tr>)}</tbody></table></div>
            <div className="grid gap-4 lg:hidden">{filtered.map((item) => <article className="rounded-2xl border border-slate-200 p-4 shadow-sm" key={item.id}><div className="flex items-start justify-between gap-3"><div><h3 className="font-bold text-slate-950">{item.number}</h3><p className="mt-1 text-xs text-slate-500">Creada: {formatDate(item.createdAt)}</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_STYLES[item.status]}`}>{REPLENISHMENT_STATUS_LABELS[item.status]}</span></div><dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div className="col-span-2"><dt className="text-xs text-slate-500">Agente</dt><dd className="mt-1 font-semibold text-slate-900">{userLabels.get(item.agentId) ?? "Agente"}</dd></div><div><dt className="text-xs text-slate-500">Productos</dt><dd className="mt-1 font-bold text-slate-900">{item.items.length}</dd></div><div><dt className="text-xs text-slate-500">Unidades</dt><dd className="mt-1 font-bold text-slate-900">{item.items.reduce((sum, entry) => sum + entry.quantity, 0)}</dd></div><div><dt className="text-xs text-slate-500">Envío</dt><dd className="mt-1 text-xs font-medium text-slate-900">{item.sentAt ? formatDate(item.sentAt) : "Pendiente"}</dd></div><div><dt className="text-xs text-slate-500">Recepción</dt><dd className="mt-1 text-xs font-medium text-slate-900">{item.receivedAt ? formatDate(item.receivedAt) : "Pendiente"}</dd></div></dl><div className="mt-4 border-t border-slate-100 pt-4"><Actions item={item} /></div></article>)}</div>
          </>}
        </div>
      </div>

      {formTarget ? <ReplenishmentFormDialog agents={agents} initial={formTarget === "new" ? undefined : formTarget} onClose={() => setFormTarget(null)} onSubmit={saveReplenishment} products={products} /> : null}
      {detailTarget ? <ReplenishmentDetailDialog actorLabels={userLabels} agentLabel={userLabels.get(detailTarget.agentId) ?? "Agente"} onClose={() => setDetailTarget(null)} products={productMap} replenishment={detailTarget} /> : null}
      {confirmTarget ? <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-5 backdrop-blur-sm"><section aria-labelledby="replenishment-confirm-title" aria-modal="true" className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl" role="alertdialog"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Confirmación requerida</p><h2 className="mt-2 text-2xl font-bold text-slate-950" id="replenishment-confirm-title">{confirmTarget.action === "cancel" ? `Cancelar ${confirmTarget.item.number}` : confirmTarget.action === "send" ? `Enviar ${confirmTarget.item.number}` : `Recibir ${confirmTarget.item.number}`}</h2><p className="mt-3 text-sm leading-6 text-slate-600">{confirmTarget.action === "cancel" ? "La reposición quedará cancelada y no se modificará el stock." : confirmTarget.action === "send" ? "¿Confirmas el envío? Se descontará el stock de la empresa y se generará un movimiento de salida por cada producto. Esta operación no puede repetirse." : "Confirmo que recibí esta reposición. Se aumentará mi stock y se generará un movimiento de entrada por cada producto."}</p><div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={() => setConfirmTarget(null)} type="button">Volver</button><button className={confirmTarget.action === "cancel" ? "rounded-xl bg-red-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-800" : "rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800"} onClick={() => void performAction(confirmTarget.item, confirmTarget.action)} type="button">{confirmTarget.action === "cancel" ? "Sí, cancelar" : confirmTarget.action === "send" ? "Sí, enviar" : "Sí, confirmar recepción"}</button></div></section></div> : null}
    </section>
  );
}
