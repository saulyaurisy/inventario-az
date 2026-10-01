"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { PageHeader, SectionCard, StatCard } from "@/components";
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

interface OperationalMetricProps {
  label: string;
  value: string | number;
  detail?: string;
}

function OperationalMetric({ label, value, detail }: OperationalMetricProps) {
  return (
    <div className="min-w-0 border-b border-slate-100 py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:px-4 sm:first:pl-0 sm:last:border-r-0 sm:last:pr-0">
      <p className="text-xs font-medium leading-5 text-slate-500">{label}</p>
      <p className="tabular-data mt-1 text-lg font-bold text-slate-950">{value}</p>
      {detail ? <p className="mt-0.5 text-xs text-slate-500">{detail}</p> : null}
    </div>
  );
}

function DashboardLoading() {
  return (
    <div aria-label="Cargando dashboard" aria-live="polite" className="space-y-6">
      <div className="h-28 animate-pulse rounded-[1.125rem] bg-slate-200" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
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
    <SectionCard description="Monto vendido durante el período seleccionado" title="Ventas por día" titleId="sales-chart-title">
      {!hasSales ? (
        <div className="flex min-h-60 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 text-center text-sm text-slate-500">
          No hay ventas completadas en este período.
        </div>
      ) : (
        <div className="relative pt-7">
          <div className="pointer-events-none absolute inset-x-0 bottom-8 top-7 flex flex-col justify-between" aria-hidden="true">
            <span className="border-t border-dashed border-slate-200" />
            <span className="border-t border-dashed border-slate-200" />
            <span className="border-t border-slate-200" />
          </div>
          <div
            className="relative grid h-56 items-end gap-1 sm:gap-2"
            role="img"
            aria-label="Gráfica de monto vendido por día"
            style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}
          >
            {points.map((point, index) => {
              const height = point.total > 0 ? Math.max(6, (point.total / maximum) * 100) : 2;
              const showCompactLabel = points.length <= 14 || index % 5 === 0 || index === points.length - 1;
              return (
                <div className="group flex h-full min-w-0 flex-col items-center justify-end gap-2" key={point.date}>
                  <span className="hidden max-w-full truncate text-[10px] font-semibold text-slate-600 xl:block">{point.total > 0 ? `S/${Math.round(point.total)}` : ""}</span>
                  <div
                    aria-label={`${point.label}: ${formatMoney(point.total)}`}
                    className="w-full max-w-8 rounded-t-md bg-emerald-600 shadow-[inset_0_1px_0_rgb(255_255_255_/_0.24)] transition-colors group-hover:bg-emerald-700"
                    style={{ height: `${height}%`, minHeight: "4px" }}
                    title={`${point.label}: ${formatMoney(point.total)}`}
                  />
                  <span className={`h-6 max-w-full truncate text-[9px] text-slate-500 sm:text-[10px] ${showCompactLabel ? "" : "invisible sm:visible"}`}>{point.label.split("-")[0]}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </SectionCard>
  );
}

function AlertList({ alerts }: { alerts: DashboardAlert[] }) {
  const styles = {
    critical: "border-red-200 bg-red-50 text-red-900",
    warning: "border-amber-200 bg-amber-50 text-amber-950",
    info: "border-blue-200 bg-blue-50 text-blue-900",
  };
  return (
    <SectionCard description="Situaciones que requieren atención" title="Alertas operativas" titleId="alerts-title">
      {alerts.length === 0 ? (
        <p className="rounded-xl bg-emerald-50 p-4 text-sm font-medium text-emerald-900">No hay alertas operativas pendientes.</p>
      ) : (
        <ul className="space-y-2">
          {alerts.map((alert) => (
            <li className={`rounded-lg border px-3 py-3 ${styles[alert.severity]}`} key={alert.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold">{alert.title}</p>
                  <p className="mt-1 text-xs leading-5 opacity-80">{alert.description}</p>
                </div>
                <span className="rounded-md bg-white/80 px-2.5 py-1 text-sm font-bold tabular-nums">{alert.count}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function ActivityList({ activity }: { activity: RecentActivityItem[] }) {
  return (
    <SectionCard description="Últimos movimientos visibles para tu rol" title="Actividad reciente" titleId="activity-title">
      {activity.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">Todavía no hay actividad visible.</p>
      ) : (
        <ol className="divide-y divide-slate-100">
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
    </SectionCard>
  );
}

function Rankings({ data }: { data: DashboardData }) {
  const { topProducts, topClients } = data.metrics.sales;
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <SectionCard description="Productos con mayor volumen en el período" title="Productos más vendidos" titleId="top-products-title">
        {topProducts.length === 0 ? <p className="text-sm text-slate-500">Sin productos vendidos en el período.</p> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[420px] text-left text-sm"><thead className="border-b border-slate-200 text-xs text-slate-500"><tr><th className="pb-3">Producto</th><th className="pb-3 text-right">Unidades</th><th className="pb-3 text-right">Monto</th></tr></thead><tbody className="divide-y divide-slate-100">{topProducts.map((item) => <tr key={item.productId}><td className="py-3 pr-3"><p className="font-semibold text-slate-900">{item.name}</p><p className="font-mono text-xs text-slate-500">{item.sku}</p></td><td className="py-3 text-right font-semibold">{INTEGER_FORMATTER.format(item.units)}</td><td className="py-3 text-right font-bold">{formatMoney(item.amount)}</td></tr>)}</tbody></table></div>
        )}
      </SectionCard>
      <SectionCard description="Clientes con mayor valor comprado" title="Clientes principales" titleId="top-clients-title">
        {topClients.length === 0 ? <p className="text-sm text-slate-500">Sin clientes con ventas en el período.</p> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[400px] text-left text-sm"><thead className="border-b border-slate-200 text-xs text-slate-500"><tr><th className="pb-3">Cliente</th><th className="pb-3 text-right">Ventas</th><th className="pb-3 text-right">Total</th></tr></thead><tbody className="divide-y divide-slate-100">{topClients.map((item) => <tr key={item.clientId}><td className="py-3 pr-3 font-semibold text-slate-900">{item.name}</td><td className="py-3 text-right">{item.salesCount}</td><td className="py-3 text-right font-bold">{formatMoney(item.total)}</td></tr>)}</tbody></table></div>
        )}
      </SectionCard>
    </div>
  );
}

function PrimaryMetrics({ data }: { data: DashboardData }) {
  const { inventory, purchases, replenishments, sales } = data.metrics;
  if (data.role === "admin") {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Ventas" symbol="VT" value={sales.salesCount} detail={`${formatMoney(sales.averageTicket)} por venta`} tone="brand" />
        <StatCard label="Monto vendido" symbol="S/" value={formatMoney(sales.totalSold)} detail="Ventas completadas" tone="brand" />
        <StatCard label="Monto comprado" symbol="CP" value={formatMoney(purchases.totalPurchased)} detail={`${purchases.receivedCount} compras recibidas`} tone="blue" />
        <StatCard label="Stock total" symbol="UN" value={INTEGER_FORMATTER.format(inventory.companyUnits + inventory.agentUnits)} detail={`${INTEGER_FORMATTER.format(inventory.companyUnits)} empresa · ${INTEGER_FORMATTER.format(inventory.agentUnits)} agentes`} />
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Mis ventas" symbol="VT" value={sales.salesCount} detail={`${formatMoney(sales.averageTicket)} por venta`} tone="brand" />
      <StatCard label="Monto vendido" symbol="S/" value={formatMoney(sales.totalSold)} detail={`${formatMoney(sales.totalDiscount)} en descuentos`} tone="brand" />
      <StatCard label="Mi stock" symbol="UN" value={INTEGER_FORMATTER.format(inventory.ownUnits)} detail="Unidades disponibles" />
      <StatCard label="Reposiciones en tránsito" symbol="RP" value={replenishments.inTransitCount} detail="Pendientes de recepción" tone="blue" />
    </div>
  );
}

function SecondaryMetrics({ data }: { data: DashboardData }) {
  const { clients, paymentProofs, purchases, replenishments, sales } = data.metrics;
  return (
    <SectionCard className="py-3" title="Operación del período" titleId="secondary-metrics-title">
      <div className="grid sm:grid-cols-2 xl:grid-cols-5">
        <OperationalMetric label="Descuento total" value={formatMoney(sales.totalDiscount)} />
        {data.role === "admin" ? <OperationalMetric label="Compras recibidas" value={purchases.receivedCount} detail={`${purchases.unitsReceived} unidades`} /> : null}
        <OperationalMetric label="Reposiciones en tránsito" value={replenishments.inTransitCount} detail={`${replenishments.receivedInPeriodCount} recibidas`} />
        <OperationalMetric label="Comprobantes pendientes" value={paymentProofs.providedCount} detail={`${paymentProofs.rejectedCount} rechazados`} />
        <OperationalMetric label="Clientes activos" value={clients.activeCount} detail={`${clients.createdInPeriodCount} nuevos`} />
      </div>
    </SectionCard>
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
    <section className="space-y-5" aria-labelledby="dashboard-title">
      <PageHeader
        actions={(
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="text-xs font-semibold text-slate-600" htmlFor="dashboard-period">
              Período
              <select className="mt-1.5 w-full min-w-44 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 sm:w-48" id="dashboard-period" onChange={(event) => { setData(null); setError(null); setLoading(true); setPeriodKey(event.target.value as DashboardPeriodKey); }} value={periodKey}>
                {DASHBOARD_PERIOD_OPTIONS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
              </select>
            </label>
            <button className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-600 disabled:opacity-60" disabled={loading} onClick={() => void load()} type="button">{loading ? "Actualizando..." : "Actualizar"}</button>
          </div>
        )}
        context={`${profile.role === "admin" ? "Vista global" : "Vista personal"}${periodDescription ? ` · ${periodDescription}` : ""}`}
        description="Ventas, compras, inventario, reposiciones, clientes y comprobantes en una sola vista."
        title="Dashboard"
      />

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
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(19rem,0.7fr)]">
            <SalesChart points={data.metrics.sales.trend} />
            <AlertList alerts={data.alerts} />
          </div>
          <Rankings data={data} />
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)]">
            <ActivityList activity={data.activity} />
            <SectionCard description={`Actualizado ${formatDashboardDate(data.generatedAt)}`} title="Detalle del período" titleId="period-summary-title">
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-slate-50 p-4"><dt className="text-xs text-slate-500">Subtotal vendido</dt><dd className="mt-1 font-bold text-slate-950">{formatMoney(data.metrics.sales.subtotal)}</dd></div>
                <div className="rounded-xl bg-slate-50 p-4"><dt className="text-xs text-slate-500">Ticket promedio</dt><dd className="mt-1 font-bold text-slate-950">{formatMoney(data.metrics.sales.averageTicket)}</dd></div>
                <div className="rounded-xl bg-slate-50 p-4"><dt className="text-xs text-slate-500">Comprobantes rechazados</dt><dd className="mt-1 font-bold text-slate-950">{data.metrics.paymentProofs.rejectedCount}</dd></div>
                <div className="rounded-xl bg-slate-50 p-4"><dt className="text-xs text-slate-500">Clientes creados</dt><dd className="mt-1 font-bold text-slate-950">{data.metrics.clients.createdInPeriodCount}</dd></div>
              </dl>
              <p className="mt-4 text-xs leading-5 text-slate-500">El stock bajo usa cantidad ≤ stock mínimo; con mínimo 0 solo una cantidad 0 genera alerta.</p>
            </SectionCard>
          </div>
        </>
      ) : null}
    </section>
  );
}
