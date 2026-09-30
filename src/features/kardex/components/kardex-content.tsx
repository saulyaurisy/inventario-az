"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/features/auth";
import type { Product } from "@/features/products";
import { listProducts } from "@/features/products/services/products.service";

import {
  getKardexErrorMessage,
  listKardexMovements,
  listKardexUsers,
} from "../services/kardex.service";
import type {
  KardexFilters,
  KardexMovement,
  KardexOwnerOption,
  KardexRow,
  KardexUserOption,
} from "../types/kardex.types";
import {
  calculateKardexSummary,
  formatKardexDate,
  getKardexMovementDirection,
  getKardexMovementLabel,
  getKardexReferenceLabel,
  getLocalDateKey,
  matchesKardexCategory,
} from "../utils/kardex-utils";
import { KardexDetailDialog } from "./kardex-detail-dialog";

const INITIAL_FILTERS: KardexFilters = {
  productId: "all",
  ownerKey: "all",
  category: "all",
  dateFrom: "",
  dateTo: "",
  search: "",
};

async function fetchKardexData(
  role: "admin" | "agent",
  actorUid: string,
) {
  return Promise.all([
    listKardexMovements(role, actorUid),
    listProducts(),
    role === "admin" ? listKardexUsers() : Promise.resolve([]),
  ]);
}

function SummaryCard({ label, tone, value }: { label: string; tone: string; value: string | number }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${tone}`}>{value}</p>
    </article>
  );
}

function MovementAmount({ row }: { row: KardexRow }) {
  const tone =
    row.direction === "out"
      ? "text-amber-700"
      : row.direction === "in"
        ? "text-emerald-700"
        : "text-slate-700";
  return (
    <span className={`font-bold tabular-nums ${tone}`}>
      {row.direction === "out" ? "−" : row.direction === "in" ? "+" : ""}
      {row.movement.quantity}
    </span>
  );
}

export function KardexContent() {
  const { profile, user } = useAuth();
  const [movements, setMovements] = useState<KardexMovement[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [users, setUsers] = useState<KardexUserOption[]>([]);
  const [filters, setFilters] = useState<KardexFilters>(INITIAL_FILTERS);
  const [selectedRow, setSelectedRow] = useState<KardexRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isAdmin = profile?.role === "admin";

  const loadData = useCallback(async () => {
    if (!user || !profile) return;
    setLoading(true);
    setError(null);
    try {
      const [nextMovements, nextProducts, nextUsers] = await fetchKardexData(
        profile.role,
        user.uid,
      );
      setMovements(nextMovements);
      setProducts(nextProducts);
      setUsers(nextUsers);
    } catch (loadError) {
      setError(getKardexErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [profile, user]);

  useEffect(() => {
    if (!user || !profile) return;
    let ignore = false;
    fetchKardexData(profile.role, user.uid)
      .then(([nextMovements, nextProducts, nextUsers]) => {
        if (!ignore) {
          setMovements(nextMovements);
          setProducts(nextProducts);
          setUsers(nextUsers);
        }
      })
      .catch((loadError: unknown) => {
        if (!ignore) setError(getKardexErrorMessage(loadError));
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

  const rows = useMemo<KardexRow[]>(
    () =>
      movements.map((movement) => {
        const product = productMap.get(movement.productId) ?? null;
        const ownerLabel =
          movement.ownerType === "company"
            ? "Empresa"
            : userLabels.get(movement.ownerId) ??
              (movement.ownerId === user?.uid ? profile?.displayName : undefined) ??
              "Agente";
        return {
          movement,
          product,
          productName: product?.name ?? "Producto no disponible",
          sku: product?.sku ?? "SKU no disponible",
          ownerLabel,
          createdByLabel:
            userLabels.get(movement.createdBy) ?? "Usuario del sistema",
          direction: getKardexMovementDirection(movement),
          typeLabel: getKardexMovementLabel(movement.type),
          referenceLabel: getKardexReferenceLabel(movement),
        };
      }),
    [movements, productMap, profile, user, userLabels],
  );

  const ownerOptions = useMemo<KardexOwnerOption[]>(() => {
    const options = new Map<string, KardexOwnerOption>();
    for (const row of rows) {
      const key = `${row.movement.ownerType}:${row.movement.ownerId}`;
      options.set(key, {
        key,
        ownerType: row.movement.ownerType,
        ownerId: row.movement.ownerId,
        label: row.ownerLabel,
      });
    }
    return [...options.values()].sort((a, b) => {
      if (a.ownerType !== b.ownerType) return a.ownerType === "company" ? -1 : 1;
      return a.label.localeCompare(b.label, "es");
    });
  }, [rows]);

  const dateRangeInvalid = Boolean(
    filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo,
  );

  const filteredRows = useMemo(() => {
    if (dateRangeInvalid) return [];
    const term = filters.search.trim().toLocaleLowerCase("es");

    return rows.filter((row) => {
      const movementDate = getLocalDateKey(row.movement.createdAt.toDate());
      const ownerKey = `${row.movement.ownerType}:${row.movement.ownerId}`;
      return (
        (filters.productId === "all" || row.movement.productId === filters.productId) &&
        (filters.ownerKey === "all" || ownerKey === filters.ownerKey) &&
        matchesKardexCategory(row, filters.category) &&
        (!filters.dateFrom || movementDate >= filters.dateFrom) &&
        (!filters.dateTo || movementDate <= filters.dateTo) &&
        (!term ||
          row.sku.toLocaleLowerCase("es").includes(term) ||
          row.productName.toLocaleLowerCase("es").includes(term) ||
          row.movement.reason.toLocaleLowerCase("es").includes(term) ||
          row.ownerLabel.toLocaleLowerCase("es").includes(term))
      );
    });
  }, [dateRangeInvalid, filters, rows]);

  const summary = useMemo(
    () => calculateKardexSummary(filteredRows),
    [filteredRows],
  );

  function setFilter<Key extends keyof KardexFilters>(
    key: Key,
    value: KardexFilters[Key],
  ) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  return (
    <section aria-labelledby="kardex-title">
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-gradient-to-br from-white to-emerald-50/70 p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
            Historial de inventario
          </p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-950" id="kardex-title">
            Kardex
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Consulta entradas, salidas y saldos históricos. El resumen corresponde al conjunto filtrado y no representa necesariamente el stock actual.
          </p>
        </div>

        <div className="space-y-6 p-5 sm:p-8">
          <div className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-2 xl:grid-cols-3">
            <div>
              <label className="text-sm font-semibold text-slate-800" htmlFor="kardex-search">Buscar</label>
              <input className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" id="kardex-search" onChange={(event) => setFilter("search", event.target.value)} placeholder={isAdmin ? "SKU, producto, motivo o propietario" : "SKU, producto o motivo"} type="search" value={filters.search} />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-800" htmlFor="kardex-product">Producto</label>
              <select className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" id="kardex-product" onChange={(event) => setFilter("productId", event.target.value)} value={filters.productId}>
                <option value="all">Todos los productos</option>
                {products.map((product) => <option key={product.id} value={product.id}>{product.sku} · {product.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-800" htmlFor="kardex-type">Tipo</label>
              <select className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" id="kardex-type" onChange={(event) => setFilter("category", event.target.value as KardexFilters["category"])} value={filters.category}>
                <option value="all">Todos los tipos</option>
                <option value="initial">Stock inicial</option>
                <option value="in">Entradas</option>
                <option value="out">Salidas</option>
              </select>
            </div>
            {isAdmin ? (
              <div>
                <label className="text-sm font-semibold text-slate-800" htmlFor="kardex-owner">Propietario</label>
                <select className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" id="kardex-owner" onChange={(event) => setFilter("ownerKey", event.target.value)} value={filters.ownerKey}>
                  <option value="all">Todos los propietarios</option>
                  {ownerOptions.map((owner) => <option key={owner.key} value={owner.key}>{owner.label}</option>)}
                </select>
              </div>
            ) : null}
            <div>
              <label className="text-sm font-semibold text-slate-800" htmlFor="kardex-from">Desde</label>
              <input className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" id="kardex-from" onChange={(event) => setFilter("dateFrom", event.target.value)} type="date" value={filters.dateFrom} />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-800" htmlFor="kardex-to">Hasta</label>
              <input className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" id="kardex-to" onChange={(event) => setFilter("dateTo", event.target.value)} type="date" value={filters.dateTo} />
            </div>
          </div>

          {dateRangeInvalid ? <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800" role="alert">La fecha Desde no puede ser posterior a la fecha Hasta.</p> : null}

          <div aria-label="Resumen del Kardex" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <SummaryCard label="Total de movimientos" tone="text-slate-950" value={summary.movements} />
            <SummaryCard label="Unidades ingresadas" tone="text-emerald-700" value={summary.entries} />
            <SummaryCard label="Unidades salidas" tone="text-amber-700" value={summary.exits} />
            <SummaryCard label="Balance neto" tone={summary.net < 0 ? "text-red-700" : "text-emerald-700"} value={`${summary.net >= 0 ? "+" : ""}${summary.net}`} />
          </div>

          {loading ? (
            <div className="flex min-h-48 items-center justify-center text-sm font-medium text-slate-600">Cargando Kardex...</div>
          ) : error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center" role="alert"><p className="font-semibold text-red-900">No se pudo cargar el Kardex.</p><p className="mt-1 text-sm text-red-800">{error}</p><button className="mt-4 rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600" onClick={() => void loadData()} type="button">Reintentar</button></div>
          ) : filteredRows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center"><p className="font-semibold text-slate-900">No hay movimientos de inventario para los filtros seleccionados.</p><p className="mt-1 text-sm text-slate-500">Prueba con otro producto, propietario, tipo o rango de fechas.</p></div>
          ) : (
            <>
              <p className="text-sm text-slate-500">{filteredRows.length} {filteredRows.length === 1 ? "movimiento" : "movimientos"}, ordenados del más reciente al más antiguo.</p>
              <div className="hidden overflow-hidden rounded-2xl border border-slate-200 lg:block">
                <table className="w-full table-fixed divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="w-[14%] px-3 py-3 font-semibold">Fecha</th><th className="w-[20%] px-3 py-3 font-semibold">Producto</th><th className="w-[16%] px-3 py-3 font-semibold">Movimiento</th><th className="w-[10%] px-3 py-3 font-semibold">Cantidad</th><th className="w-[11%] px-3 py-3 font-semibold">Stock final</th><th className="w-[17%] px-3 py-3 font-semibold">Referencia</th><th className="w-[12%] px-3 py-3 font-semibold">Acción</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">{filteredRows.map((row) => <tr className="align-middle" key={row.movement.id}><td className="whitespace-nowrap px-3 py-4 text-xs text-slate-600">{formatKardexDate(row.movement.createdAt.toDate())}</td><td className="px-3 py-4"><p className="truncate font-semibold text-slate-950" title={row.productName}>{row.productName}</p><p className="mt-1 truncate font-mono text-xs text-slate-500" title={row.sku}>{row.sku}</p></td><td className="px-3 py-4 font-medium text-slate-800">{row.typeLabel}</td><td className="px-3 py-4"><MovementAmount row={row} /></td><td className="px-3 py-4 font-bold tabular-nums text-slate-950">{row.movement.quantityAfter}</td><td className="px-3 py-4 text-slate-700">{row.referenceLabel}</td><td className="px-3 py-4"><button className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600" onClick={() => setSelectedRow(row)} type="button">Ver detalle</button></td></tr>)}</tbody>
                </table>
              </div>

              <div className="grid gap-4 lg:hidden">{filteredRows.map((row) => <article className="min-w-0 rounded-2xl border border-slate-200 p-4 shadow-sm" key={row.movement.id}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs text-slate-500">{formatKardexDate(row.movement.createdAt.toDate())}</p><h3 className="mt-1 truncate font-bold text-slate-950">{row.productName}</h3><p className="mt-1 truncate font-mono text-xs text-slate-500">{row.sku}</p></div><MovementAmount row={row} /></div><dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-slate-500">Movimiento</dt><dd className="mt-1 font-medium text-slate-900">{row.typeLabel}</dd></div><div><dt className="text-xs text-slate-500">Stock final</dt><dd className="mt-1 font-semibold tabular-nums text-slate-900">{row.movement.quantityAfter}</dd></div><div className="col-span-2"><dt className="text-xs text-slate-500">Referencia</dt><dd className="mt-1 break-words font-medium text-slate-900">{row.referenceLabel}</dd></div></dl><div className="mt-4 flex justify-end border-t border-slate-100 pt-4"><button className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600" onClick={() => setSelectedRow(row)} type="button">Ver detalle</button></div></article>)}</div>
            </>
          )}
        </div>
      </div>

      {selectedRow ? <KardexDetailDialog onClose={() => setSelectedRow(null)} row={selectedRow} /> : null}
    </section>
  );
}
