import type {
  DashboardPeriod,
  DashboardPeriodKey,
} from "../types/dashboard.types";

export const DASHBOARD_PERIOD_OPTIONS: readonly {
  key: DashboardPeriodKey;
  label: string;
}[] = [
  { key: "today", label: "Hoy" },
  { key: "last7", label: "Últimos 7 días" },
  { key: "last30", label: "Últimos 30 días" },
  { key: "thisMonth", label: "Este mes" },
  { key: "previousMonth", label: "Mes anterior" },
];

function startOfLocalDay(value: Date): Date {
  return new Date(
    value.getFullYear(),
    value.getMonth(),
    value.getDate(),
    0,
    0,
    0,
    0,
  );
}

function endOfLocalDay(value: Date): Date {
  return new Date(
    value.getFullYear(),
    value.getMonth(),
    value.getDate(),
    23,
    59,
    59,
    999,
  );
}

export function getDashboardPeriod(
  key: DashboardPeriodKey,
  now = new Date(),
): DashboardPeriod {
  const option = DASHBOARD_PERIOD_OPTIONS.find((item) => item.key === key);
  const today = startOfLocalDay(now);
  let start = today;
  let end = now;

  if (key === "last7") {
    start = new Date(today);
    start.setDate(start.getDate() - 6);
  } else if (key === "last30") {
    start = new Date(today);
    start.setDate(start.getDate() - 29);
  } else if (key === "thisMonth") {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (key === "previousMonth") {
    start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    end = endOfLocalDay(new Date(now.getFullYear(), now.getMonth(), 0));
  }

  return {
    key,
    label: option?.label ?? "Período",
    start,
    end,
  };
}

export function isDateInPeriod(date: Date, period: DashboardPeriod): boolean {
  const timestamp = date.getTime();
  return timestamp >= period.start.getTime() && timestamp <= period.end.getTime();
}

export function toLocalDateKey(value: Date): string {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0"),
  ].join("-");
}

export function listPeriodDays(period: DashboardPeriod): Date[] {
  const days: Date[] = [];
  const cursor = startOfLocalDay(period.start);
  const lastDay = startOfLocalDay(period.end);

  while (cursor.getTime() <= lastDay.getTime()) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
}

export function formatDashboardDate(value: Date): string {
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export function formatPeriodRange(period: DashboardPeriod): string {
  const formatter = new Intl.DateTimeFormat("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  return `${formatter.format(period.start)} – ${formatter.format(period.end)}`;
}
