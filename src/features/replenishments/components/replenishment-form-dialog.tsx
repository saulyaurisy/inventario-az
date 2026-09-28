"use client";

import { useState } from "react";

import type { Product } from "@/features/products";

import type {
  Replenishment,
  ReplenishmentInput,
  ReplenishmentItem,
  ReplenishmentUser,
} from "../types/replenishment.types";
import {
  MAX_REPLENISHMENT_ITEMS,
  validateReplenishmentItems,
} from "../utils/replenishment-utils";

interface ReplenishmentFormDialogProps {
  agents: ReplenishmentUser[];
  initial?: Replenishment;
  onClose: () => void;
  onSubmit: (input: ReplenishmentInput) => Promise<void>;
  products: Product[];
}

type DraftItem = { productId: string; quantity: string };

export function ReplenishmentFormDialog({
  agents,
  initial,
  onClose,
  onSubmit,
  products,
}: ReplenishmentFormDialogProps) {
  const [agentId, setAgentId] = useState(initial?.agentId ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [items, setItems] = useState<DraftItem[]>(
    initial?.items.map((item) => ({
      productId: item.productId,
      quantity: String(item.quantity),
    })) ?? [{ productId: "", quantity: "" }],
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function updateItem(index: number, changes: Partial<DraftItem>) {
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...changes } : item,
      ),
    );
  }

  function removeItem(index: number) {
    setItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const parsedItems: ReplenishmentItem[] = items.map((item) => ({
      productId: item.productId,
      quantity: Number(item.quantity),
    }));
    if (!agentId || !validateReplenishmentItems(parsedItems)) {
      setError(
        `Selecciona un agente y entre 1 y ${MAX_REPLENISHMENT_ITEMS} productos distintos con cantidades enteras mayores que cero.`,
      );
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({ agentId, items: parsedItems, notes });
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "No se pudo guardar la reposición.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <section aria-labelledby="replenishment-form-title" aria-modal="true" className="max-h-[96vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl" role="dialog">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white/95 px-5 py-5 backdrop-blur sm:px-7">
          <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Empresa → Agente</p><h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950" id="replenishment-form-title">{initial ? `Editar ${initial.number}` : "Nueva reposición"}</h2></div>
          <button aria-label="Cerrar formulario" className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-2xl text-slate-600 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600" disabled={submitting} onClick={onClose} type="button"><span aria-hidden="true">×</span></button>
        </div>

        <form className="space-y-6 px-5 py-6 sm:px-7" onSubmit={handleSubmit}>
          <div><label className="text-sm font-semibold text-slate-800" htmlFor="replenishment-agent">Agente destino *</label><select className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" id="replenishment-agent" onChange={(event) => setAgentId(event.target.value)} value={agentId}><option value="">Selecciona un agente</option>{agents.map((agent) => <option key={agent.uid} value={agent.uid}>{agent.displayName} · {agent.email}</option>)}</select></div>

          <fieldset className="space-y-3">
            <div className="flex items-center justify-between gap-3"><legend className="text-sm font-semibold text-slate-800">Productos *</legend><span className="text-xs text-slate-500">Máximo {MAX_REPLENISHMENT_ITEMS}</span></div>
            {items.map((item, index) => (
              <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-[1fr_9rem_auto] sm:items-end" key={index}>
                <div><label className="text-xs font-semibold text-slate-700" htmlFor={`replenishment-product-${index}`}>Producto {index + 1}</label><select className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" id={`replenishment-product-${index}`} onChange={(event) => updateItem(index, { productId: event.target.value })} value={item.productId}><option value="">Selecciona un producto</option>{products.filter((product) => product.active).map((product) => <option key={product.id} value={product.id}>{product.sku} · {product.name}</option>)}</select></div>
                <div><label className="text-xs font-semibold text-slate-700" htmlFor={`replenishment-quantity-${index}`}>Cantidad</label><input className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" id={`replenishment-quantity-${index}`} inputMode="numeric" min="1" onChange={(event) => updateItem(index, { quantity: event.target.value })} step="1" type="number" value={item.quantity} /></div>
                <button className="rounded-xl border border-red-200 px-3 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 disabled:opacity-40" disabled={items.length === 1} onClick={() => removeItem(index)} type="button">Eliminar</button>
              </div>
            ))}
            <button className="rounded-xl border border-dashed border-emerald-400 px-4 py-2.5 text-sm font-semibold text-emerald-800 hover:bg-emerald-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:opacity-40" disabled={items.length >= MAX_REPLENISHMENT_ITEMS} onClick={() => setItems((current) => [...current, { productId: "", quantity: "" }])} type="button">Agregar producto</button>
          </fieldset>

          <div><label className="text-sm font-semibold text-slate-800" htmlFor="replenishment-notes">Observación</label><textarea className="mt-2 min-h-24 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" id="replenishment-notes" maxLength={500} onChange={(event) => setNotes(event.target.value)} placeholder="Información opcional para el envío" value={notes} /></div>

          {error ? <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800" role="alert">{error}</p> : null}
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">Guardar crea o actualiza una reposición pendiente. El stock no cambia hasta confirmar el envío.</p>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50" disabled={submitting} onClick={onClose} type="button">Cancelar</button><button className="rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60" disabled={submitting} type="submit">{submitting ? "Guardando..." : initial ? "Guardar cambios" : "Crear reposición"}</button></div>
        </form>
      </section>
    </div>
  );
}
