"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { SectionCard, StatCard } from "@/components";
import {
  formatMoney,
  getSalePayments,
  PAYMENT_METHOD_LABELS,
} from "@/features/sales";

import { getDailyProductReport, getReportsErrorMessage } from "../services/reports.service";
import type {
  DailyProductCell,
  DailyProductMetric,
  DailyProductPeriodKey,
  DailyProductReport,
  DailyProductReportRow,
} from "../types/report.types";
import { exportDailyProductReportExcel } from "../utils/daily-product-report-utils";

interface DailyProductReportViewProps {
  actorDisplayName: string;
  actorUid: string;
  agents: Array<{ displayName: string; uid: string }>;
  role: "admin" | "agent";
}

interface SelectedCell {
  cell: DailyProductCell;
  dayLabel: string;
  product: DailyProductReportRow;
}

const PERIOD_OPTIONS: Array<{ label: string; value: DailyProductPeriodKey }> = [
  { value: "month", label: "Mes completo" },
  { value: "firstHalf", label: "Primera quincena" },
  { value: "secondHalf", label: "Segunda quincena" },
  { value: "custom", label: "Personalizado" },
];

function currentMonthValue(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function monthBounds(month: string): { end: string; start: string } {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return { start: `${month}-01`, end: `${month}-${String(lastDay).padStart(2, "0")}` };
}

function CellDetailDialog({ metric, onClose, selected }: {
  metric: DailyProductMetric;
  onClose: () => void;
  selected: SelectedCell;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 backdrop-blur-sm sm:items-center sm:p-6">
      <section
        aria-labelledby="daily-cell-title"
        aria-modal="true"
        className="max-h-[94dvh] w-full max-w-5xl overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
        role="dialog"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white/95 px-5 py-5 backdrop-blur sm:px-7">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Detalle diario</p>
            <h2 className="mt-1 text-xl font-bold text-slate-950 sm:text-2xl" id="daily-cell-title">{selected.product.name}</h2>
            <p className="mt-1 text-sm text-slate-500">{selected.product.sku} · {selected.dayLabel} · {selected.cell.units} unidades · {formatMoney(selected.cell.amount)}</p>
          </div>
          <button aria-label="Cerrar detalle" className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-2xl text-slate-600" onClick={onClose} type="button">×</button>
        </header>

        <div className="grid gap-3 p-5 sm:p-7">
          {selected.cell.contributions.map(({ agent, item, sale }) => (
            <article className="rounded-2xl border border-slate-200 p-4" key={`${sale.id}-${item.productId}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-slate-950">{sale.number}</p>
                  <p className="mt-1 text-xs text-slate-500">{new Intl.DateTimeFormat("es-PE", { hour: "2-digit", minute: "2-digit" }).format(sale.createdAt.toDate())} · {sale.clientSnapshot.name} · {agent}</p>
                </div>
                <strong className="text-emerald-800">{metric === "units" ? `${item.quantity} unidades` : formatMoney(item.lineTotal)}</strong>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div><dt className="text-xs text-slate-500">Cantidad</dt><dd className="mt-1 font-semibold">{item.quantity}</dd></div>
                <div><dt className="text-xs text-slate-500">Precio histórico</dt><dd className="mt-1 font-semibold">{formatMoney(item.unitPrice)}</dd></div>
                <div><dt className="text-xs text-slate-500">Descuento línea</dt><dd className="mt-1 font-semibold text-red-700">{formatMoney(item.discountAmount)}</dd></div>
                <div><dt className="text-xs text-slate-500">Total línea</dt><dd className="mt-1 font-semibold">{formatMoney(item.lineTotal)}</dd></div>
              </dl>
              <div className="mt-4 border-t border-slate-100 pt-3">
                <p className="text-xs font-medium text-slate-500">Formas de pago</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {getSalePayments(sale).map((payment) => (
                    <span className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs text-slate-700" key={`${sale.id}-${payment.method}`}>
                      {PAYMENT_METHOD_LABELS[payment.method]} · {formatMoney(payment.amount)}{payment.reference ? ` · ${payment.reference}` : ""}
                    </span>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function metricValue(metric: DailyProductMetric, units: number, amount: number): string {
  return metric === "units" ? String(units) : formatMoney(amount);
}

export function DailyProductReportView({
  actorDisplayName,
  actorUid,
  agents,
  role,
}: DailyProductReportViewProps) {
  const initialMonth = currentMonthValue();
  const initialBounds = monthBounds(initialMonth);
  const [month, setMonth] = useState(initialMonth);
  const [periodKey, setPeriodKey] = useState<DailyProductPeriodKey>("month");
  const [customStart, setCustomStart] = useState(initialBounds.start);
  const [customEnd, setCustomEnd] = useState(initialBounds.end);
  const [agentId, setAgentId] = useState("");
  const [metric, setMetric] = useState<DailyProductMetric>("units");
  const [report, setReport] = useState<DailyProductReport | null>(null);
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);
  const [selectedMobileDay, setSelectedMobileDay] = useState("");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await getDailyProductReport({
        actorDisplayName,
        actorUid,
        role,
        month,
        periodKey,
        customStart,
        customEnd,
        ...(role === "admin" && agentId ? { agentId } : {}),
      });
      setReport(next);
      setSelectedMobileDay((current) => next.days.some((day) => day.date === current) ? current : next.days[0]?.date ?? "");
    } catch (cause) {
      setError(cause instanceof Error && cause.message === "Invalid daily report period"
        ? "Selecciona fechas válidas dentro del mes elegido."
        : getReportsErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [actorDisplayName, actorUid, agentId, customEnd, customStart, month, periodKey, role]);

  useEffect(() => {
    let cancelled = false;
    const initial = currentMonthValue();
    const bounds = monthBounds(initial);
    void getDailyProductReport({
      actorDisplayName,
      actorUid,
      role,
      month: initial,
      periodKey: "month",
      customStart: bounds.start,
      customEnd: bounds.end,
    })
      .then((next) => {
        if (cancelled) return;
        setReport(next);
        setSelectedMobileDay(next.days[0]?.date ?? "");
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(getReportsErrorMessage(cause));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [actorDisplayName, actorUid, role]);

  const overall = useMemo(() => {
    if (!report) return { amount: 0, units: 0, activeDays: 0 };
    return {
      amount: report.rows.reduce((sum, row) => sum + row.totalAmount, 0),
      units: report.rows.reduce((sum, row) => sum + row.totalUnits, 0),
      activeDays: report.days.filter((day) => report.dayTotals[day.date].units > 0).length,
    };
  }, [report]);

  const updateMonth = (value: string) => {
    setMonth(value);
    const bounds = monthBounds(value);
    setCustomStart(bounds.start);
    setCustomEnd(bounds.end);
  };

  const exportExcel = async () => {
    if (!report) return;
    setExporting(true);
    try {
      await exportDailyProductReportExcel(report, metric);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-5">
      <SectionCard className="reports-controls" description="La matriz se genera bajo demanda desde los ítems históricos de ventas completadas." title="Configuración de la matriz" titleId="daily-products-controls">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[repeat(4,minmax(10rem,1fr))_auto] xl:items-end">
          <label className="text-sm font-semibold text-slate-700">Período<select className="mt-1.5 w-full" onChange={(event) => setPeriodKey(event.target.value as DailyProductPeriodKey)} value={periodKey}>{PERIOD_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label className="text-sm font-semibold text-slate-700">Mes<input className="mt-1.5 w-full" onChange={(event) => updateMonth(event.target.value)} type="month" value={month} /></label>
          <label className="text-sm font-semibold text-slate-700">Métrica<select className="mt-1.5 w-full" onChange={(event) => setMetric(event.target.value as DailyProductMetric)} value={metric}><option value="units">Unidades vendidas</option><option value="amount">Monto vendido</option></select></label>
          {role === "admin" ? <label className="text-sm font-semibold text-slate-700">Agente<select className="mt-1.5 w-full" onChange={(event) => setAgentId(event.target.value)} value={agentId}><option value="">Todos</option>{agents.map((agent) => <option key={agent.uid} value={agent.uid}>{agent.displayName}</option>)}</select></label> : <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm"><span className="block text-xs font-medium text-slate-500">Alcance</span><strong className="mt-1 block text-slate-900">Solo mis ventas</strong></div>}
          <div className="flex flex-wrap gap-2 sm:col-span-2 xl:col-span-1">
            <button className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60" disabled={loading} onClick={() => void load()} type="button">{loading ? "Actualizando..." : "Actualizar"}</button>
            <button className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold disabled:opacity-50" disabled={!report || exporting} onClick={() => void exportExcel()} type="button">{exporting ? "Generando..." : "Exportar Excel"}</button>
          </div>
        </div>
        {periodKey === "custom" ? <div className="mt-4 grid gap-4 sm:max-w-xl sm:grid-cols-2"><label className="text-sm font-semibold text-slate-700">Desde<input className="mt-1.5 w-full" max={`${month}-31`} min={`${month}-01`} onChange={(event) => setCustomStart(event.target.value)} type="date" value={customStart} /></label><label className="text-sm font-semibold text-slate-700">Hasta<input className="mt-1.5 w-full" max={`${month}-31`} min={`${month}-01`} onChange={(event) => setCustomEnd(event.target.value)} type="date" value={customEnd} /></label></div> : null}
        <p className="mt-3 text-xs text-slate-500">Las ventas anuladas se excluyen. Esta versión es dinámica; un cierre mensual administrativo podrá añadirse en una issue futura.</p>
      </SectionCard>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900" role="alert">{error}</div> : null}
      {report ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Productos" symbol="PR" value={report.rows.length} />
            <StatCard label="Unidades vendidas" symbol="UN" value={overall.units} tone="blue" />
            <StatCard label="Monto vendido" symbol="S/" value={formatMoney(overall.amount)} tone="brand" />
            <StatCard detail={report.label} label="Días con ventas" symbol="D" value={`${overall.activeDays} / ${report.days.length}`} />
          </div>

          <SectionCard description={`${report.label}. Selecciona una celda con ventas para ver las operaciones que la componen.`} title="Ventas diarias por producto" titleId="daily-products-matrix">
            <div className="hidden max-w-full overflow-x-auto rounded-xl border border-slate-200 md:block">
              <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
                <thead className="sticky top-0 z-20 bg-slate-50">
                  <tr>
                    <th className="sticky left-0 z-30 min-w-64 border-b border-r border-slate-200 bg-slate-50 px-4 py-3 text-left" scope="col">Producto</th>
                    {report.days.map((day) => <th className="min-w-20 border-b border-slate-200 px-3 py-3 text-center" key={day.date} scope="col"><span className="block">{day.shortLabel}</span><span className="text-[10px] font-normal text-slate-400">{day.label.replace(/^\d+\s/, "")}</span></th>)}
                    <th className="min-w-28 border-b border-l border-slate-200 px-4 py-3 text-right" scope="col">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((row) => (
                    <tr key={row.productId}>
                      <th className="sticky left-0 z-10 border-b border-r border-slate-100 bg-white px-4 py-3 text-left" scope="row"><span className="block font-semibold text-slate-950">{row.name}</span><span className="font-mono text-xs font-normal text-slate-500">{row.sku}</span></th>
                      {report.days.map((day) => {
                        const cell = row.cells[day.date];
                        return <td className="border-b border-slate-100 px-2 py-2 text-center tabular-nums" key={day.date}>{cell ? <button aria-label={`Ver ${row.name}, ${day.label}`} className="min-w-14 rounded-lg bg-emerald-50 px-2 py-2 font-semibold text-emerald-800 hover:bg-emerald-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700" onClick={() => setSelectedCell({ cell, product: row, dayLabel: day.label })} type="button">{metricValue(metric, cell.units, cell.amount)}</button> : <span className="text-slate-400">0</span>}</td>;
                      })}
                      <td className="border-b border-l border-slate-100 px-4 py-3 text-right font-bold tabular-nums">{metricValue(metric, row.totalUnits, row.totalAmount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-950 text-white">
                  <tr><th className="sticky left-0 z-10 border-r border-slate-700 bg-slate-950 px-4 py-3 text-left" scope="row">TOTAL DEL DÍA</th>{report.days.map((day) => <td className="px-3 py-3 text-center font-bold tabular-nums" key={day.date}>{metricValue(metric, report.dayTotals[day.date].units, report.dayTotals[day.date].amount)}</td>)}<td className="border-l border-slate-700 px-4 py-3 text-right font-bold">{metricValue(metric, overall.units, overall.amount)}</td></tr>
                </tfoot>
              </table>
            </div>

            <div className="md:hidden">
              <label className="text-sm font-semibold text-slate-700">Día<select className="mt-1.5 w-full" onChange={(event) => setSelectedMobileDay(event.target.value)} value={selectedMobileDay}>{report.days.map((day) => <option key={day.date} value={day.date}>{day.label}</option>)}</select></label>
              <div className="mt-4 grid gap-3">
                {report.rows.map((row) => {
                  const cell = row.cells[selectedMobileDay];
                  return <article className="rounded-xl border border-slate-200 p-4" key={row.productId}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold text-slate-950">{row.name}</p><p className="mt-0.5 font-mono text-xs text-slate-500">{row.sku}</p></div><strong className={cell ? "text-emerald-800" : "text-slate-400"}>{metricValue(metric, cell?.units ?? 0, cell?.amount ?? 0)}</strong></div>{cell ? <button className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700" onClick={() => setSelectedCell({ cell, product: row, dayLabel: report.days.find((day) => day.date === selectedMobileDay)?.label ?? selectedMobileDay })} type="button">Ver detalle</button> : null}</article>;
                })}
              </div>
            </div>
          </SectionCard>
        </>
      ) : loading ? <div className="h-40 animate-pulse rounded-2xl bg-slate-200" aria-live="polite" /> : null}

      {selectedCell ? <CellDetailDialog metric={metric} onClose={() => setSelectedCell(null)} selected={selectedCell} /> : null}
    </div>
  );
}
