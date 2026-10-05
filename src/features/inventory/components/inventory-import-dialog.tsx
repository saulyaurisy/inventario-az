"use client";

import { useMemo, useRef, useState } from "react";

import type { Product } from "@/features/products";

import {
  getInventoryImportErrorMessage,
  importInventoryRows,
} from "../services/inventory-import.service";
import type {
  InventoryImportAction,
  InventoryImportDestination,
  InventoryImportPreviewRow,
  InventoryImportSummary,
} from "../types/inventory-import.types";
import type { InventoryAgent, InventoryRecord } from "../types/inventory.types";
import {
  buildInventoryImportPreview,
  downloadInventoryImportTemplate,
  INVENTORY_IMPORT_ACCEPT,
  parseInventoryImportFile,
} from "../utils/inventory-import-utils";

type Step = "file" | "preview" | "confirm" | "result";

interface InventoryImportDialogProps {
  actorUid: string;
  agents: InventoryAgent[];
  inventory: InventoryRecord[];
  onClose: () => void;
  onImported: (destination: InventoryImportDestination) => Promise<void>;
  products: Product[];
}

const STEP_LABELS: { key: Step; label: string }[] = [
  { key: "file", label: "Archivo" },
  { key: "preview", label: "Vista previa" },
  { key: "confirm", label: "Confirmar" },
  { key: "result", label: "Resultado" },
];

function statusForRow(row: InventoryImportPreviewRow) {
  if (row.errors.length > 0) return "Error";
  if (row.productState === "new") return "Nuevo";
  if (row.action === "adjust" && row.difference !== 0) return "Ajustará stock";
  if (row.currentStock === null) return "Inventario nuevo";
  return row.action === "no_change" ? "Sin cambios" : "Existente";
}

function statusClass(row: InventoryImportPreviewRow) {
  if (row.errors.length > 0) return "bg-red-100 text-red-800";
  if (row.productState === "new" || row.currentStock === null) {
    return "bg-blue-100 text-blue-800";
  }
  if (row.action === "adjust" && row.difference !== 0) {
    return "bg-amber-100 text-amber-900";
  }
  return "bg-slate-100 text-slate-700";
}

function numberOrDash(value: number | null) {
  return value === null ? "—" : value;
}

export function InventoryImportDialog({
  actorUid,
  agents,
  inventory,
  onClose,
  onImported,
  products,
}: InventoryImportDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("file");
  const [destinationType, setDestinationType] = useState<"company" | "agent">("company");
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const [rows, setRows] = useState<InventoryImportPreviewRow[]>([]);
  const [reading, setReading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [summary, setSummary] = useState<InventoryImportSummary | null>(null);
  const selectedAgent = agents.find((agent) => agent.uid === selectedAgentId);
  const destination = useMemo<InventoryImportDestination | null>(() => {
    if (destinationType === "company") {
      return { ownerType: "company", ownerId: "company" };
    }
    return selectedAgent
      ? { ownerType: "agent", ownerId: selectedAgent.uid }
      : null;
  }, [destinationType, selectedAgent]);
  const destinationLabel = destinationType === "company"
    ? "Empresa"
    : selectedAgent
      ? `${selectedAgent.displayName} — ${selectedAgent.email}`
      : "Agente pendiente de selección";
  const currentStepIndex = STEP_LABELS.findIndex((item) => item.key === step);
  const criticalErrorCount = useMemo(
    () => rows.reduce((total, row) => total + row.errors.length, 0),
    [rows],
  );
  const newProducts = rows.filter((row) => row.productState === "new").length;
  const existingProducts = rows.length - newProducts;
  const stockAdjustments = rows.filter(
    (row) => row.action === "adjust" && row.difference !== 0,
  ).length;

  function resetPreparedImport() {
    setFileName("");
    setFileErrors([]);
    setRows([]);
    setSummary(null);
    setImportError(null);
    setProgress({ completed: 0, total: 0 });
    if (inputRef.current) inputRef.current.value = "";
  }

  function changeDestinationType(nextType: "company" | "agent") {
    setDestinationType(nextType);
    setSelectedAgentId("");
    resetPreparedImport();
  }

  function changeAgent(agentId: string) {
    setSelectedAgentId(agentId);
    resetPreparedImport();
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (!destination) {
      setFileErrors(["Selecciona un agente antes de cargar el archivo."]);
      return;
    }
    setReading(true);
    setFileErrors([]);
    setRows([]);
    setSummary(null);
    setImportError(null);
    setFileName(file.name);
    try {
      const parsed = await parseInventoryImportFile(file);
      setFileErrors(parsed.fileErrors);
      if (parsed.fileErrors.length === 0) {
        setRows(
          buildInventoryImportPreview(
            parsed.rows,
            products,
            inventory,
            destination,
          ),
        );
        setStep("preview");
      }
    } finally {
      setReading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function updateAction(rowId: string, action: InventoryImportAction) {
    setRows((current) =>
      current.map((row) => (row.id === rowId ? { ...row, action } : row)),
    );
  }

  async function handleImport() {
    if (criticalErrorCount > 0 || rows.length === 0 || !destination) return;
    setImporting(true);
    setImportError(null);
    setProgress({ completed: 0, total: rows.length });
    try {
      const result = await importInventoryRows(
        rows,
        destination,
        { uid: actorUid, role: "admin" },
        (completed, total) => setProgress({ completed, total }),
      );
      setSummary(result);
      setStep("result");
      if (result.rowsProcessed > 0) await onImported(destination);
    } catch (error) {
      setImportError(getInventoryImportErrorMessage(error));
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <section
        aria-labelledby="inventory-import-title"
        aria-modal="true"
        className="flex max-h-[96vh] w-full max-w-7xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
        role="dialog"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-5 sm:px-7">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
              {destinationType === "company" ? "Inventario de empresa" : "Inventario de agente"}
            </p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950" id="inventory-import-title">
              Importar inventario
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Revisa cada fila antes de aplicar cambios y conservar el Kardex.
            </p>
          </div>
          <button
            aria-label="Cerrar importación"
            className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-2xl text-slate-600 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
            disabled={importing}
            onClick={onClose}
            type="button"
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <div className="shrink-0 border-b border-slate-100 px-5 py-4 sm:px-7">
          <ol className="grid grid-cols-4 gap-2" aria-label="Progreso de importación">
            {STEP_LABELS.map((item, index) => (
              <li className="min-w-0" key={item.key}>
                <div className={`h-1.5 rounded-full ${index <= currentStepIndex ? "bg-emerald-600" : "bg-slate-200"}`} />
                <p className={`mt-2 truncate text-xs font-semibold ${index <= currentStepIndex ? "text-emerald-800" : "text-slate-400"}`}>
                  {index + 1}. {item.label}
                </p>
              </li>
            ))}
          </ol>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-7">
          {step === "file" ? (
            <div className="mx-auto max-w-3xl space-y-5">
              <fieldset className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
                <legend className="px-1 text-sm font-bold text-slate-950">
                  Destino del inventario
                </legend>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  El propietario se aplica a todas las filas del archivo y no modifica otros inventarios.
                </p>
                <div className="mt-4 grid grid-cols-2 gap-3" role="radiogroup">
                  {(["company", "agent"] as const).map((type) => {
                    const checked = destinationType === type;
                    return (
                      <label
                        className={`cursor-pointer rounded-xl border px-4 py-3 transition focus-within:ring-2 focus-within:ring-emerald-600 ${checked ? "border-emerald-600 bg-emerald-50 text-emerald-950" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
                        key={type}
                      >
                        <input
                          checked={checked}
                          className="sr-only"
                          name="inventory-import-destination"
                          onChange={() => changeDestinationType(type)}
                          type="radio"
                          value={type}
                        />
                        <span className="block text-sm font-bold">
                          {type === "company" ? "Empresa" : "Agente"}
                        </span>
                        <span className="mt-1 block text-xs leading-5 text-slate-500">
                          {type === "company"
                            ? "Inventario central de la empresa"
                            : "Inventario independiente de un agente"}
                        </span>
                      </label>
                    );
                  })}
                </div>
                {destinationType === "agent" ? (
                  <div className="mt-4">
                    <label className="text-sm font-semibold text-slate-800" htmlFor="inventory-import-agent">
                      Seleccionar agente
                    </label>
                    <select
                      className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                      id="inventory-import-agent"
                      onChange={(event) => changeAgent(event.target.value)}
                      required
                      value={selectedAgentId}
                    >
                      <option value="">Selecciona un agente</option>
                      {agents.map((agent) => (
                        <option key={agent.uid} value={agent.uid}>
                          {agent.displayName} — {agent.email}
                        </option>
                      ))}
                    </select>
                    {agents.length === 0 ? (
                      <p className="mt-2 text-sm font-medium text-amber-800">
                        No hay agentes activos disponibles para importar.
                      </p>
                    ) : null}
                  </div>
                ) : null}
                <div className="mt-4 rounded-xl bg-slate-950 px-4 py-3 text-sm text-white">
                  <span className="text-slate-300">Destino seleccionado:</span>{" "}
                  <strong>{destinationLabel}</strong>
                </div>
              </fieldset>
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center sm:p-10">
                <h3 className="text-lg font-bold text-slate-950">Selecciona tu archivo</h3>
                <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">
                  Formatos XLSX, XLS y CSV. Máximo 200 filas. Columnas obligatorias: SKU, Producto, Stock inicial y Stock mínimo.
                </p>
                <label className={`mt-5 inline-flex rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition focus-within:ring-2 focus-within:ring-emerald-600 focus-within:ring-offset-2 ${destination ? "cursor-pointer bg-emerald-700 hover:bg-emerald-800" : "cursor-not-allowed bg-slate-400"}`}>
                  {reading ? "Leyendo archivo..." : "Seleccionar archivo"}
                  <input
                    accept={INVENTORY_IMPORT_ACCEPT}
                    className="sr-only"
                    disabled={reading || !destination}
                    onChange={(event) => void handleFile(event.target.files?.[0])}
                    ref={inputRef}
                    type="file"
                  />
                </label>
                <button className="ml-3 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600" onClick={() => void downloadInventoryImportTemplate()} type="button">
                  Descargar plantilla Excel
                </button>
              </div>
              {fileErrors.length > 0 ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4" role="alert">
                  <p className="font-semibold text-red-900">No se pudo preparar la importación.</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red-800">
                    {fileErrors.map((error) => <li key={error}>{error}</li>)}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}

          {step === "preview" ? (
            <div className="space-y-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-lg font-bold text-slate-950">Vista previa</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {fileName} · {rows.length} {rows.length === 1 ? "fila" : "filas"}
                  </p>
                </div>
                <button className="self-start rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600" onClick={() => setStep("file")} type="button">
                  Cambiar archivo
                </button>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 sm:flex sm:items-center sm:justify-between sm:gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Destino</p>
                  <p className="mt-1 font-bold text-slate-950">{destinationLabel}</p>
                </div>
                <p className="mt-2 text-sm text-slate-600 sm:mt-0 sm:text-right">
                  {rows.length} {rows.length === 1 ? "producto se importará" : "productos se importarán"} al inventario de este propietario.
                </p>
              </div>

              {criticalErrorCount > 0 ? (
                <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800" role="alert">
                  Corrige el archivo y vuelve a cargarlo. Hay {criticalErrorCount} {criticalErrorCount === 1 ? "error crítico" : "errores críticos"}.
                </p>
              ) : (
                <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
                  La estructura es válida. Para inventarios existentes, el stock no cambiará salvo que selecciones “Ajustar al valor importado”.
                </p>
              )}

              <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 lg:block">
                <table className="w-full min-w-[1180px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-3 font-semibold">Fila</th>
                      <th className="px-3 py-3 font-semibold">SKU / producto</th>
                      <th className="px-3 py-3 font-semibold">Estado</th>
                      <th className="px-3 py-3 font-semibold">Stock actual</th>
                      <th className="px-3 py-3 font-semibold">Importado</th>
                      <th className="px-3 py-3 font-semibold">Diferencia</th>
                      <th className="px-3 py-3 font-semibold">Mín. actual</th>
                      <th className="px-3 py-3 font-semibold">Mín. nuevo</th>
                      <th className="w-56 px-3 py-3 font-semibold">Acción</th>
                      <th className="w-64 px-3 py-3 font-semibold">Validación</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((row) => (
                      <tr className="align-top" key={row.id}>
                        <td className="px-3 py-4 font-semibold text-slate-500">{row.rowNumber}</td>
                        <td className="px-3 py-4"><p className="font-semibold text-slate-950">{row.productName || "—"}</p><p className="mt-1 font-mono text-xs text-slate-500">{row.sku || "Sin SKU"}</p></td>
                        <td className="px-3 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(row)}`}>{statusForRow(row)}</span></td>
                        <td className="px-3 py-4 font-semibold text-slate-800">{numberOrDash(row.currentStock)}</td>
                        <td className="px-3 py-4 font-semibold text-slate-950">{numberOrDash(row.initialStock)}</td>
                        <td className={`px-3 py-4 font-semibold ${row.action === "adjust" && (row.difference ?? 0) < 0 ? "text-red-700" : "text-emerald-700"}`}>{row.action === "adjust" && row.difference !== null ? `${row.difference > 0 ? "+" : ""}${row.difference}` : "—"}</td>
                        <td className="px-3 py-4 text-slate-600">{numberOrDash(row.currentMinimumStock)}</td>
                        <td className="px-3 py-4 font-semibold text-slate-900">{numberOrDash(row.minimumStock)}</td>
                        <td className="px-3 py-4">
                          {row.currentStock !== null && row.errors.length === 0 ? (
                            <select aria-label={`Acción para ${row.sku}`} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" onChange={(event) => updateAction(row.id, event.target.value as InventoryImportAction)} value={row.action}>
                              <option value="no_change">No cambiar stock</option>
                              <option value="adjust">Ajustar al valor importado</option>
                            </select>
                          ) : <span className="text-xs font-medium text-slate-600">{row.productState === "new" ? "Crear producto e inventario" : "Crear inventario inicial"}</span>}
                        </td>
                        <td className="px-3 py-4">
                          {row.errors.length > 0 ? <ul className="space-y-1 text-xs font-medium text-red-700">{row.errors.map((error) => <li key={error}>{error}</li>)}</ul> : row.warnings.length > 0 ? <ul className="space-y-1 text-xs text-amber-800">{row.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : <span className="text-xs font-medium text-emerald-700">Lista para importar</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid gap-4 lg:hidden">
                {rows.map((row) => (
                  <article className="rounded-2xl border border-slate-200 p-4" key={row.id}>
                    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-semibold text-slate-500">Fila {row.rowNumber}</p><h4 className="mt-1 break-words font-bold text-slate-950">{row.productName || "Sin nombre"}</h4><p className="mt-1 break-all font-mono text-xs text-slate-500">{row.sku || "Sin SKU"}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(row)}`}>{statusForRow(row)}</span></div>
                    <dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-slate-500">Stock actual</dt><dd className="mt-1 font-semibold">{numberOrDash(row.currentStock)}</dd></div><div><dt className="text-xs text-slate-500">Stock importado</dt><dd className="mt-1 font-semibold">{numberOrDash(row.initialStock)}</dd></div><div><dt className="text-xs text-slate-500">Mínimo actual</dt><dd className="mt-1 font-semibold">{numberOrDash(row.currentMinimumStock)}</dd></div><div><dt className="text-xs text-slate-500">Mínimo nuevo</dt><dd className="mt-1 font-semibold">{numberOrDash(row.minimumStock)}</dd></div></dl>
                    {row.currentStock !== null && row.errors.length === 0 ? <select aria-label={`Acción para ${row.sku}`} className="mt-4 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900" onChange={(event) => updateAction(row.id, event.target.value as InventoryImportAction)} value={row.action}><option value="no_change">No cambiar stock</option><option value="adjust">Ajustar al valor importado</option></select> : null}
                    {row.errors.length > 0 ? <ul className="mt-4 space-y-1 rounded-xl bg-red-50 p-3 text-xs font-medium text-red-700">{row.errors.map((error) => <li key={error}>{error}</li>)}</ul> : row.warnings.length > 0 ? <ul className="mt-4 space-y-1 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">{row.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}
                  </article>
                ))}
              </div>
            </div>
          ) : null}

          {step === "confirm" ? (
            <div className="mx-auto max-w-3xl space-y-5">
              <div><h3 className="text-xl font-bold text-slate-950">Confirma la importación</h3><p className="mt-2 text-sm leading-6 text-slate-600">Las filas se procesarán individualmente. Cada cambio de cantidad será atómico con su movimiento; si una fila falla, se identificará en el resultado.</p></div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Destino</p><p className="mt-1 font-bold text-slate-950">{destinationLabel}</p></div>
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4"><div className="rounded-2xl border border-slate-200 p-4"><dt className="text-xs text-slate-500">Filas</dt><dd className="mt-1 text-2xl font-bold text-slate-950">{rows.length}</dd></div><div className="rounded-2xl border border-slate-200 p-4"><dt className="text-xs text-slate-500">Productos nuevos</dt><dd className="mt-1 text-2xl font-bold text-blue-700">{newProducts}</dd></div><div className="rounded-2xl border border-slate-200 p-4"><dt className="text-xs text-slate-500">Existentes</dt><dd className="mt-1 text-2xl font-bold text-slate-950">{existingProducts}</dd></div><div className="rounded-2xl border border-slate-200 p-4"><dt className="text-xs text-slate-500">Ajustes de stock</dt><dd className="mt-1 text-2xl font-bold text-amber-700">{stockAdjustments}</dd></div></dl>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900"><strong>Importante:</strong> el stock mínimo se actualizará desde el archivo. Los inventarios existentes configurados como “No cambiar stock” conservarán su cantidad actual.</div>
              {importError ? <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800" role="alert">{importError}</p> : null}
              {importing ? <div aria-live="polite"><div className="flex items-center justify-between text-sm font-medium text-slate-700"><span>Procesando filas...</span><span>{progress.completed}/{progress.total}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${progress.total ? (progress.completed / progress.total) * 100 : 0}%` }} /></div></div> : null}
            </div>
          ) : null}

          {step === "result" && summary ? (
            <div className="mx-auto max-w-4xl space-y-5">
              <div><h3 className="text-xl font-bold text-slate-950">Importación finalizada</h3><p className="mt-1 text-sm text-slate-600">Revisa el resumen de filas procesadas y cualquier error individual.</p></div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Destino</p><p className="mt-1 font-bold text-slate-950">{destinationLabel}</p></div>
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4"><div className="rounded-2xl border border-slate-200 p-4"><dt className="text-xs text-slate-500">Procesadas</dt><dd className="mt-1 text-2xl font-bold text-emerald-700">{summary.rowsProcessed}</dd></div><div className="rounded-2xl border border-slate-200 p-4"><dt className="text-xs text-slate-500">Productos nuevos</dt><dd className="mt-1 text-2xl font-bold text-slate-950">{summary.productsCreated}</dd></div><div className="rounded-2xl border border-slate-200 p-4"><dt className="text-xs text-slate-500">Inventarios creados</dt><dd className="mt-1 text-2xl font-bold text-slate-950">{summary.inventoriesCreated}</dd></div><div className="rounded-2xl border border-slate-200 p-4"><dt className="text-xs text-slate-500">Errores</dt><dd className={`mt-1 text-2xl font-bold ${summary.errors ? "text-red-700" : "text-slate-950"}`}>{summary.errors}</dd></div><div className="rounded-2xl border border-slate-200 p-4"><dt className="text-xs text-slate-500">Existentes</dt><dd className="mt-1 text-2xl font-bold text-slate-950">{summary.productsExisting}</dd></div><div className="rounded-2xl border border-slate-200 p-4"><dt className="text-xs text-slate-500">Ajustes entrada</dt><dd className="mt-1 text-2xl font-bold text-emerald-700">{summary.adjustmentsIn}</dd></div><div className="rounded-2xl border border-slate-200 p-4"><dt className="text-xs text-slate-500">Ajustes salida</dt><dd className="mt-1 text-2xl font-bold text-red-700">{summary.adjustmentsOut}</dd></div><div className="rounded-2xl border border-slate-200 p-4"><dt className="text-xs text-slate-500">Stock omitido</dt><dd className="mt-1 text-2xl font-bold text-slate-950">{summary.rowsSkipped}</dd></div></dl>
              {summary.errors > 0 ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4"><p className="font-semibold text-red-900">Filas con error</p><ul className="mt-2 space-y-1 text-sm text-red-800">{summary.results.filter((result) => !result.success).map((result) => <li key={`${result.rowNumber}-${result.sku}`}>Fila {result.rowNumber} · {result.sku}: {result.error}</li>)}</ul></div> : <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">Todas las filas se procesaron correctamente.</p>}
            </div>
          ) : null}
        </div>

        <footer className="flex shrink-0 flex-col-reverse gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:flex-row sm:justify-end sm:px-7">
          {step === "preview" ? <><button className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600" onClick={onClose} type="button">Cancelar</button><button className="rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:cursor-not-allowed disabled:opacity-50" disabled={criticalErrorCount > 0 || rows.length === 0} onClick={() => setStep("confirm")} type="button">Continuar</button></> : null}
          {step === "confirm" ? <><button className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50" disabled={importing} onClick={() => setStep("preview")} type="button">Volver</button><button className="rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:opacity-50" disabled={importing} onClick={() => void handleImport()} type="button">{importing ? "Importando..." : `Importar ${rows.length} ${rows.length === 1 ? "fila" : "filas"}`}</button></> : null}
          {step === "result" ? <button className="rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600" onClick={onClose} type="button">Cerrar</button> : null}
        </footer>
      </section>
    </div>
  );
}
