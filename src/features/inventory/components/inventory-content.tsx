"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/features/auth";
import { listProducts } from "@/features/products/services/products.service";
import type { Product } from "@/features/products";

import {
  adjustInventory,
  getInventoryErrorMessage,
  listInventory,
  listInventoryAgents,
  listInventoryOverviewMovements,
  setInitialStock,
} from "../services/inventory.service";
import type {
  InventoryAgent,
  InventoryMovement,
  InventoryStockStatus,
  InventoryViewRow,
} from "../types/inventory.types";
import {
  calculateInventoryMovementSummary,
  formatInventoryTargetDifference,
  getInventoryId,
  getStockStatus,
  getInventoryTargetMetrics,
  STOCK_STATUS_LABELS,
} from "../utils/inventory-utils";
import { InventoryDetailDialog } from "./inventory-detail-dialog";
import { InventoryImportDialog } from "./inventory-import-dialog";
import { InventoryMovementsDialog } from "./inventory-movements-dialog";
import { InventoryOperationDialog } from "./inventory-operation-dialog";

type Feedback = { message: string; type: "success" | "error" };

function StockBadge({ status }: { status: InventoryStockStatus }) {
  const classes: Record<InventoryStockStatus, string> = {
    uninitialized: "bg-slate-200 text-slate-700",
    out: "bg-red-100 text-red-800",
    low: "bg-amber-100 text-amber-800",
    reorder: "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200",
    available: "bg-emerald-100 text-emerald-800",
  };
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${classes[status]}`}>{STOCK_STATUS_LABELS[status]}</span>;
}

interface RowActionsProps {
  isAdmin: boolean;
  onAdjust: () => void;
  onDetail: () => void;
  onInitial: () => void;
  row: InventoryViewRow;
}

function RowActions({ isAdmin, onAdjust, onDetail, onInitial, row }: RowActionsProps) {
  if (!isAdmin) {
    return <button className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600" onClick={onDetail} type="button">Ver detalle</button>;
  }
  if (!row.inventory) {
    return (
      <div className="flex flex-wrap gap-2">
        <button className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600" onClick={onDetail} type="button">Ver detalle</button>
        {row.product.active ? (
          <button className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600" onClick={onInitial} type="button">Registrar stock inicial</button>
        ) : <span className="self-center text-xs font-medium text-slate-500">Producto inactivo</span>}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      <button className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600" onClick={onDetail} type="button">Ver detalle</button>
      <button className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600" onClick={onAdjust} type="button">Ajustar inventario</button>
    </div>
  );
}

export function InventoryContent() {
  const { profile, user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [records, setRecords] = useState<Awaited<ReturnType<typeof listInventory>>>([]);
  const [agents, setAgents] = useState<InventoryAgent[]>([]);
  const [overviewMovements, setOverviewMovements] = useState<InventoryMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [search, setSearch] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | InventoryStockStatus>("all");
  const [operation, setOperation] = useState<{ mode: "initial" | "adjust"; row: InventoryViewRow } | null>(null);
  const [detailRow, setDetailRow] = useState<InventoryViewRow | null>(null);
  const [historyRow, setHistoryRow] = useState<InventoryViewRow | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const isAdmin = profile?.role === "admin";

  const loadData = useCallback(async () => {
    if (!user || !profile) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [nextProducts, nextRecords, nextAgents, nextMovements] = await Promise.all([
        listProducts(),
        listInventory(profile.role, user.uid),
        profile.role === "admin" ? listInventoryAgents() : Promise.resolve([]),
        listInventoryOverviewMovements(profile.role, user.uid),
      ]);
      setProducts(nextProducts);
      setRecords(nextRecords);
      setAgents(nextAgents);
      setOverviewMovements(nextMovements);
    } catch (error) {
      setLoadError(getInventoryErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [profile, user]);

  useEffect(() => {
    if (!user || !profile) return;
    let ignore = false;
    Promise.all([
      listProducts(),
      listInventory(profile.role, user.uid),
      profile.role === "admin" ? listInventoryAgents() : Promise.resolve([]),
      listInventoryOverviewMovements(profile.role, user.uid),
    ])
      .then(([nextProducts, nextRecords, nextAgents, nextMovements]) => {
        if (!ignore) {
          setProducts(nextProducts);
          setRecords(nextRecords);
          setAgents(nextAgents);
          setOverviewMovements(nextMovements);
        }
      })
      .catch((error: unknown) => {
        if (!ignore) setLoadError(getInventoryErrorMessage(error));
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [profile, user]);

  const rows = useMemo(() => {
    if (!user || !profile) return [];
    const agentMap = new Map(agents.map((agent) => [agent.uid, agent]));
    const productMap = new Map(products.map((product) => [product.id, product]));
    const owners = isAdmin
      ? [
          { ownerType: "company" as const, ownerId: "company", ownerLabel: "Empresa" },
          ...agents.map((agent) => ({ ownerType: "agent" as const, ownerId: agent.uid, ownerLabel: agent.displayName })),
        ]
      : [{ ownerType: "agent" as const, ownerId: user.uid, ownerLabel: profile.displayName }];
    const rowMap = new Map<string, InventoryViewRow>();
    const movementMap = new Map<string, InventoryMovement[]>();
    for (const movement of overviewMovements) {
      const inventoryMovements = movementMap.get(movement.inventoryId) ?? [];
      inventoryMovements.push(movement);
      movementMap.set(movement.inventoryId, inventoryMovements);
    }

    for (const product of products) {
      for (const owner of owners) {
        const id = getInventoryId(owner.ownerType, owner.ownerId, product.id);
        rowMap.set(id, {
          id,
          inventory: null,
          ...owner,
          product,
          status: "uninitialized",
          movementSummary: calculateInventoryMovementSummary(
            movementMap.get(id) ?? [],
            null,
          ),
        });
      }
    }

    for (const inventory of records) {
      const product = productMap.get(inventory.productId);
      if (!product) continue;
      const ownerLabel = inventory.ownerType === "company"
        ? "Empresa"
        : agentMap.get(inventory.ownerId)?.displayName ??
          (inventory.ownerId === user.uid ? profile.displayName : `Agente ${inventory.ownerId}`);
      rowMap.set(inventory.id, {
        id: inventory.id,
        inventory,
        ownerId: inventory.ownerId,
        ownerLabel,
        ownerType: inventory.ownerType,
        product,
        status: getStockStatus(inventory.quantity, product.minimumStock),
        movementSummary: calculateInventoryMovementSummary(
          movementMap.get(inventory.id) ?? [],
          inventory.quantity,
        ),
      });
    }

    return [...rowMap.values()].sort((a, b) =>
      a.product.name.localeCompare(b.product.name, "es") ||
      a.ownerLabel.localeCompare(b.ownerLabel, "es"),
    );
  }, [agents, isAdmin, overviewMovements, products, profile, records, user]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("es");
    return rows.filter((row) => {
      const matchesSearch =
        !term ||
        row.product.sku.toLocaleLowerCase("es").includes(term) ||
        row.product.name.toLocaleLowerCase("es").includes(term) ||
        row.ownerLabel.toLocaleLowerCase("es").includes(term);
      const matchesOwner = ownerFilter === "all" || ownerFilter === `${row.ownerType}:${row.ownerId}`;
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      return matchesSearch && matchesOwner && matchesStatus;
    });
  }, [ownerFilter, rows, search, statusFilter]);

  const actorLabels = useMemo(() => {
    const labels: Record<string, string> = {};
    if (user && profile) labels[user.uid] = profile.displayName;
    for (const agent of agents) labels[agent.uid] = agent.displayName;
    return labels;
  }, [agents, profile, user]);

  async function handleOperation(data: { direction: "in" | "out"; quantity: number; reason: string }) {
    if (!operation || !user) return;
    try {
      if (operation.mode === "initial") {
        await setInitialStock({
          productId: operation.row.product.id,
          ownerType: operation.row.ownerType,
          ownerId: operation.row.ownerId,
          quantity: data.quantity,
          reason: data.reason,
        }, user.uid);
        setFeedback({ message: "Stock inicial registrado correctamente.", type: "success" });
      } else {
        await adjustInventory({
          inventoryId: operation.row.id,
          direction: data.direction,
          quantity: data.quantity,
          reason: data.reason,
        }, user.uid);
        setFeedback({ message: data.direction === "in" ? "Entrada registrada correctamente." : "Salida registrada correctamente.", type: "success" });
      }
      setOperation(null);
      await loadData();
    } catch (error) {
      throw new Error(getInventoryErrorMessage(error));
    }
  }

  function openHistory(row: InventoryViewRow) {
    if (!row.inventory) return;
    setHistoryRow(row);
    setMovements(
      overviewMovements
        .filter((movement) => movement.inventoryId === row.inventory?.id)
        .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis()),
    );
  }

  return (
    <section aria-labelledby="inventory-title">
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-5 border-b border-slate-100 bg-gradient-to-br from-white to-emerald-50/70 p-6 sm:flex-row sm:items-end sm:justify-between sm:p-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Existencias por propietario</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-950" id="inventory-title">Inventario</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Cada cambio de stock se registra mediante una operación controlada y un movimiento inmutable.</p>
          </div>
          {isAdmin && user ? (
            <button className="inline-flex shrink-0 items-center justify-center rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2" onClick={() => setShowImport(true)} type="button">
              Importar inventario
            </button>
          ) : null}
        </div>

        <div className="space-y-6 p-5 sm:p-8">
          <div className={`grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 ${isAdmin ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
            <div><label className="text-sm font-semibold text-slate-800" htmlFor="inventory-search">Buscar</label><input className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" id="inventory-search" onChange={(event) => setSearch(event.target.value)} placeholder="SKU, producto o propietario" type="search" value={search} /></div>
            {isAdmin ? <div><label className="text-sm font-semibold text-slate-800" htmlFor="inventory-owner-filter">Propietario</label><select className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" id="inventory-owner-filter" onChange={(event) => setOwnerFilter(event.target.value)} value={ownerFilter}><option value="all">Todos</option><option value="company:company">Empresa</option>{agents.map((agent) => <option key={agent.uid} value={`agent:${agent.uid}`}>{agent.displayName}</option>)}</select></div> : null}
            <div><label className="text-sm font-semibold text-slate-800" htmlFor="inventory-status-filter">Estado de stock</label><select className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" id="inventory-status-filter" onChange={(event) => setStatusFilter(event.target.value as "all" | InventoryStockStatus)} value={statusFilter}><option value="all">Todos</option><option value="uninitialized">Sin inicializar</option><option value="out">Sin stock</option><option value="low">Stock bajo</option><option value="reorder">Reposición recomendada</option><option value="available">Disponible</option></select></div>
          </div>

          <div aria-live="polite">{feedback ? <p className={feedback.type === "success" ? "rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900" : "rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-900"}>{feedback.message}</p> : null}</div>

          {loading ? <div className="flex min-h-48 items-center justify-center text-sm font-medium text-slate-600">Cargando inventario...</div> : loadError ? <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center" role="alert"><p className="font-semibold text-red-900">No se pudo cargar el inventario.</p><p className="mt-1 text-sm text-red-800">{loadError}</p><button className="mt-4 rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800" onClick={() => void loadData()} type="button">Reintentar</button></div> : filteredRows.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center"><p className="font-semibold text-slate-900">No hay inventario que coincida.</p><p className="mt-1 text-sm text-slate-500">Prueba con otros filtros o términos.</p></div> : (
            <>
              <p className="text-sm text-slate-500">{filteredRows.length} {filteredRows.length === 1 ? "registro" : "registros"}</p>
              <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 lg:block">
                <table className="w-full min-w-[1120px] table-fixed divide-y divide-slate-200 text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="w-[20%] px-3 py-3 font-semibold">Producto</th><th className="px-3 py-3 font-semibold">Stock inicial</th><th className="px-3 py-3 font-semibold">Entradas</th><th className="px-3 py-3 font-semibold">Vendidos</th><th className="px-3 py-3 font-semibold">Stock actual</th><th className="px-3 py-3 font-semibold">Stock objetivo</th><th className="w-[11%] px-3 py-3 font-semibold">Para completar</th><th className="w-[12%] px-3 py-3 font-semibold">Estado</th><th className="w-[18%] px-3 py-3 font-semibold">Acción</th></tr></thead><tbody className="divide-y divide-slate-100">
                  {filteredRows.map((row) => {
                    const target = getInventoryTargetMetrics(row.movementSummary, row.inventory?.quantity ?? null);
                    return <tr key={row.id}><td className="px-3 py-4"><p className="break-words font-semibold text-slate-950">{row.product.name}</p><p className="mt-1 break-all font-mono text-xs text-slate-500">{row.product.sku}{row.product.active ? "" : " · Inactivo"}</p></td><td className="px-3 py-4 font-semibold text-slate-800">{row.inventory ? row.movementSummary.initialStock : "—"}</td><td className="px-3 py-4 font-semibold text-emerald-700">{row.inventory ? row.movementSummary.entries : "—"}</td><td className="px-3 py-4 font-semibold text-blue-700">{row.inventory ? row.movementSummary.sold : "—"}</td><td className="px-3 py-4"><p className="text-lg font-bold text-slate-950">{row.inventory?.quantity ?? "—"}</p>{row.inventory && !row.movementSummary.consistent ? <p className="mt-1 text-xs font-semibold text-red-700" title={`Histórico esperado: ${row.movementSummary.expectedStock}`}>Revisar histórico</p> : null}</td><td className="px-3 py-4 font-semibold text-violet-800">{target.targetStock ?? "—"}</td><td className="px-3 py-4 text-xs font-semibold text-slate-700">{formatInventoryTargetDifference(target.difference)}</td><td className="px-3 py-4"><StockBadge status={row.status} /></td><td className="px-3 py-4"><RowActions isAdmin={isAdmin} onAdjust={() => setOperation({ mode: "adjust", row })} onDetail={() => setDetailRow(row)} onInitial={() => setOperation({ mode: "initial", row })} row={row} /></td></tr>;
                  })}
                </tbody></table>
              </div>
              <div className="grid gap-4 lg:hidden">{filteredRows.map((row) => {
                const target = getInventoryTargetMetrics(row.movementSummary, row.inventory?.quantity ?? null);
                return <article className="min-w-0 rounded-2xl border border-slate-200 p-4 shadow-sm" key={row.id}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words font-bold text-slate-950">{row.product.name}</h3><p className="mt-1 break-all font-mono text-xs text-slate-500">{row.product.sku}</p></div><StockBadge status={row.status} /></div><div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-xl bg-slate-950 p-4 text-white"><p className="text-xs font-medium text-slate-300">Stock actual</p><p className="mt-1 text-2xl font-bold">{row.inventory?.quantity ?? "—"}</p></div><div className="rounded-xl border border-violet-200 bg-violet-50 p-4"><p className="text-xs font-medium text-violet-700">Stock objetivo</p><p className="mt-1 text-2xl font-bold text-violet-950">{target.targetStock ?? "—"}</p></div></div><dl className="mt-4 grid grid-cols-3 gap-3 text-sm"><div><dt className="text-xs text-slate-500">Entradas</dt><dd className="mt-1 font-semibold text-emerald-700">{row.inventory ? row.movementSummary.entries : "—"}</dd></div><div><dt className="text-xs text-slate-500">Vendidos</dt><dd className="mt-1 font-semibold text-blue-700">{row.inventory ? row.movementSummary.sold : "—"}</dd></div><div><dt className="text-xs text-slate-500">Para completar</dt><dd className="mt-1 font-semibold text-slate-900">{formatInventoryTargetDifference(target.difference)}</dd></div></dl><div className="mt-4 border-t border-slate-100 pt-4"><RowActions isAdmin={isAdmin} onAdjust={() => setOperation({ mode: "adjust", row })} onDetail={() => setDetailRow(row)} onInitial={() => setOperation({ mode: "initial", row })} row={row} /></div></article>;
              })}</div>
            </>
          )}
        </div>
      </div>

      {operation ? <InventoryOperationDialog key={`${operation.mode}-${operation.row.id}`} mode={operation.mode} onClose={() => setOperation(null)} onSubmit={handleOperation} row={operation.row} /> : null}
      {detailRow ? <InventoryDetailDialog onClose={() => setDetailRow(null)} onViewMovements={() => { const row = detailRow; setDetailRow(null); openHistory(row); }} row={detailRow} /> : null}
      {historyRow ? <InventoryMovementsDialog actorLabels={actorLabels} error={null} loading={false} movements={movements} onClose={() => setHistoryRow(null)} row={historyRow} /> : null}
      {showImport && isAdmin && user ? <InventoryImportDialog actorUid={user.uid} inventory={records} onClose={() => setShowImport(false)} onImported={loadData} products={products} /> : null}
    </section>
  );
}
