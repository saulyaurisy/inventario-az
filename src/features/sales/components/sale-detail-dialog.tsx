"use client";

import type { UserRole } from "@/features/auth";
import { SalePaymentProofSection } from "@/features/payment-proofs";

import type { Sale } from "../types/sale.types";
import {
  formatMoney,
  getSalePayments,
  PAYMENT_METHOD_LABELS,
} from "../utils/sale-utils";

interface SaleDetailDialogProps {
  actorUid: string;
  agentLabel: string;
  onClose: () => void;
  readOnly?: boolean;
  role: UserRole;
  sale: Sale;
}

export function SaleDetailDialog({
  actorUid,
  agentLabel,
  onClose,
  readOnly = false,
  role,
  sale,
}: SaleDetailDialogProps) {
  const payments = getSalePayments(sale);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 backdrop-blur-sm sm:items-center sm:p-6">
      <section
        aria-labelledby="sale-detail-title"
        aria-modal="true"
        className="max-h-[95dvh] w-full max-w-5xl overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
        role="dialog"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white/95 px-5 py-5 backdrop-blur sm:px-7">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
              Detalle de venta
            </p>
            <h2
              className="mt-1 text-2xl font-bold text-slate-950"
              id="sale-detail-title"
            >
              {sale.number}
            </h2>
          </div>
          <button
            aria-label="Cerrar detalle"
            className="flex size-10 items-center justify-center rounded-xl border border-slate-200 text-2xl text-slate-600"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>

        <div className="space-y-6 p-5 sm:p-7">
          <dl className="grid gap-4 rounded-2xl bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt className="text-xs text-slate-500">Número de venta</dt>
              <dd className="mt-1 text-sm font-semibold text-slate-900">
                {sale.number}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Fecha y hora</dt>
              <dd className="mt-1 text-sm font-semibold text-slate-900">
                {new Intl.DateTimeFormat("es-PE", {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(sale.createdAt.toDate())}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Estado</dt>
              <dd
                className={`mt-1 text-sm font-semibold ${
                  sale.status === "completed"
                    ? "text-emerald-800"
                    : "text-slate-700"
                }`}
              >
                {sale.status === "completed" ? "Completada" : "Anulada"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Cliente</dt>
              <dd className="mt-1 text-sm font-semibold text-slate-900">
                {sale.clientSnapshot.name}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Documento</dt>
              <dd className="mt-1 text-sm font-semibold text-slate-900">
                {sale.clientSnapshot.documentType}{" "}
                {sale.clientSnapshot.documentNumber}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Agente</dt>
              <dd className="mt-1 text-sm font-semibold text-slate-900">
                {agentLabel}
              </dd>
            </div>
          </dl>

          <section aria-labelledby="sale-items-title">
            <h3 className="font-bold text-slate-950" id="sale-items-title">
              Productos vendidos
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Nombres, SKU y precios históricos guardados al confirmar la venta.
            </p>

            <div className="mt-3 hidden overflow-x-auto rounded-2xl border border-slate-200 md:block">
              <table className="w-full min-w-[48rem] divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3" scope="col">Producto</th>
                    <th className="px-4 py-3" scope="col">SKU</th>
                    <th className="px-4 py-3 text-right" scope="col">Cantidad</th>
                    <th className="px-4 py-3 text-right" scope="col">Precio</th>
                    <th className="px-4 py-3 text-right" scope="col">Subtotal</th>
                    <th className="px-4 py-3 text-right" scope="col">Descuento</th>
                    <th className="px-4 py-3 text-right" scope="col">Total línea</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sale.items.map((item) => (
                    <tr key={item.productId}>
                      <td className="px-4 py-4 font-semibold text-slate-950">
                        {item.name}
                      </td>
                      <td className="px-4 py-4 font-mono text-xs text-slate-600">
                        {item.sku}
                      </td>
                      <td className="px-4 py-4 text-right">{item.quantity}</td>
                      <td className="px-4 py-4 text-right">
                        {formatMoney(item.unitPrice)}
                      </td>
                      <td className="px-4 py-4 text-right">
                        {formatMoney(item.lineSubtotal)}
                      </td>
                      <td className="px-4 py-4 text-right text-red-700">
                        {formatMoney(item.discountAmount)}
                      </td>
                      <td className="px-4 py-4 text-right font-bold">
                        {formatMoney(item.lineTotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 grid gap-3 md:hidden">
              {sale.items.map((item) => (
                <article
                  className="rounded-2xl border border-slate-200 p-4"
                  key={item.productId}
                >
                  <p className="font-semibold text-slate-950">{item.name}</p>
                  <p className="mt-0.5 font-mono text-xs text-slate-500">
                    {item.sku}
                  </p>
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-xs text-slate-500">Cantidad</dt>
                      <dd className="mt-1 font-semibold">{item.quantity}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Precio histórico</dt>
                      <dd className="mt-1 font-semibold">
                        {formatMoney(item.unitPrice)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Subtotal línea</dt>
                      <dd className="mt-1 font-semibold">
                        {formatMoney(item.lineSubtotal)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Descuento línea</dt>
                      <dd className="mt-1 font-semibold text-red-700">
                        {formatMoney(item.discountAmount)}
                      </dd>
                    </div>
                    <div className="col-span-2 border-t border-slate-100 pt-3">
                      <dt className="text-xs text-slate-500">Total línea</dt>
                      <dd className="mt-1 text-base font-bold">
                        {formatMoney(item.lineTotal)}
                      </dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          </section>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.7fr)]">
            <section
              aria-labelledby="sale-payments-title"
              className="rounded-2xl border border-slate-200 p-4"
            >
              <h3 className="font-bold text-slate-950" id="sale-payments-title">
                Formas de pago
              </h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {payments.map((payment) => (
                  <div
                    className="rounded-xl bg-slate-50 p-3"
                    key={`${payment.method}-${payment.amount}`}
                  >
                    <p className="text-xs text-slate-500">
                      {PAYMENT_METHOD_LABELS[payment.method]}
                    </p>
                    <p className="mt-1 font-bold text-slate-950">
                      {formatMoney(payment.amount)}
                    </p>
                    <p className="mt-1 break-words text-xs text-slate-500">
                      {payment.reference || "Sin referencia"}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <dl className="grid content-start gap-2 rounded-2xl border border-slate-200 p-4 text-sm">
              <div className="flex justify-between gap-4">
                <dt>Subtotal venta</dt>
                <dd className="font-semibold">{formatMoney(sale.subtotal)}</dd>
              </div>
              <div className="flex justify-between gap-4 text-red-700">
                <dt>Descuento líneas</dt>
                <dd className="font-semibold">
                  − {formatMoney(sale.lineDiscountTotal)}
                </dd>
              </div>
              <div className="flex justify-between gap-4 text-red-700">
                <dt>Descuento global</dt>
                <dd className="font-semibold">
                  − {formatMoney(sale.globalDiscountAmount)}
                </dd>
              </div>
              <div className="mt-1 flex justify-between gap-4 border-t border-slate-200 pt-3 text-lg">
                <dt className="font-bold">Total final</dt>
                <dd className="font-bold">{formatMoney(sale.total)}</dd>
              </div>
            </dl>
          </div>

          <SalePaymentProofSection
            actorUid={actorUid}
            readOnly={readOnly}
            role={role}
            sale={sale}
          />

          {sale.notes ? (
            <div>
              <p className="text-xs font-semibold uppercase text-slate-500">
                Notas
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                {sale.notes}
              </p>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
