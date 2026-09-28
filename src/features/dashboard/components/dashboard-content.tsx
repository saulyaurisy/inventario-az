"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/features/auth";
import { formatMoney } from "@/features/sales";

import {
  getDashboardData,
  getDashboardErrorMessage,
} from "../services/dashboard.service";
import type {
  DashboardAlert,
  DashboardData,
  DashboardPeriodKey,
  RecentActivityItem,
  SalesTrendPoint,
} from "../types/dashboard.types";
import {
  DASHBOARD_PERIOD_OPTIONS,
  formatDashboardDate,
  formatPeriodRange,
} from "../utils/dashboard-utils";

const INTEGER_FORMATTER = new Intl.NumberFormat("es-PE");

interface MetricCardProps {
  label: string;
  value: string | number;
  detail?: string;
  tone?: "emerald" | "blue" | "amber" | "slate";
}

function MetricCard({ label, value, detail, tone = "slate" }: MetricCardProps) {
  const toneStyles = {
    emerald: "border-emerald-200 bg-emerald-50/70 text-emerald-900",
    blue: "border-blue-200 bg-blue-50/70 text-blue-900",
    amber: "border-amber-200 bg-amber-50/70 text-amber-950",
    slate: "border-slate-200 bg-white text-slate-950",
  };
  return (
    <article className={`rounded-2xl border p-4 shadow-sm ${toneStyles[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] opacity-70">
        {label}
      </p>
      <p className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">{value}</p>
      {detail ? <p className="mt-1 text-xs opacity-70">{detail}</p> : null}
    </article>
  );
}

function DashboardLoading() {
  return (
    <div aria-label="Cargando dashboard" aria-live="polite" className="space-y-6">
      <div className="h-40 animate-pulse rounded-3xl bg-slate-200" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {Array.from({ length: 10 }, (_, index) => (
          <div className="h-28 animate-pulse rounded-2xl bg-slate-200" key={index} />
        ))}
      </div>
      <span className="sr-only">Cargando métricas operativas...</span>
    </div>
  );
}

function SalesChart({ points }: { points: SalesTrendPoint[] }) {
  const maximum = Math.max(...points.map((point) => point.total), 0);
  const hasSales = maximum > 0;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="sales-chart-title">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Tendencia</p>
        <h3 className="mt-1 text-lg font-bold text-slate-950" id="sales-chart-title">Ventas por día</h3>
      </div>
      {!hasSales ? (
        <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
          No hay ventas completadas en este período.
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto pb-2">
          <div className="flex h-56 min-w-max items-end gap-2 border-b border-slate-200 px-1" role="img" aria-label="Gráfica de monto vendido por día">
            {points.map((point) => {
              const height = point.total > 0 ? Math.max(6, (point.total / maximum) * 100) : 2;
              return (
                <div className="flex w-12 flex-col items-center justify-end gap-2" key={point.date}>
                  <span className="text-[10px] font-semibold text-slate-500">{point.total > 0 ? formatMoney(point.total) : ""}</span>
                  <div
                    aria-label={`${point.label}: ${formatMoney(point.total)}`}
                    className="w-8 rounded-t-lg bg-emerald-600 transition-[height]"
                    style={{ height: `${height}%`, minHeight: "4px" }}
                    title={`${point.label}: ${formatMoney(point.total)}`}
                  />
                  <span className="pb-2 text-[10px] text-slate-500">{point.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

function AlertList({ alerts }: { alerts: DashboardAlert[] }) {
  const styles = {
    critical: "border-red-200 bg-red-50 text-red-900",
    warning: "border-amber-200 bg-amber-50 text-amber-950",
    info: "border-blue-200 bg-blue-50 text-blue-900",
  };
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="alerts-title">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">Atención</p>
      <h3 className="mt-1 text-lg font-bold text-slate-950" id="alerts-title">Alertas operativas</h3>
      {alerts.length === 0 ? (
        <p className="mt-5 rounded-xl bg-emerald-50 p-4 text-sm font-medium text-emerald-900">No hay alertas operativas pendientes.</p>
      ) : (
        <ul className="mt-5 space-y-3">
          {alerts.map((alert) => (
            <li className={`rounded-xl border p-4 ${styles[alert.severity]}`} key={alert.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold">{alert.title}</p>
                  <p className="mt-1 text-xs leading-5 opacity-80">{alert.description}</p>
                </div>
                <span className="rounded-full bg-white/80 px-2.5 py-1 text-sm font-black">{alert.count}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ActivityList({ activity }: { activity: RecentActivityItem[] }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="activity-title">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-700">Operación</p>
      <h3 className="mt-1 text-lg font-bold text-slate-950" id="activity-title">Actividad reciente</h3>
      {activity.length === 0 ? (
        <p className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">Todavía no hay actividad visible.</p>
      ) : (
        <ol className="mt-5 divide-y divide-slate-100">
          {activity.map((item) => (
            <li className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0" key={item.id}>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{item.title}</p>
                <p className="mt-0.5 text-xs text-slate-500">{item.description}</p>
                <time className="mt-1 block text-[11px] text-slate-400" dateTime={item.occurredAt.toISOString()}>{formatDashboardDate(item.occurredAt)}</time>
              </div>
              {item.amount !== undefined ? <span className="shrink-0 text-sm font-bold text-slate-800">{formatMoney(item.amount)}</span> : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function Rankings({ data }: { data: DashboardData }) {
  const { topProducts, topClients } = data.metrics.sales;
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="top-products-title">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-violet-700">Productos</p>
        <h3 className="mt-1 text-lg font-bold text-slate-950" id="top-products-title">Top productos vendidos</h3>
        {topProducts.length === 0 ? <p className="mt-5 text-sm text-slate-500">Sin productos vendidos en el período.</p> : (
          <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[420px] text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase text-slate-500"><tr><th className="pb-3">Producto</th><th className="pb-3 text-right">Unidades</th><th className="pb-3 text-right">Monto</th></tr></thead><tbody className="divide-y divide-slate-100">{topProducts.map((item) => <tr key={item.productId}><td className="py-3 pr-3"><p className="font-semibold text-slate-900">{item.name}</p><p className="font-mono text-xs text-slate-500">{item.sku}</p></td><td className="py-3 text-right font-semibold">{INTEGER_FORMATTER.format(item.units)}</td><td className="py-3 text-right font-bold">{formatMoney(item.amount)}</td></tr>)}</tbody></table></div>
        )}
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="top-clients-title">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-700">Clientes</p>
        <h3 className="mt-1 text-lg font-bold text-slate-950" id="top-clients-title">Top clientes</h3>
        {topClients.length === 0 ? <p className="mt-5 text-sm text-slate-500">Sin clientes con ventas en el período.</p> : (
          <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[400px] text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase text-slate-500"><tr><th className="pb-3">Cliente</th><th className="pb-3 text-right">Ventas</th><th className="pb-3 text-right">Total</th></tr></thead><tbody className="divide-y divide-slate-100">{topClients.map((item) => <tr key={item.clientId}><td className="py-3 pr-3 font-semibold text-slate-900">{item.name}</td><td className="py-3 text-right">{item.salesCount}</td><td className="py-3 text-right font-bold">{formatMoney(item.total)}</td></tr>)}</tbody></table></div>
        )}
      </section>
    </div>
  );
}

function PrimaryMetrics({ data }: { data: DashboardData }) {
  const { clients, inventory, paymentProofs, purchases, replenishments, sales } = data.metrics;
  if (data.role === "admin") {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <MetricCard label="Ventas del período" value={sales.salesCount} tone="emerald" />
        <MetricCard label="Monto vendido" value={formatMoney(sales.totalSold)} tone="emerald" />
        <MetricCard label="Descuento total" value={formatMoney(sales.totalDiscount)} detail={`Ticket promedio ${formatMoney(sales.averageTicket)}`} tone="amber" />
        <MetricCard label="Compras recibidas" value={purchases.receivedCount} detail={`${purchases.unitsReceived} unidades`} tone="blue" />
        <MetricCard label="Monto comprado" value={formatMoney(purchases.totalPurchased)} tone="blue" />
        <MetricCard label="Reposiciones en tránsito" value={replenishments.inTransitCount} />
        <MetricCard label="Stock empresa" value={INTEGER_FORMATTER.format(inventory.companyUnits)} detail="Unidades" />
        <MetricCard label="Stock agentes" value={INTEGER_FORMATTER.format(inventory.agentUnits)} detail="Unidades" />
        <MetricCard label="Comprobantes pendientes" value={paymentProofs.providedCount} tone="amber" />
        <MetricCard label="Clientes activos" value={clients.activeCount} detail={`${clients.createdInPeriodCount} creados en período`} />
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
      <MetricCard label="Mis ventas" value={sales.salesCount} tone="emerald" />
      <MetricCard label="Mi monto vendido" value={formatMoney(sales.totalSold)} tone="emerald" />
      <MetricCard label="Mi descuento" value={formatMoney(sales.totalDiscount)} detail={`Ticket promedio ${formatMoney(sales.averageTicket)}`} tone="amber" />
      <MetricCard label="Mi stock" value={INTEGER_FORMATTER.format(inventory.ownUnits)} detail="Unidades" />
      <MetricCard label="Reposiciones en tránsito" value={replenishments.inTransitCount} tone="blue" />
      <MetricCard label="Comprobantes por atender" value={paymentProofs.providedCount + paymentProofs.rejectedCount} detail={`${paymentProofs.rejectedCount} rechazados`} tone="amber" />
      <MetricCard label="Clientes activos visibles" value={clients.activeCount} />
    </div>
  );
}

function SecondaryMetrics({ data }: { data: DashboardData }) {
  const { inventory, paymentProofs, replenishments, sales } = data.metrics;
  return (
    <section aria-labelledby="secondary-metrics-title">
      <h3 className="sr-only" id="secondary-metrics-title">Indicadores secundarios</h3>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="Stock bajo" value={inventory.lowStockCount} detail="Incluye agotados" />
        <MetricCard label="Sin stock" value={inventory.outOfStockCount} />
        <MetricCard label="Reposiciones recibidas" value={replenishments.receivedInPeriodCount} />
        {data.role === "admin" ? <MetricCard label="Reposiciones pendientes" value={replenishments.pendingCount} /> : null}
        <MetricCard label="Comprobantes verificados" value={paymentProofs.verifiedInPeriodCount} />
        <MetricCard label="Ventas anuladas" value={sales.cancelledCount} detail="No incluidas en el neto" />
      </div>
    </section>
  );
}

export function DashboardContent() {
  const { profile, user } = useAuth();
  const [periodKey, setPeriodKey] = useState<DashboardPeriodKey>("last30");
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile || !user) return;
    setLoading(true);
    setError(null);
    try {
      setData(
        await getDashboardData({
          role: profile.role,
          actorUid: user.uid,
          periodKey,
        }),
      );
    } catch (cause) {
      setError(getDashboardErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [periodKey, profile, user]);

  useEffect(() => {
    let ignore = false;
    if (!profile || !user) return;
    getDashboardData({ role: profile.role, actorUid: user.uid, periodKey })
      .then((nextData) => {
        if (!ignore) setData(nextData);
      })
      .catch((cause: unknown) => {
        if (!ignore) setError(getDashboardErrorMessage(cause));
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [periodKey, profile, user]);

  const periodDescription = useMemo(
    () => (data ? formatPeriodRange(data.period) : ""),
    [data],
  );

  if (!profile || !user) return null;
  if (loading && !data) return <DashboardLoading />;

  return (
    <section className="space-y-6" aria-labelledby="dashboard-title">
      <div className="overflow-hidden rounded-3xl bg-slate-950 px-5 py-7 text-white shadow-xl shadow-slate-200 sm:px-8 sm:py-9">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">Vista operativa · {profile.role === "admin" ? "Global" : "Personal"}</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl" id="dashboard-title">Dashboard</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Métricas calculadas desde ventas, compras, inventario, reposiciones, clientes y comprobantes existentes.</p>
            {periodDescription ? <p className="mt-2 text-xs font-medium text-slate-400">{periodDescription}</p> : null}
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-300" htmlFor="dashboard-period">Período</label>
              <select className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/30 sm:w-48" id="dashboard-period" onChange={(event) => { setData(null); setError(null); setLoading(true); setPeriodKey(event.target.value as DashboardPeriodKey); }} value={periodKey}>
                {DASHBOARD_PERIOD_OPTIONS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
              </select>
            </div>
            <button className="rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:opacity-60" disabled={loading} onClick={() => void load()} type="button">{loading ? "Actualizando..." : "Actualizar"}</button>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-900" role="alert">
          <p className="font-bold">No se pudieron cargar las métricas</p>
          <p className="mt-1 text-sm">{error}</p>
          <button className="mt-4 rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-red-400" onClick={() => void load()} type="button">Reintentar</button>
        </div>
      ) : null}

      {data ? (
        <>
          <PrimaryMetrics data={data} />
          <SecondaryMetrics data={data} />
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.8fr)]">
            <SalesChart points={data.metrics.sales.trend} />
            <AlertList alerts={data.alerts} />
          </div>
          <Rankings data={data} />
          <div className="grid gap-6 xl:grid-cols-2">
            <ActivityList activity={data.activity} />
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="period-summary-title">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Resumen</p>
              <h3 className="mt-1 text-lg font-bold text-slate-950" id="period-summary-title">Detalle del período</h3>
              <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
                <div className="rounded-xl bg-slate-50 p-4"><dt className="text-xs text-slate-500">Subtotal vendido</dt><dd className="mt-1 font-bold text-slate-950">{formatMoney(data.metrics.sales.subtotal)}</dd></div>
                <div className="rounded-xl bg-slate-50 p-4"><dt className="text-xs text-slate-500">Ticket promedio</dt><dd className="mt-1 font-bold text-slate-950">{formatMoney(data.metrics.sales.averageTicket)}</dd></div>
                <div className="rounded-xl bg-slate-50 p-4"><dt className="text-xs text-slate-500">Comprobantes rechazados</dt><dd className="mt-1 font-bold text-slate-950">{data.metrics.paymentProofs.rejectedCount}</dd></div>
                <div className="rounded-xl bg-slate-50 p-4"><dt className="text-xs text-slate-500">Clientes creados</dt><dd className="mt-1 font-bold text-slate-950">{data.metrics.clients.createdInPeriodCount}</dd></div>
              </dl>
              <p className="mt-5 text-xs leading-5 text-slate-500">Actualizado {formatDashboardDate(data.generatedAt)}. El stock bajo usa cantidad ≤ stock mínimo; con mínimo 0 solo una cantidad 0 genera alerta.</p>
            </section>
          </div>
        </>
      ) : null}
    </section>
  );
}
