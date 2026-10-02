import type { Product } from "@/features/products";
import type { Sale } from "@/features/sales";

import type {
  DailyProductMetric,
  DailyProductPeriodKey,
  DailyProductReport,
  DailyProductReportRow,
} from "../types/report.types";

interface DailyProductPeriod {
  end: Date;
  label: string;
  start: Date;
}

function parseMonth(value: string): { month: number; year: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  const year = Number(match?.[1]);
  const month = Number(match?.[2]) - 1;
  if (!match || year < 2000 || month < 0 || month > 11) {
    throw new Error("Invalid daily report period");
  }
  return { year, month };
}

function parseLocalDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error("Invalid daily report period");
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (
    date.getFullYear() !== Number(match[1]) ||
    date.getMonth() !== Number(match[2]) - 1 ||
    date.getDate() !== Number(match[3])
  ) {
    throw new Error("Invalid daily report period");
  }
  return date;
}

function endOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 23, 59, 59, 999);
}

export function toDailyDateKey(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

export function getDailyProductPeriod(
  monthValue: string,
  periodKey: DailyProductPeriodKey,
  customStart?: string,
  customEnd?: string,
): DailyProductPeriod {
  const { year, month } = parseMonth(monthValue);
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);
  let start = monthStart;
  let end = monthEnd;

  if (periodKey === "firstHalf") {
    end = new Date(year, month, 15);
  } else if (periodKey === "secondHalf") {
    start = new Date(year, month, 16);
  } else if (periodKey === "custom") {
    if (!customStart || !customEnd) throw new Error("Invalid daily report period");
    start = parseLocalDate(customStart);
    end = parseLocalDate(customEnd);
    if (
      start > end ||
      start < monthStart ||
      end > monthEnd ||
      start.getMonth() !== month ||
      end.getMonth() !== month
    ) {
      throw new Error("Invalid daily report period");
    }
  }

  const formatter = new Intl.DateTimeFormat("es-PE", { month: "long", year: "numeric" });
  const monthLabel = formatter.format(monthStart);
  const prefix = periodKey === "firstHalf"
    ? "Primera quincena"
    : periodKey === "secondHalf"
      ? "Segunda quincena"
      : periodKey === "custom"
        ? "Rango personalizado"
        : "Mes completo";
  return {
    start,
    end: endOfDay(end),
    label: `${prefix} · ${monthLabel}`,
  };
}

export function buildDailyProductReport(
  sales: Sale[],
  products: Product[],
  agentLabels: Map<string, string>,
  period: DailyProductPeriod,
): DailyProductReport {
  const days: DailyProductReport["days"] = [];
  const cursor = new Date(period.start);
  while (cursor <= period.end) {
    days.push({
      date: toDailyDateKey(cursor),
      label: new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "short" }).format(cursor),
      shortLabel: String(cursor.getDate()).padStart(2, "0"),
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  const rows = new Map<string, DailyProductReportRow>();
  const rowKeyBySku = new Map<string, string>();
  for (const product of products) {
    rows.set(product.id, {
      productId: product.id,
      name: product.name,
      sku: product.sku,
      cells: {},
      totalAmount: 0,
      totalUnits: 0,
    });
    rowKeyBySku.set(product.sku.trim().toLocaleUpperCase("es"), product.id);
  }
  const dayTotals: DailyProductReport["dayTotals"] = Object.fromEntries(
    days.map((day) => [day.date, { amount: 0, units: 0 }]),
  );

  for (const sale of sales) {
    const createdAt = sale.createdAt.toDate();
    if (sale.status !== "completed" || createdAt < period.start || createdAt > period.end) continue;
    const date = toDailyDateKey(createdAt);
    for (const item of sale.items) {
      const normalizedSku = item.sku.trim().toLocaleUpperCase("es");
      const rowKey = rows.has(item.productId)
        ? item.productId
        : rowKeyBySku.get(normalizedSku) ?? item.productId;
      const row = rows.get(rowKey) ?? {
        productId: item.productId,
        name: item.name,
        sku: item.sku,
        cells: {},
        totalAmount: 0,
        totalUnits: 0,
      };
      // A sold row keeps the historical snapshot rather than current catalogue text.
      row.name = item.name;
      row.sku = item.sku;
      const cell = row.cells[date] ?? { amount: 0, units: 0, contributions: [] };
      cell.units += item.quantity;
      cell.amount += item.lineTotal;
      cell.contributions.push({
        sale,
        item,
        agent: agentLabels.get(sale.agentId) ?? "Agente",
      });
      row.cells[date] = cell;
      row.totalUnits += item.quantity;
      row.totalAmount += item.lineTotal;
      rows.set(rowKey, row);
      rowKeyBySku.set(normalizedSku, rowKey);
      dayTotals[date].units += item.quantity;
      dayTotals[date].amount += item.lineTotal;
    }
  }

  return {
    ...period,
    generatedAt: new Date(),
    days,
    dayTotals,
    rows: [...rows.values()].sort(
      (a, b) => b.totalUnits - a.totalUnits || a.name.localeCompare(b.name, "es"),
    ),
  };
}

function safeFileLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function exportDailyProductReportExcel(
  report: DailyProductReport,
  metric: DailyProductMetric,
): Promise<void> {
  const XLSX = await import("xlsx");
  const header = ["Producto", "SKU", ...report.days.map((day) => day.shortLabel), "Total"];
  const rows: Array<Array<number | string>> = report.rows.map((row) => [
    row.name,
    row.sku,
    ...report.days.map((day) => {
      const cell = row.cells[day.date];
      return metric === "units" ? cell?.units ?? 0 : (cell?.amount ?? 0) / 100;
    }),
    metric === "units" ? row.totalUnits : row.totalAmount / 100,
  ]);
  rows.push([
    "TOTAL DEL DÍA",
    "",
    ...report.days.map((day) => {
      const total = report.dayTotals[day.date];
      return metric === "units" ? total.units : total.amount / 100;
    }),
    metric === "units"
      ? report.rows.reduce((sum, row) => sum + row.totalUnits, 0)
      : report.rows.reduce((sum, row) => sum + row.totalAmount, 0) / 100,
  ]);

  const sheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
  sheet["!cols"] = [{ wch: 32 }, { wch: 16 }, ...report.days.map(() => ({ wch: 10 })), { wch: 14 }];
  sheet["!autofilter"] = { ref: `A1:${XLSX.utils.encode_col(header.length - 1)}${rows.length + 1}` };
  if (metric === "amount") {
    for (let row = 1; row <= rows.length; row += 1) {
      for (let column = 2; column < header.length; column += 1) {
        const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })];
        if (cell) cell.z = '"S/" #,##0.00';
      }
    }
  }
  const workbook = XLSX.utils.book_new();
  const monthName = report.label
    .replace(/^.+·\s*/, "")
    .replace(" de ", " ");
  const sheetName = `${monthName.charAt(0).toUpperCase()}${monthName.slice(1)}`.slice(0, 31);
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName || "Reporte diario");
  const contents = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  const url = URL.createObjectURL(new Blob([contents], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `reporte-diario-productos-${safeFileLabel(monthName)}.xlsx`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
