"use client";

import { useMemo, useState } from "react";

import type { Client } from "@/features/clients";
import type { InventoryRecord } from "@/features/inventory";
import type { Product } from "@/features/products";

import type { CreateSaleInput, DiscountType, PaymentMethod, SaleDraftItem } from "../types/sale.types";
import { calculateSale, formatMoney, MAX_AGENT_DISCOUNT_PERCENTAGE, MAX_SALE_ITEMS, PAYMENT_METHOD_LABELS } from "../utils/sale-utils";

interface SaleFormDialogProps {
  clients: Client[];
  inventory: InventoryRecord[];
  onClose: () => void;
  onSubmit: (input: CreateSaleInput) => Promise<void>;
  products: Product[];
}

type SaleFormItem = Omit<SaleDraftItem, "discountValue"> & {
  discountValue?: string;
};

const EMPTY_ITEM: SaleFormItem = { productId: "", quantity: 1 };
const DISCOUNT_TYPES: { label: string; value: "none" | DiscountType }[] = [
  { label: "Sin descuento", value: "none" },
  { label: "Porcentaje", value: "percentage" },
  { label: "Monto fijo", value: "fixed" },
];

export function SaleFormDialog({ clients, inventory, onClose, onSubmit, products }: SaleFormDialogProps) {
  const [clientId, setClientId] = useState("");
  const [items, setItems] = useState<SaleFormItem[]>([{ ...EMPTY_ITEM }]);
  const [globalDiscountType, setGlobalDiscountType] = useState<"none" | DiscountType>("none");
  const [globalDiscountValue, setGlobalDiscountValue] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [paymentReference, setPaymentReference] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [operationId] = useState(() => `sale_${crypto.randomUUID().replaceAll("-", "")}`);

  const stockByProduct = useMemo(() => new Map(inventory.map((record) => [record.productId, record.quantity])), [inventory]);
  const productMap = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const availableProducts = useMemo(() => products.filter((product) => product.active && (stockByProduct.get(product.id) ?? 0) > 0), [products, stockByProduct]);
  const draftItems = useMemo<SaleDraftItem[]>(() => items.map((item) => ({
    productId: item.productId,
    quantity: item.quantity,
    ...(item.discountType ? {
      discountType: item.discountType,
      discountValue: item.discountValue?.trim() ? Number(item.discountValue) : 0,
    } : {}),
  })), [items]);
  const parsedGlobalDiscountValue = globalDiscountValue.trim() ? Number(globalDiscountValue) : 0;

  const summary = useMemo(() => {
    try {
      if (draftItems.some((item) => item.quantity > (stockByProduct.get(item.productId) ?? 0))) return null;
      return calculateSale({
        operationId,
        clientId,
        items: draftItems,
        ...(globalDiscountType !== "none" ? { globalDiscountType, globalDiscountValue: parsedGlobalDiscountValue } : {}),
        paymentMethod,
      }, productMap, true);
    } catch {
      return null;
    }
  }, [clientId, draftItems, globalDiscountType, operationId, parsedGlobalDiscountValue, paymentMethod, productMap, stockByProduct]);

  function updateItem(index: number, patch: Partial<SaleFormItem>) {
    setError(null);
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  }

  function updateDiscountType(index: number, value: "none" | DiscountType) {
    if (value === "none") {
      setError(null);
      setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { productId: item.productId, quantity: item.quantity } : item));
      return;
    }
    updateItem(index, { discountType: value, discountValue: "" });
  }

  function normalizeNumericInput(value: string): string {
    if (!value.trim()) return "";
    const parsed = Number(value);
    return Number.isFinite(parsed) ? String(parsed) : value;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!clientId || !summary) {
      setError("Completa la venta con cantidades, productos y descuentos válidos.");
      return;
    }
    setSaving(true);
    try {
      await onSubmit({
        operationId,
        clientId,
        items: draftItems,
        ...(globalDiscountType !== "none" ? { globalDiscountType, globalDiscountValue: parsedGlobalDiscountValue } : {}),
        paymentMethod,
        ...(paymentReference.trim() ? { paymentReference: paymentReference.trim() } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo registrar la venta.");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 backdrop-blur-sm sm:items-center sm:p-6">
      <section aria-labelledby="sale-form-title" aria-modal="true" className="max-h-[96vh] w-full max-w-5xl overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl" role="dialog">
        <div className="sticky top-0 z-20 flex items-start justify-between gap-4 border-b border-slate-200 bg-white/95 px-5 py-5 backdrop-blur sm:px-7">
          <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Nueva operación</p><h2 className="mt-1 text-2xl font-bold text-slate-950" id="sale-form-title">Registrar venta</h2><p className="mt-1 text-sm text-slate-500">Máximo {MAX_SALE_ITEMS} productos · descuento total máximo {MAX_AGENT_DISCOUNT_PERCENTAGE}%</p></div>
          <button aria-label="Cerrar" className="flex size-10 items-center justify-center rounded-xl border border-slate-200 text-2xl text-slate-600" onClick={onClose} type="button">×</button>
        </div>
        <form className="space-y-6 p-5 sm:p-7" onSubmit={handleSubmit}>
          <div><label className="text-sm font-semibold text-slate-800" htmlFor="sale-client">Cliente activo</label><select className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm" id="sale-client" onChange={(event) => { setError(null); setClientId(event.target.value); }} required value={clientId}><option value="">Seleccionar cliente</option>{clients.filter((client) => client.active).map((client) => <option key={client.id} value={client.id}>{client.name} · {client.documentType} {client.documentNumber}</option>)}</select></div>

          <fieldset className="space-y-4"><div className="flex items-center justify-between gap-3"><legend className="font-bold text-slate-950">Productos</legend>{items.length < MAX_SALE_ITEMS ? <button className="rounded-lg border border-emerald-300 px-3 py-2 text-xs font-semibold text-emerald-800" onClick={() => { setError(null); setItems((current) => [...current, { ...EMPTY_ITEM }]); }} type="button">+ Agregar producto</button> : null}</div>
            {items.map((item, index) => {
              const stock = stockByProduct.get(item.productId) ?? 0;
              const product = productMap.get(item.productId);
              const calculatedItem = summary?.items[index];
              return <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[minmax(0,2fr)_100px_145px_110px_110px_auto]" key={index}>
                <div><label className="text-xs font-semibold text-slate-600" htmlFor={`sale-product-${index}`}>Producto</label><select className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm" id={`sale-product-${index}`} onChange={(event) => updateItem(index, { productId: event.target.value })} required value={item.productId}><option value="">Seleccionar</option>{availableProducts.filter((candidate) => candidate.id === item.productId || !items.some((row, rowIndex) => rowIndex !== index && row.productId === candidate.id)).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.sku} · {candidate.name} · Stock {stockByProduct.get(candidate.id)}</option>)}</select>{product ? <p className="mt-1 text-xs text-slate-500">SKU {product.sku} · Disponible {stock} · Precio {formatMoney(Math.round(product.salePrice * 100))}</p> : null}</div>
                <div><label className="text-xs font-semibold text-slate-600" htmlFor={`sale-quantity-${index}`}>Cantidad</label><input className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" id={`sale-quantity-${index}`} max={stock || undefined} min="1" onChange={(event) => updateItem(index, { quantity: Number(event.target.value) })} required step="1" type="number" value={item.quantity} /></div>
                <div><label className="text-xs font-semibold text-slate-600" htmlFor={`sale-discount-type-${index}`}>Descuento</label><select className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm" id={`sale-discount-type-${index}`} onChange={(event) => updateDiscountType(index, event.target.value as "none" | DiscountType)} value={item.discountType ?? "none"}>{DISCOUNT_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></div>
                <div><label className="text-xs font-semibold text-slate-600" htmlFor={`sale-discount-${index}`}>Valor</label><input className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm disabled:bg-slate-100" disabled={!item.discountType} id={`sale-discount-${index}`} min="0" onBlur={(event) => updateItem(index, { discountValue: normalizeNumericInput(event.target.value) })} onChange={(event) => updateItem(index, { discountValue: event.target.value })} step="0.01" type="number" value={item.discountValue ?? ""} /></div>
                <div><p className="text-xs font-semibold text-slate-600">Total línea</p><p className="mt-3 text-sm font-bold text-slate-950">{formatMoney(calculatedItem?.lineTotal ?? 0)}</p></div>
                <button aria-label="Quitar producto" className="self-end rounded-xl border border-red-200 px-3 py-2.5 text-sm font-semibold text-red-700 disabled:opacity-40" disabled={items.length === 1} onClick={() => { setError(null); setItems((current) => current.filter((_, itemIndex) => itemIndex !== index)); }} type="button">Quitar</button>
              </div>;
            })}
          </fieldset>

          <div className="grid gap-4 rounded-2xl border border-slate-200 p-4 md:grid-cols-2"><div><label className="text-sm font-semibold text-slate-800" htmlFor="global-discount-type">Descuento global</label><select className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm" id="global-discount-type" onChange={(event) => { setError(null); setGlobalDiscountType(event.target.value as "none" | DiscountType); setGlobalDiscountValue(""); }} value={globalDiscountType}>{DISCOUNT_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></div><div><label className="text-sm font-semibold text-slate-800" htmlFor="global-discount-value">Valor global</label><input className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm disabled:bg-slate-100" disabled={globalDiscountType === "none"} id="global-discount-value" min="0" onBlur={(event) => setGlobalDiscountValue(normalizeNumericInput(event.target.value))} onChange={(event) => { setError(null); setGlobalDiscountValue(event.target.value); }} step="0.01" type="number" value={globalDiscountValue} /></div></div>

          <div className="grid gap-4 md:grid-cols-2"><div><label className="text-sm font-semibold text-slate-800" htmlFor="payment-method">Método de pago</label><select className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm" id="payment-method" onChange={(event) => { setError(null); setPaymentMethod(event.target.value as PaymentMethod); }} value={paymentMethod}>{Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><div><label className="text-sm font-semibold text-slate-800" htmlFor="payment-reference">Referencia de pago</label><input className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" id="payment-reference" maxLength={100} onChange={(event) => { setError(null); setPaymentReference(event.target.value); }} placeholder="Opcional" value={paymentReference} /></div></div>
          <div><label className="text-sm font-semibold text-slate-800" htmlFor="sale-notes">Notas</label><textarea className="mt-2 min-h-20 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" id="sale-notes" maxLength={300} onChange={(event) => { setError(null); setNotes(event.target.value); }} value={notes} /></div>

          <div className="grid gap-3 rounded-2xl bg-slate-950 p-5 text-white sm:grid-cols-4"><div><p className="text-xs text-slate-400">Subtotal</p><p className="mt-1 font-bold">{formatMoney(summary?.subtotal ?? 0)}</p></div><div><p className="text-xs text-slate-400">Descuento líneas</p><p className="mt-1 font-bold">− {formatMoney(summary?.lineDiscountTotal ?? 0)}</p></div><div><p className="text-xs text-slate-400">Descuento global</p><p className="mt-1 font-bold">− {formatMoney(summary?.globalDiscountAmount ?? 0)}</p></div><div><p className="text-xs text-slate-400">Total</p><p className="mt-1 text-xl font-black text-emerald-300">{formatMoney(summary?.total ?? 0)}</p></div></div>
          {error ? <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-900" role="alert">{error}</p> : null}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold" disabled={saving} onClick={onClose} type="button">Cancelar</button><button className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60" disabled={saving || !summary || !clientId} type="submit">{saving ? "Registrando..." : "Confirmar venta"}</button></div>
        </form>
      </section>
    </div>
  );
}
