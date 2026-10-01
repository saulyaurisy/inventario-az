import type { Product } from "@/features/products";

import type {
  CreateSaleInput,
  DiscountType,
  PaymentMethod,
  Sale,
  SaleItem,
  SalePayment,
} from "../types/sale.types";

export const MAX_AGENT_DISCOUNT_PERCENTAGE = 35;
export const MAX_SALE_ITEMS = 3;
export const MAX_SALE_PAYMENTS = 3;

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Efectivo",
  yape: "Yape",
  plin: "Plin",
  bank_transfer: "Transferencia bancaria",
  card: "Tarjeta",
  bonus: "Bono",
  other: "Otro",
};

export function getSalePayments(sale: Sale): SalePayment[] {
  return sale.payments?.length
    ? sale.payments
    : [
        {
          method: sale.paymentMethod,
          amount: sale.total,
          ...(sale.paymentReference
            ? { reference: sale.paymentReference }
            : {}),
        },
      ];
}

export function validateSalePayments(payments: SalePayment[] | undefined, total: number): void {
  if (!payments) return;
  if (payments.length < 2 || payments.length > MAX_SALE_PAYMENTS) {
    throw new Error("Invalid payments");
  }
  const methods = new Set<PaymentMethod>();
  let paid = 0;
  for (const payment of payments) {
    if (
      methods.has(payment.method) ||
      !Number.isInteger(payment.amount) ||
      payment.amount <= 0 ||
      (payment.reference !== undefined && (!payment.reference.trim() || payment.reference.length > 100))
    ) {
      throw new Error("Invalid payments");
    }
    methods.add(payment.method);
    paid += payment.amount;
  }
  if (paid !== total) throw new Error("Invalid payments");
}

export function toCents(value: number): number {
  if (!Number.isFinite(value)) throw new Error("Invalid money value");
  return Math.round((value + Number.EPSILON) * 100);
}

export function formatMoney(cents: number): string {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
  }).format(cents / 100);
}

function discountAmount(
  baseCents: number,
  type?: DiscountType,
  value?: number,
): number {
  if (!type) {
    if (value !== undefined && value !== 0) throw new Error("Invalid discount");
    return 0;
  }
  if (!Number.isFinite(value) || Number(value) < 0) {
    throw new Error("Invalid discount");
  }
  if (type === "percentage") {
    if (Number(value) > 100) throw new Error("Invalid discount");
    return Math.round((baseCents * Number(value)) / 100);
  }
  return toCents(Number(value));
}

export function calculateSale(
  input: CreateSaleInput,
  products: Map<string, Product>,
  enforceAgentLimit: boolean,
): {
  globalDiscountAmount: number;
  items: SaleItem[];
  lineDiscountTotal: number;
  subtotal: number;
  total: number;
  totalDiscount: number;
} {
  if (input.items.length < 1 || input.items.length > MAX_SALE_ITEMS) {
    throw new Error("Invalid items");
  }
  const seen = new Set<string>();
  const items = input.items.map((draft): SaleItem => {
    if (
      !draft.productId ||
      seen.has(draft.productId) ||
      !Number.isInteger(draft.quantity) ||
      draft.quantity <= 0
    ) {
      throw new Error("Invalid items");
    }
    seen.add(draft.productId);
    const product = products.get(draft.productId);
    if (!product || !product.active) throw new Error("Invalid product");
    const unitPrice = toCents(product.salePrice);
    const unitCost = toCents(product.costPrice);
    const lineSubtotal = unitPrice * draft.quantity;
    const lineDiscount = discountAmount(
      lineSubtotal,
      draft.discountType,
      draft.discountValue,
    );
    if (lineDiscount > lineSubtotal) throw new Error("Invalid discount");
    return {
      productId: product.id,
      sku: product.sku,
      name: product.name,
      quantity: draft.quantity,
      unitPrice,
      unitCost,
      lineSubtotal,
      ...(draft.discountType
        ? {
            discountType: draft.discountType,
            discountValue: Number(draft.discountValue),
          }
        : {}),
      discountAmount: lineDiscount,
      lineTotal: lineSubtotal - lineDiscount,
    };
  });
  const subtotal = items.reduce((sum, item) => sum + item.lineSubtotal, 0);
  const lineDiscountTotal = items.reduce(
    (sum, item) => sum + item.discountAmount,
    0,
  );
  const afterLines = subtotal - lineDiscountTotal;
  const globalDiscountAmount = discountAmount(
    afterLines,
    input.globalDiscountType,
    input.globalDiscountValue,
  );
  if (globalDiscountAmount > afterLines) throw new Error("Invalid discount");
  const totalDiscount = lineDiscountTotal + globalDiscountAmount;
  const total = subtotal - totalDiscount;
  if (total < 0) throw new Error("Invalid discount");
  if (
    enforceAgentLimit &&
    subtotal > 0 &&
    totalDiscount * 100 > subtotal * MAX_AGENT_DISCOUNT_PERCENTAGE
  ) {
    throw new Error("Agent discount limit");
  }
  validateSalePayments(input.payments, total);
  return {
    items,
    subtotal,
    lineDiscountTotal,
    globalDiscountAmount,
    totalDiscount,
    total,
  };
}

export function formatSaleNumber(sequence: number): string {
  return `V-${String(sequence).padStart(6, "0")}`;
}

export function getSaleMovementId(saleId: string, productId: string): string {
  return `sale__${saleId}__${productId}`;
}
