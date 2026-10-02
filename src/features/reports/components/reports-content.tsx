"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { PageHeader, SectionCard, StatCard } from "@/components";
import { useAuth } from "@/features/auth";
import { STOCK_STATUS_LABELS } from "@/features/inventory/utils/inventory-utils";
import { PURCHASE_STATUS_LABELS } from "@/features/purchases/utils/purchase-utils";
import { REPLENISHMENT_STATUS_LABELS } from "@/features/replenishments/utils/replenishment-utils";
import {
  formatMoney,
  getSalePayments,
  PAYMENT_METHOD_LABELS,
  SaleDetailDialog,
} from "@/features/sales";

import { getReportsData, getReportsErrorMessage } from "../services/reports.service";
import type {
  ClientReportRow,
  InventoryReportRow,
  PaymentReportRow,
  ProductReportRow,
  PurchaseReportRow,
  ReplenishmentReportRow,
  ReportPeriodKey,
  ReportsData,
  ReportTab,
  SalesReportRow,
} from "../types/report.types";
import { formatReportPeriod, REPORT_PERIOD_OPTIONS } from "../utils/report-utils";
import { DailyProductReportView } from "./daily-product-report";

const INTEGER = new Intl.NumberFormat("es-PE");
const DATE = new Intl.DateTimeFormat("es-PE", { dateStyle: "short", timeStyle: "short" });
const REPORT_TABS: Array<{ id: ReportTab; label: string; adminOnly?: boolean }> = [
  { id: "sales", label: "Ventas" },
  { id: "dailyProducts", label: "Diario por producto" },
  { id: "products", label: "Productos" },
  { id: "clients", label: "Clientes" },
  { id: "payments", label: "Pagos" },
  { id: "inventory", label: "Inventario" },
  { id: "replenishments", label: "Reposiciones" },
  { id: "purchases", label: "Compras", adminOnly: true },
];

interface ReportColumn<T> {
  align?: "left" | "right";
  csv?: (row: T) => number | string;
  key: string;
  label: string;
  render: (row: T) => ReactNode;
}

function ReportTable<T>({ columns, empty, rows }: { columns: ReportColumn<T>[]; empty: string; rows: T[] }) {
  if (!rows.length) return <EmptyState text={empty} />;
  return (
    <>
      <div className="hidden w-full overflow-x-auto rounded-xl border border-slate-200 lg:block">
        <table className="w-full min-w-[70rem] text-left text-sm">
          <thead><tr>{columns.map((column) => <th className={`px-3 py-3 ${column.align === "right" ? "text-right" : ""}`} key={column.key} scope="col">{column.label}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">{rows.map((row, index) => <tr key={(row as { id?: string }).id ?? index}>{columns.map((column) => <td className={`px-3 py-3 align-top ${column.align === "right" ? "text-right" : ""}`} key={column.key}>{column.render(row)}</td>)}</tr>)}</tbody>
        </table>
      </div>
      <div className="grid gap-3 lg:hidden">
        {rows.map((row, index) => (
          <article className="rounded-xl border border-slate-200 bg-white p-4" key={(row as { id?: string }).id ?? index}>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              {columns.map((column, columnIndex) => (
                <div className={columnIndex === 0 ? "col-span-2" : "min-w-0"} key={column.key}>
                  <dt className="text-xs font-medium text-slate-500">{column.label}</dt>
                  <dd className="mt-1 break-words text-sm font-semibold text-slate-900">{column.render(row)}</dd>
                </div>
              ))}
            </dl>
          </article>
        ))}
      </div>
    </>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500">{text}</div>;
}

function StatusBadge({ children, tone = "neutral" }: { children: ReactNode; tone?: "success" | "warning" | "danger" | "blue" | "neutral" }) {
  const tones = {
    success: "bg-emerald-100 text-emerald-800",
    warning: "bg-amber-100 text-amber-900",
    danger: "bg-red-100 text-red-800",
    blue: "bg-blue-100 text-blue-800",
    neutral: "bg-slate-100 text-slate-700",
  };
  return <span className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}

function ReportChart({ points }: { points: ReportsData["sales"]["trend"] }) {
  const max = Math.max(...points.map((point) => point.total), 0);
  if (!max) return <EmptyState text="No hay ventas completadas para graficar." />;
  return (
    <div className="grid h-56 items-end gap-1 pt-5 sm:gap-2" role="img" aria-label="Monto vendido por día" style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}>
      {points.map((point, index) => (
        <div className="flex h-full min-w-0 flex-col items-center justify-end gap-2" key={point.date}>
          <div aria-label={`${point.label}: ${formatMoney(point.total)}`} className="w-full max-w-9 rounded-t bg-emerald-600" style={{ height: `${Math.max(2, (point.total / max) * 100)}%` }} title={`${point.label}: ${formatMoney(point.total)}`} />
          <span className={`max-w-full truncate text-[9px] text-slate-500 ${points.length <= 14 || index % 5 === 0 || index === points.length - 1 ? "" : "invisible"}`}>{point.label}</span>
        </div>
      ))}
    </div>
  );
}

const SALES_EXPORT_COLUMNS: ReportColumn<SalesReportRow>[] = [
  { key: "date", label: "Fecha", render: (row) => DATE.format(row.createdAt), csv: (row) => DATE.format(row.createdAt) },
  { key: "number", label: "Venta", render: (row) => <strong>{row.number}</strong>, csv: (row) => row.number },
  { key: "client", label: "Cliente", render: (row) => row.client, csv: (row) => row.client },
  { key: "agent", label: "Agente", render: (row) => row.agent, csv: (row) => row.agent },
  { key: "units", label: "Unidades", align: "right", render: (row) => row.units, csv: (row) => row.units },
  { key: "products", label: "Productos", render: (row) => row.sale.items.map((item) => `${item.name} x${item.quantity}`).join(" | "), csv: (row) => row.sale.items.map((item) => `${item.name} x${item.quantity}`).join(" | ") },
  { key: "subtotal", label: "Subtotal", align: "right", render: (row) => formatMoney(row.subtotal), csv: (row) => (row.subtotal / 100).toFixed(2) },
  { key: "discount", label: "Descuento", align: "right", render: (row) => formatMoney(row.discount), csv: (row) => (row.discount / 100).toFixed(2) },
  { key: "total", label: "Total", align: "right", render: (row) => <strong>{formatMoney(row.total)}</strong>, csv: (row) => (row.total / 100).toFixed(2) },
  { key: "payment", label: "Pago", render: (row) => row.payment, csv: (row) => row.payment },
  { key: "status", label: "Estado", render: (row) => <StatusBadge tone={row.status === "completed" ? "success" : "neutral"}>{row.status === "completed" ? "Completada" : "Anulada"}</StatusBadge>, csv: (row) => row.status },
];

function getSalesTableColumns(onView: (row: SalesReportRow) => void): ReportColumn<SalesReportRow>[] {
  return [
    ...SALES_EXPORT_COLUMNS.filter((column) => column.key !== "products").map((column) =>
      column.key === "number"
        ? {
            ...column,
            render: (row: SalesReportRow) => (
              <button
                className="font-bold text-emerald-800 underline-offset-4 hover:underline"
                onClick={() => onView(row)}
                type="button"
              >
                {row.number}
              </button>
            ),
          }
        : column,
    ),
    {
      key: "action",
      label: "Acción",
      render: (row) => (
        <button
          className="whitespace-nowrap rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700"
          onClick={() => onView(row)}
          type="button"
        >
          Ver detalle
        </button>
      ),
    },
  ];
}

function SalesReportView({ actorUid, data }: { actorUid: string; data: ReportsData }) {
  const report = data.sales;
  const [selectedSale, setSelectedSale] = useState<SalesReportRow | null>(null);
  const columns = useMemo(() => getSalesTableColumns(setSelectedSale), []);
  return <><div className="space-y-5"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><StatCard label="Ventas" symbol="VT" value={report.count} /><StatCard label="Venta bruta" symbol="SB" value={formatMoney(report.gross)} tone="brand" /><StatCard label="Descuentos" symbol="DS" value={formatMoney(report.discount)} tone="amber" /><StatCard label="Venta neta" symbol="SN" value={formatMoney(report.net)} tone="brand" /><StatCard label="Ticket promedio" symbol="TP" value={formatMoney(report.averageTicket)} detail={`${report.units} unidades · ${report.cancelledCount} anuladas`} /></div><div className="grid gap-5 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]"><SectionCard title="Ventas por día" titleId="report-sales-chart"><ReportChart points={report.trend} /></SectionCard><SectionCard title="Detalle de ventas" titleId="report-sales-table"><ReportTable columns={columns} empty="No hay ventas en el período seleccionado." rows={report.rows} /></SectionCard></div></div>{selectedSale ? <SaleDetailDialog actorUid={actorUid} agentLabel={selectedSale.agent} onClose={() => setSelectedSale(null)} readOnly role={data.role} sale={selectedSale.sale} /> : null}</>;
}

const PRODUCT_COLUMNS: ReportColumn<ProductReportRow>[] = [
  { key: "product", label: "Producto", render: (row) => <><strong className="block">{row.name}</strong><span className="font-mono text-xs text-slate-500">{row.sku}</span></>, csv: (row) => row.name },
  { key: "sku", label: "SKU", render: (row) => row.sku, csv: (row) => row.sku },
  { key: "units", label: "Unidades", align: "right", render: (row) => row.units, csv: (row) => row.units },
  { key: "sales", label: "Ventas", align: "right", render: (row) => row.salesCount, csv: (row) => row.salesCount },
  { key: "net", label: "Venta neta", align: "right", render: (row) => <strong>{formatMoney(row.net)}</strong>, csv: (row) => (row.net / 100).toFixed(2) },
  { key: "discount", label: "Descuento", align: "right", render: (row) => formatMoney(row.discount), csv: (row) => (row.discount / 100).toFixed(2) },
];

function ProductsReportView({ data }: { data: ReportsData }) {
  const [sort, setSort] = useState<"units" | "net">("units");
  const rows = useMemo(() => [...data.products].sort((a, b) => b[sort] - a[sort]), [data.products, sort]);
  const top = rows.slice(0, 6);
  const max = Math.max(...top.map((row) => row[sort]), 0);
  return <div className="space-y-5"><div className="grid gap-3 sm:grid-cols-3"><StatCard label="Productos vendidos" symbol="PR" value={data.products.length} /><StatCard label="Unidades" symbol="UN" value={data.products.reduce((sum, row) => sum + row.units, 0)} tone="blue" /><StatCard label="Venta neta" symbol="S/" value={formatMoney(data.products.reduce((sum, row) => sum + row.net, 0))} tone="brand" /></div><div className="grid gap-5 xl:grid-cols-[minmax(18rem,0.65fr)_minmax(0,1.35fr)]"><SectionCard title="Ranking" titleId="report-products-ranking"><div className="mb-4 flex gap-2" data-print-hide><button className={`rounded-lg px-3 py-2 text-xs font-semibold ${sort === "units" ? "bg-emerald-700 text-white" : "border border-slate-300 bg-white"}`} onClick={() => setSort("units")} type="button">Por unidades</button><button className={`rounded-lg px-3 py-2 text-xs font-semibold ${sort === "net" ? "bg-emerald-700 text-white" : "border border-slate-300 bg-white"}`} onClick={() => setSort("net")} type="button">Por monto</button></div>{top.length ? <ol className="space-y-3">{top.map((row) => <li key={row.productId}><div className="flex justify-between gap-3 text-sm"><span className="truncate font-semibold">{row.name}</span><strong>{sort === "units" ? row.units : formatMoney(row.net)}</strong></div><div className="mt-1.5 h-2 overflow-hidden rounded bg-slate-100"><div className="h-full rounded bg-emerald-600" style={{ width: `${max ? (row[sort] / max) * 100 : 0}%` }} /></div></li>)}</ol> : <EmptyState text="No hay productos vendidos." />}</SectionCard><SectionCard title="Detalle por producto" titleId="report-products-table"><ReportTable columns={PRODUCT_COLUMNS} empty="No hay productos vendidos en el período." rows={rows} /></SectionCard></div></div>;
}

const CLIENT_COLUMNS: ReportColumn<ClientReportRow>[] = [
  { key: "client", label: "Cliente", render: (row) => <><strong className="block">{row.name}</strong><span className="text-xs text-slate-500">{row.document}</span></>, csv: (row) => row.name },
  { key: "document", label: "Documento", render: (row) => row.document, csv: (row) => row.document },
  { key: "purchases", label: "Compras", align: "right", render: (row) => row.purchases, csv: (row) => row.purchases },
  { key: "units", label: "Unidades", align: "right", render: (row) => row.units, csv: (row) => row.units },
  { key: "total", label: "Monto comprado", align: "right", render: (row) => <strong>{formatMoney(row.total)}</strong>, csv: (row) => (row.total / 100).toFixed(2) },
  { key: "ticket", label: "Ticket promedio", align: "right", render: (row) => formatMoney(row.averageTicket), csv: (row) => (row.averageTicket / 100).toFixed(2) },
  { key: "last", label: "Última compra", render: (row) => DATE.format(row.lastPurchaseAt), csv: (row) => DATE.format(row.lastPurchaseAt) },
];

function ClientsReportView({ data }: { data: ReportsData }) {
  const total = data.clients.reduce((sum, row) => sum + row.total, 0);
  return <div className="space-y-5"><div className="grid gap-3 sm:grid-cols-3"><StatCard label="Clientes con compras" symbol="CL" value={data.clients.length} /><StatCard label="Compras" symbol="VT" value={data.clients.reduce((sum, row) => sum + row.purchases, 0)} /><StatCard label="Monto comprado" symbol="S/" value={formatMoney(total)} tone="brand" /></div><SectionCard title="Clientes del período" titleId="report-clients-table"><ReportTable columns={CLIENT_COLUMNS} empty="No hay clientes con compras en este período." rows={data.clients} /></SectionCard></div>;
}

const PAYMENT_COLUMNS: ReportColumn<PaymentReportRow>[] = [
  { key: "method", label: "Método", render: (row) => <strong>{PAYMENT_METHOD_LABELS[row.method]}</strong>, csv: (row) => PAYMENT_METHOD_LABELS[row.method] },
  { key: "sales", label: "Ventas", align: "right", render: (row) => row.salesCount, csv: (row) => row.salesCount },
  { key: "amount", label: "Monto atribuido", align: "right", render: (row) => <strong>{formatMoney(row.amount)}</strong>, csv: (row) => (row.amount / 100).toFixed(2) },
  { key: "percentage", label: "Participación", align: "right", render: (row) => `${row.percentage.toFixed(1)}%`, csv: (row) => row.percentage.toFixed(2) },
];

function PaymentsReportView({ data }: { data: ReportsData }) {
  const total = data.payments.reduce((sum, row) => sum + row.amount, 0);
  return <div className="space-y-5"><div className="grid gap-3 sm:grid-cols-3"><StatCard label="Métodos utilizados" symbol="MP" value={data.payments.length} /><StatCard label="Monto distribuido" symbol="S/" value={formatMoney(total)} tone="brand" /><StatCard label="Ventas completadas" symbol="VT" value={data.sales.count} /></div><div className="grid gap-5 xl:grid-cols-[minmax(18rem,0.65fr)_minmax(0,1.35fr)]"><SectionCard title="Distribución" titleId="report-payments-chart">{data.payments.length ? <div className="space-y-4">{data.payments.map((row) => <div key={row.method}><div className="flex justify-between gap-3 text-sm"><strong>{PAYMENT_METHOD_LABELS[row.method]}</strong><span>{row.percentage.toFixed(1)}%</span></div><div className="mt-1.5 h-2 overflow-hidden rounded bg-slate-100"><div className="h-full rounded bg-emerald-600" style={{ width: `${row.percentage}%` }} /></div></div>)}</div> : <EmptyState text="No hay pagos en el período." />}</SectionCard><SectionCard title="Detalle por método" titleId="report-payments-table"><ReportTable columns={PAYMENT_COLUMNS} empty="No hay métodos de pago para mostrar." rows={data.payments.map((row) => ({ ...row, id: row.method }))} /></SectionCard></div></div>;
}

const INVENTORY_COLUMNS: ReportColumn<InventoryReportRow>[] = [
  { key: "product", label: "Producto", render: (row) => <><strong className="block">{row.name}</strong><span className="font-mono text-xs text-slate-500">{row.sku}</span></>, csv: (row) => row.name },
  { key: "owner", label: "Propietario", render: (row) => row.owner, csv: (row) => row.owner },
  { key: "initial", label: "Stock inicial", align: "right", render: (row) => row.initialStock, csv: (row) => row.initialStock },
  { key: "entries", label: "Entradas", align: "right", render: (row) => row.entries, csv: (row) => row.entries },
  { key: "sold", label: "Vendido", align: "right", render: (row) => row.sold, csv: (row) => row.sold },
  { key: "exits", label: "Otras salidas", align: "right", render: (row) => row.otherExits, csv: (row) => row.otherExits },
  { key: "current", label: "Stock actual", align: "right", render: (row) => <strong>{row.currentStock}</strong>, csv: (row) => row.currentStock },
  { key: "minimum", label: "Stock mínimo", align: "right", render: (row) => row.minimumStock, csv: (row) => row.minimumStock },
  { key: "status", label: "Estado", render: (row) => <StatusBadge tone={row.status === "available" ? "success" : row.status === "low" ? "warning" : row.status === "out" ? "danger" : "neutral"}>{STOCK_STATUS_LABELS[row.status]}</StatusBadge>, csv: (row) => STOCK_STATUS_LABELS[row.status] },
];

function InventoryReportView({ data }: { data: ReportsData }) {
  const total = data.inventory.reduce((sum, row) => sum + row.currentStock, 0);
  return <div className="space-y-5"><div className="grid gap-3 sm:grid-cols-3"><StatCard label="Registros" symbol="IN" value={data.inventory.length} /><StatCard label="Stock actual" symbol="UN" value={INTEGER.format(total)} tone="brand" /><StatCard label="Alertas de stock" symbol="AL" value={data.inventory.filter((row) => row.status === "low" || row.status === "out").length} tone="amber" /></div><SectionCard description="Snapshot actual; el stock proviene directamente de inventory.quantity" title="Inventario por propietario" titleId="report-inventory-table"><ReportTable columns={INVENTORY_COLUMNS} empty="No hay inventario visible para este usuario." rows={data.inventory} /></SectionCard></div>;
}

const REPLENISHMENT_COLUMNS: ReportColumn<ReplenishmentReportRow>[] = [
  { key: "number", label: "Número", render: (row) => <strong>{row.number}</strong>, csv: (row) => row.number },
  { key: "origin", label: "Origen", render: (row) => row.origin === "agent_request" ? "Solicitud de agente" : "Administración", csv: (row) => row.origin },
  { key: "agent", label: "Agente", render: (row) => row.agent, csv: (row) => row.agent },
  { key: "created", label: "Creación", render: (row) => DATE.format(row.createdAt), csv: (row) => DATE.format(row.createdAt) },
  { key: "status", label: "Estado", render: (row) => <StatusBadge tone={row.status === "received" ? "success" : row.status === "sent" ? "blue" : row.status === "pending" ? "warning" : "neutral"}>{REPLENISHMENT_STATUS_LABELS[row.status]}</StatusBadge>, csv: (row) => REPLENISHMENT_STATUS_LABELS[row.status] },
  { key: "items", label: "Productos", align: "right", render: (row) => row.items, csv: (row) => row.items },
  { key: "units", label: "Unidades", align: "right", render: (row) => row.units, csv: (row) => row.units },
  { key: "sent", label: "Envío", render: (row) => row.sentAt ? DATE.format(row.sentAt) : "Sin envío", csv: (row) => row.sentAt ? DATE.format(row.sentAt) : "" },
  { key: "received", label: "Recepción", render: (row) => row.receivedAt ? DATE.format(row.receivedAt) : "Sin recepción", csv: (row) => row.receivedAt ? DATE.format(row.receivedAt) : "" },
];

function ReplenishmentsReportView({ data }: { data: ReportsData }) {
  const report = data.replenishments;
  return <div className="space-y-5"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><StatCard label="Reposiciones" symbol="RP" value={report.total} /><StatCard label="Pendientes" symbol="PE" value={report.pending} tone="amber" /><StatCard label="Enviadas" symbol="EN" value={report.sent} tone="blue" /><StatCard label="Recibidas" symbol="RE" value={report.received} tone="brand" /><StatCard label="Unidades recibidas" symbol="UN" value={report.unitsReceived} detail={`${report.unitsRequested} solicitadas · ${report.unitsSent} enviadas`} /></div><SectionCard title="Detalle de reposiciones" titleId="report-replenishments-table"><ReportTable columns={REPLENISHMENT_COLUMNS} empty="No hay reposiciones en el período." rows={report.rows} /></SectionCard></div>;
}

const PURCHASE_COLUMNS: ReportColumn<PurchaseReportRow>[] = [
  { key: "number", label: "Número", render: (row) => <strong>{row.number}</strong>, csv: (row) => row.number },
  { key: "date", label: "Fecha", render: (row) => DATE.format(row.createdAt), csv: (row) => DATE.format(row.createdAt) },
  { key: "supplier", label: "Proveedor", render: (row) => row.supplier, csv: (row) => row.supplier },
  { key: "items", label: "Productos", align: "right", render: (row) => row.items, csv: (row) => row.items },
  { key: "units", label: "Unidades", align: "right", render: (row) => row.units, csv: (row) => row.units },
  { key: "total", label: "Total", align: "right", render: (row) => <strong>{formatMoney(row.total)}</strong>, csv: (row) => (row.total / 100).toFixed(2) },
  { key: "status", label: "Estado", render: (row) => <StatusBadge tone={row.status === "received" ? "success" : row.status === "draft" ? "warning" : "neutral"}>{PURCHASE_STATUS_LABELS[row.status]}</StatusBadge>, csv: (row) => PURCHASE_STATUS_LABELS[row.status] },
  { key: "received", label: "Recepción", render: (row) => row.receivedAt ? DATE.format(row.receivedAt) : "Sin recepción", csv: (row) => row.receivedAt ? DATE.format(row.receivedAt) : "" },
];

function PurchasesReportView({ data }: { data: ReportsData }) {
  const report = data.purchases;
  if (!report) return null;
  return <div className="space-y-5"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><StatCard label="Compras recibidas" symbol="CR" value={report.received} tone="brand" /><StatCard label="Monto comprado" symbol="S/" value={formatMoney(report.total)} tone="brand" /><StatCard label="Unidades recibidas" symbol="UN" value={report.unitsReceived} /><StatCard label="Borradores / canceladas" symbol="BC" value={`${report.draft} / ${report.cancelled}`} tone="amber" /><StatCard label="Proveedores utilizados" symbol="PV" value={report.suppliers} /></div><SectionCard title="Detalle de compras" titleId="report-purchases-table"><ReportTable columns={PURCHASE_COLUMNS} empty="No hay compras en el período." rows={report.rows} /></SectionCard></div>;
}

interface SaleDetailExportRow {
  item: SalesReportRow["sale"]["items"][number];
  row: SalesReportRow;
}

const SALES_DETAIL_EXPORT_COLUMNS: ReportColumn<SaleDetailExportRow>[] = [
  { key: "client", label: "Cliente", render: ({ row }) => row.client, csv: ({ row }) => row.client },
  { key: "document", label: "Documento", render: ({ row }) => `${row.sale.clientSnapshot.documentType} ${row.sale.clientSnapshot.documentNumber}`, csv: ({ row }) => `${row.sale.clientSnapshot.documentType} ${row.sale.clientSnapshot.documentNumber}` },
  { key: "agent", label: "Agente", render: ({ row }) => row.agent, csv: ({ row }) => row.agent },
  { key: "sale", label: "Número de venta", render: ({ row }) => row.number, csv: ({ row }) => row.number },
  { key: "date", label: "Fecha", render: ({ row }) => DATE.format(row.createdAt), csv: ({ row }) => DATE.format(row.createdAt) },
  { key: "product", label: "Producto", render: ({ item }) => item.name, csv: ({ item }) => item.name },
  { key: "sku", label: "SKU", render: ({ item }) => item.sku, csv: ({ item }) => item.sku },
  { key: "quantity", label: "Cantidad", render: ({ item }) => item.quantity, csv: ({ item }) => item.quantity },
  { key: "price", label: "Precio unitario histórico", render: ({ item }) => formatMoney(item.unitPrice), csv: ({ item }) => (item.unitPrice / 100).toFixed(2) },
  { key: "lineSubtotal", label: "Subtotal línea", render: ({ item }) => formatMoney(item.lineSubtotal), csv: ({ item }) => (item.lineSubtotal / 100).toFixed(2) },
  { key: "lineDiscount", label: "Descuento línea", render: ({ item }) => formatMoney(item.discountAmount), csv: ({ item }) => (item.discountAmount / 100).toFixed(2) },
  { key: "globalDiscount", label: "Descuento global de la venta", render: ({ row }) => formatMoney(row.sale.globalDiscountAmount), csv: ({ row }) => (row.sale.globalDiscountAmount / 100).toFixed(2) },
  { key: "lineTotal", label: "Total línea", render: ({ item }) => formatMoney(item.lineTotal), csv: ({ item }) => (item.lineTotal / 100).toFixed(2) },
  { key: "saleTotal", label: "Total venta", render: ({ row }) => formatMoney(row.total), csv: ({ row }) => (row.total / 100).toFixed(2) },
  { key: "payments", label: "Formas de pago", render: ({ row }) => getSalePayments(row.sale).map((payment) => `${PAYMENT_METHOD_LABELS[payment.method]} ${formatMoney(payment.amount)}${payment.reference ? ` (${payment.reference})` : ""}`).join(" | "), csv: ({ row }) => getSalePayments(row.sale).map((payment) => `${PAYMENT_METHOD_LABELS[payment.method]} ${(payment.amount / 100).toFixed(2)}${payment.reference ? ` (${payment.reference})` : ""}`).join(" | ") },
  { key: "status", label: "Estado", render: ({ row }) => row.status, csv: ({ row }) => row.status },
];

function csvEscape(value: number | string): string {
  const text = String(value);
  return /[";,\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function downloadCsv<T>(name: string, columns: ReportColumn<T>[], rows: T[]) {
  const lines = [columns.map((column) => csvEscape(column.label)).join(";"), ...rows.map((row) => columns.map((column) => csvEscape(column.csv?.(row) ?? "")).join(";"))];
  const blob = new Blob(["\uFEFF", lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function exportActiveReport(tab: ReportTab, data: ReportsData) {
  if (tab === "sales") return downloadCsv("reporte-ventas", SALES_EXPORT_COLUMNS, data.sales.rows);
  if (tab === "products") return downloadCsv("reporte-productos", PRODUCT_COLUMNS, data.products);
  if (tab === "clients") return downloadCsv("reporte-clientes", CLIENT_COLUMNS, data.clients);
  if (tab === "payments") return downloadCsv("reporte-pagos", PAYMENT_COLUMNS, data.payments.map((row) => ({ ...row, id: row.method })));
  if (tab === "inventory") return downloadCsv("reporte-inventario", INVENTORY_COLUMNS, data.inventory);
  if (tab === "replenishments") return downloadCsv("reporte-reposiciones", REPLENISHMENT_COLUMNS, data.replenishments.rows);
  if (data.purchases) return downloadCsv("reporte-compras", PURCHASE_COLUMNS, data.purchases.rows);
}

function exportSalesDetail(data: ReportsData) {
  const rows = data.sales.rows.flatMap((row) =>
    row.sale.items.map((item) => ({ item, row })),
  );
  return downloadCsv("reporte-ventas-detalle", SALES_DETAIL_EXPORT_COLUMNS, rows);
}

function hasTabData(tab: ReportTab, data: ReportsData): boolean {
  if (tab === "dailyProducts") return false;
  if (tab === "sales") return data.sales.rows.length > 0;
  if (tab === "products") return data.products.length > 0;
  if (tab === "clients") return data.clients.length > 0;
  if (tab === "payments") return data.payments.length > 0;
  if (tab === "inventory") return data.inventory.length > 0;
  if (tab === "replenishments") return data.replenishments.rows.length > 0;
  return Boolean(data.purchases?.rows.length);
}

export function ReportsContent() {
  const { profile, user } = useAuth();
  const [periodKey, setPeriodKey] = useState<ReportPeriodKey>("last30");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [activeTab, setActiveTab] = useState<ReportTab>("sales");
  const [data, setData] = useState<ReportsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const tabs = useMemo(() => REPORT_TABS.filter((tab) => !tab.adminOnly || profile?.role === "admin"), [profile?.role]);
  const load = useCallback(async () => {
    if (!profile || !user) return;
    setLoading(true);
    setError(null);
    try {
      setData(await getReportsData({ actorDisplayName: profile.displayName, actorUid: user.uid, role: profile.role, periodKey, startDate, endDate }));
    } catch (cause) {
      setError(getReportsErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [endDate, periodKey, profile, startDate, user]);

  useEffect(() => {
    if (!profile || !user) return;

    let cancelled = false;

    void getReportsData({
      actorDisplayName: profile.displayName,
      actorUid: user.uid,
      periodKey: "last30",
      role: profile.role,
    })
      .then((nextData) => {
        if (!cancelled) {
          setData(nextData);
          setError(null);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(getReportsErrorMessage(cause));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [profile, user]);
  if (!profile || !user) return null;

  return (
    <section aria-label="Reportes" className="reports-page space-y-5">
      <PageHeader context={activeTab === "dailyProducts" ? `${profile.role === "admin" ? "Vista global" : "Vista personal"} · Matriz mensual` : data ? `${profile.role === "admin" ? "Vista global" : "Vista personal"} · ${formatReportPeriod(data.period)}` : profile.role === "admin" ? "Vista global" : "Vista personal"} description="Consulta información histórica y exporta únicamente los datos autorizados para tu rol." title="Reportes" />

      {activeTab !== "dailyProducts" ? <SectionCard className="reports-controls" title="Período y acciones" titleId="reports-filters-title">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(12rem,1fr)_minmax(10rem,0.75fr)_minmax(10rem,0.75fr)_auto] xl:items-end">
          <label className="text-sm font-semibold text-slate-700">Período<select className="mt-1.5 w-full" onChange={(event) => setPeriodKey(event.target.value as ReportPeriodKey)} value={periodKey}>{REPORT_PERIOD_OPTIONS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select></label>
          <label className="text-sm font-semibold text-slate-700">Desde<input className="mt-1.5 w-full" disabled={periodKey !== "custom"} onChange={(event) => setStartDate(event.target.value)} type="date" value={startDate} /></label>
          <label className="text-sm font-semibold text-slate-700">Hasta<input className="mt-1.5 w-full" disabled={periodKey !== "custom"} onChange={(event) => setEndDate(event.target.value)} type="date" value={endDate} /></label>
          <div className="flex flex-wrap gap-2">
            <button className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60" disabled={loading} onClick={() => void load()} type="button">{loading ? "Actualizando..." : "Actualizar"}</button>
            <button className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold disabled:opacity-50" disabled={!data || !hasTabData(activeTab, data)} onClick={() => data && exportActiveReport(activeTab, data)} type="button">{activeTab === "sales" ? "CSV resumen" : "Exportar CSV"}</button>
            {activeTab === "sales" ? <button className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold disabled:opacity-50" disabled={!data?.sales.rows.length} onClick={() => data && exportSalesDetail(data)} type="button">CSV detalle</button> : null}
            <button className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold disabled:opacity-50" disabled={!data} onClick={() => window.print()} type="button">Imprimir</button>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">El rango personalizado admite hasta 366 días. Los reportes son consultas puntuales y no crean métricas persistentes.</p>
      </SectionCard> : null}

      <nav aria-label="Tipos de reporte" className="reports-tabs flex gap-2 overflow-x-auto pb-1" data-print-hide>{tabs.map((tab) => <button aria-current={activeTab === tab.id ? "page" : undefined} className={`shrink-0 rounded-lg px-4 py-2.5 text-sm font-semibold ${activeTab === tab.id ? "bg-slate-950 text-white" : "border border-slate-300 bg-white text-slate-700"}`} key={tab.id} onClick={() => setActiveTab(tab.id)} type="button">{tab.label}</button>)}</nav>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-900" role="alert"><p className="font-bold">No se pudo generar el reporte</p><p className="mt-1 text-sm">{error}</p></div> : null}
      {loading && !data ? <div aria-live="polite" className="grid gap-3 sm:grid-cols-3"><div className="h-28 animate-pulse rounded-xl bg-slate-200" /><div className="h-28 animate-pulse rounded-xl bg-slate-200" /><div className="h-28 animate-pulse rounded-xl bg-slate-200" /></div> : null}

      {data ? <div className="reports-print-area"><div className="reports-print-heading hidden"><h1>Reporte de {tabs.find((tab) => tab.id === activeTab)?.label}</h1><p>{formatReportPeriod(data.period)} · Generado {DATE.format(data.generatedAt)}</p></div>{activeTab === "sales" ? <SalesReportView actorUid={user.uid} data={data} /> : activeTab === "dailyProducts" ? <DailyProductReportView actorDisplayName={profile.displayName} actorUid={user.uid} agents={data.agents} role={profile.role} /> : activeTab === "products" ? <ProductsReportView data={data} /> : activeTab === "clients" ? <ClientsReportView data={data} /> : activeTab === "payments" ? <PaymentsReportView data={data} /> : activeTab === "inventory" ? <InventoryReportView data={data} /> : activeTab === "replenishments" ? <ReplenishmentsReportView data={data} /> : <PurchasesReportView data={data} />}</div> : null}
    </section>
  );
}
