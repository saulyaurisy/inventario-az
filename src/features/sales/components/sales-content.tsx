"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/features/auth";
import type { Client } from "@/features/clients";
import { listClients } from "@/features/clients/services/clients.service";
import type { InventoryRecord } from "@/features/inventory";
import { listInventory } from "@/features/inventory/services/inventory.service";
import type { Product } from "@/features/products";
import { listProducts } from "@/features/products/services/products.service";

import { createSale, getSaleErrorMessage, listSales, listSaleUsers } from "../services/sales.service";
import type { PaymentMethod, Sale, SaleFilters, SaleStatus, SaleUser } from "../types/sale.types";
import { formatMoney, PAYMENT_METHOD_LABELS } from "../utils/sale-utils";
import { SaleDetailDialog } from "./sale-detail-dialog";
import { SaleFormDialog } from "./sale-form-dialog";

const EMPTY_FILTERS: SaleFilters = { search: "", agentId: "all", status: "all", paymentMethod: "all", dateFrom: "", dateTo: "" };

export function SalesContent() {
  const { profile, user } = useAuth();
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [inventory, setInventory] = useState<InventoryRecord[]>([]);
  const [users, setUsers] = useState<SaleUser[]>([]);
  const [filters, setFilters] = useState<SaleFilters>(EMPTY_FILTERS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);

  const loadData = useCallback(async () => {
    if (!profile || !user) return;
    setLoading(true);
    setError(null);
    try {
      const [nextSales, nextProducts, nextClients, nextInventory, nextUsers] = await Promise.all([
        listSales(profile.role, user.uid),
        listProducts(),
        listClients(),
        listInventory(profile.role, user.uid),
        profile.role === "admin" ? listSaleUsers() : Promise.resolve([{ uid: user.uid, displayName: profile.displayName, email: profile.email, role: profile.role, active: profile.active }]),
      ]);
      setSales(nextSales);
      setProducts(nextProducts);
      setClients(nextClients);
      setInventory(nextInventory);
      setUsers(nextUsers);
    } catch (cause) {
      setError(getSaleErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [profile, user]);

  useEffect(() => {
    if (!profile || !user) return;
    let ignore = false;
    Promise.all([
      listSales(profile.role, user.uid),
      listProducts(),
      listClients(),
      listInventory(profile.role, user.uid),
      profile.role === "admin" ? listSaleUsers() : Promise.resolve([{ uid: user.uid, displayName: profile.displayName, email: profile.email, role: profile.role, active: profile.active }]),
    ])
      .then(([nextSales, nextProducts, nextClients, nextInventory, nextUsers]) => {
        if (ignore) return;
        setSales(nextSales);
        setProducts(nextProducts);
        setClients(nextClients);
        setInventory(nextInventory);
        setUsers(nextUsers);
      })
      .catch((cause: unknown) => { if (!ignore) setError(getSaleErrorMessage(cause)); })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, [profile, user]);

  const agentLabels = useMemo(() => Object.fromEntries(users.map((item) => [item.uid, item.displayName])), [users]);
  const filteredSales = useMemo(() => {
    const term = filters.search.trim().toLocaleLowerCase("es");
    const from = filters.dateFrom ? new Date(`${filters.dateFrom}T00:00:00`).getTime() : null;
    const to = filters.dateTo ? new Date(`${filters.dateTo}T23:59:59.999`).getTime() : null;
    return sales.filter((sale) => {
      const haystack = [sale.number, sale.clientSnapshot.name, sale.clientSnapshot.documentNumber, sale.paymentReference ?? "", ...sale.items.flatMap((item) => [item.sku, item.name])].join(" ").toLocaleLowerCase("es");
      const timestamp = sale.createdAt.toMillis();
      return (!term || haystack.includes(term))
        && (filters.agentId === "all" || sale.agentId === filters.agentId)
        && (filters.status === "all" || sale.status === filters.status)
        && (filters.paymentMethod === "all" || sale.paymentMethod === filters.paymentMethod)
        && (from === null || timestamp >= from)
        && (to === null || timestamp <= to);
    });
  }, [filters, sales]);

  async function handleCreate(input: Parameters<typeof createSale>[0]) {
    if (!user) throw new Error("Tu sesión ya no está disponible.");
    try {
      await createSale(input, user.uid);
      setFormOpen(false);
      setFeedback("Venta registrada correctamente. El stock y el Kardex fueron actualizados.");
      await loadData();
    } catch (cause) {
      throw new Error(getSaleErrorMessage(cause));
    }
  }

  if (!profile || !user) return null;

  return <section aria-labelledby="sales-title"><div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
    <div className="flex flex-col gap-5 border-b border-slate-100 bg-gradient-to-br from-white to-emerald-50/70 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Operaciones</p><h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-950" id="sales-title">Ventas</h2><p className="mt-2 text-sm text-slate-600">Consulta ventas completadas y su impacto inmutable en inventario.</p></div>{profile.role === "agent" ? <button className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white" onClick={() => { setFeedback(null); setFormOpen(true); }} type="button">+ Nueva venta</button> : null}</div>
    <div className="space-y-6 p-5 sm:p-8">
      <div className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-2 xl:grid-cols-7"><div className="xl:col-span-2"><label className="text-sm font-semibold text-slate-800" htmlFor="sale-search">Buscar</label><input className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm" id="sale-search" onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Número, cliente, documento, SKU o referencia" type="search" value={filters.search} /></div>{profile.role === "admin" ? <div><label className="text-sm font-semibold text-slate-800" htmlFor="sale-agent">Agente</label><select className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm" id="sale-agent" onChange={(event) => setFilters((current) => ({ ...current, agentId: event.target.value }))} value={filters.agentId}><option value="all">Todos</option>{users.filter((item) => item.role === "agent").map((item) => <option key={item.uid} value={item.uid}>{item.displayName}</option>)}</select></div> : null}<div><label className="text-sm font-semibold text-slate-800" htmlFor="sale-status">Estado</label><select className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm" id="sale-status" onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value as "all" | SaleStatus }))} value={filters.status}><option value="all">Todos</option><option value="completed">Completada</option><option value="cancelled">Anulada</option></select></div><div><label className="text-sm font-semibold text-slate-800" htmlFor="sale-payment">Pago</label><select className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm" id="sale-payment" onChange={(event) => setFilters((current) => ({ ...current, paymentMethod: event.target.value as "all" | PaymentMethod }))} value={filters.paymentMethod}><option value="all">Todos</option>{Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><div><label className="text-sm font-semibold text-slate-800" htmlFor="sale-from">Desde</label><input className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm" id="sale-from" onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value }))} type="date" value={filters.dateFrom} /></div><div><label className="text-sm font-semibold text-slate-800" htmlFor="sale-to">Hasta</label><input className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm" id="sale-to" onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.target.value }))} type="date" value={filters.dateTo} /></div></div>
      {feedback ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-900" aria-live="polite">{feedback}</p> : null}
      {loading ? <p className="py-12 text-center text-sm text-slate-600">Cargando ventas...</p> : error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center" role="alert"><p className="font-semibold text-red-900">{error}</p><button className="mt-4 rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white" onClick={() => void loadData()} type="button">Reintentar</button></div> : filteredSales.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center"><p className="font-semibold text-slate-900">No hay ventas que coincidan.</p><p className="mt-1 text-sm text-slate-500">{sales.length === 0 ? "Las ventas registradas aparecerán aquí." : "Prueba con otros filtros."}</p></div> : <><p className="text-sm text-slate-500">{filteredSales.length} {filteredSales.length === 1 ? "venta" : "ventas"}</p><div className="hidden overflow-x-auto rounded-2xl border border-slate-200 lg:block"><table className="min-w-[1180px] divide-y divide-slate-200 text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Venta</th><th className="px-4 py-3">Cliente</th><th className="px-4 py-3">Agente</th><th className="px-4 py-3">Productos</th><th className="px-4 py-3">Subtotal</th><th className="px-4 py-3">Descuento</th><th className="px-4 py-3">Total</th><th className="px-4 py-3">Pago</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Acción</th></tr></thead><tbody className="divide-y divide-slate-100">{filteredSales.map((sale) => <tr key={sale.id}><td className="px-4 py-4"><p className="font-bold text-slate-950">{sale.number}</p><p className="text-xs text-slate-500">{new Intl.DateTimeFormat("es-PE", { dateStyle: "short", timeStyle: "short" }).format(sale.createdAt.toDate())}</p></td><td className="px-4 py-4"><p className="font-semibold">{sale.clientSnapshot.name}</p><p className="text-xs text-slate-500">{sale.clientSnapshot.documentNumber}</p></td><td className="px-4 py-4">{agentLabels[sale.agentId] ?? sale.agentId}</td><td className="px-4 py-4">{sale.items.length}</td><td className="px-4 py-4">{formatMoney(sale.subtotal)}</td><td className="px-4 py-4 text-red-700">{formatMoney(sale.totalDiscount)}</td><td className="px-4 py-4 font-bold">{formatMoney(sale.total)}</td><td className="px-4 py-4">{PAYMENT_METHOD_LABELS[sale.paymentMethod]}</td><td className="px-4 py-4"><span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">{sale.status === "completed" ? "Completada" : "Anulada"}</span></td><td className="px-4 py-4"><button className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold" onClick={() => setSelectedSale(sale)} type="button">Ver detalle</button></td></tr>)}</tbody></table></div><div className="grid gap-4 lg:hidden">{filteredSales.map((sale) => <article className="rounded-2xl border border-slate-200 p-4 shadow-sm" key={sale.id}><div className="flex items-start justify-between gap-3"><div><h3 className="font-bold text-slate-950">{sale.number}</h3><p className="mt-1 text-xs text-slate-500">{new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeStyle: "short" }).format(sale.createdAt.toDate())}</p></div><div className="text-right"><p className="text-lg font-black text-emerald-800">{formatMoney(sale.total)}</p><span className="text-xs font-semibold text-emerald-700">{sale.status === "completed" ? "Completada" : "Anulada"}</span></div></div><dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-slate-500">Cliente</dt><dd className="font-semibold">{sale.clientSnapshot.name}</dd></div><div><dt className="text-xs text-slate-500">Agente</dt><dd className="font-semibold">{agentLabels[sale.agentId] ?? sale.agentId}</dd></div><div><dt className="text-xs text-slate-500">Productos</dt><dd>{sale.items.length}</dd></div><div><dt className="text-xs text-slate-500">Pago</dt><dd>{PAYMENT_METHOD_LABELS[sale.paymentMethod]}</dd></div><div><dt className="text-xs text-slate-500">Subtotal</dt><dd>{formatMoney(sale.subtotal)}</dd></div><div><dt className="text-xs text-slate-500">Descuento</dt><dd>{formatMoney(sale.totalDiscount)}</dd></div></dl><button className="mt-4 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold" onClick={() => setSelectedSale(sale)} type="button">Ver detalle</button></article>)}</div></>}
    </div>
  </div>
  {formOpen ? <SaleFormDialog clients={clients} inventory={inventory.filter((record) => record.ownerType === "agent" && record.ownerId === user.uid)} onClose={() => setFormOpen(false)} onSubmit={handleCreate} products={products} /> : null}
  {selectedSale ? <SaleDetailDialog actorUid={user.uid} agentLabel={agentLabels[selectedSale.agentId] ?? selectedSale.agentId} onClose={() => setSelectedSale(null)} role={profile.role} sale={selectedSale} /> : null}
  </section>;
}
