import type {
  Product,
  ProductFormErrors,
  ProductFormValues,
  ProductInput,
} from "../types/product.types";

export const EMPTY_PRODUCT_FORM: ProductFormValues = {
  sku: "",
  internalCode: "",
  name: "",
  description: "",
  category: "",
  salePrice: "",
  costPrice: "",
  minimumStock: "",
  active: true,
};

export function normalizeSku(sku: string): string {
  return sku.trim().toUpperCase();
}

export function productToFormValues(product: Product): ProductFormValues {
  return {
    sku: product.sku,
    internalCode: product.internalCode ?? "",
    name: product.name,
    description: product.description ?? "",
    category: product.category,
    salePrice: String(product.salePrice),
    costPrice: String(product.costPrice),
    minimumStock: String(product.minimumStock),
    active: product.active,
  };
}

type ProductValidationResult =
  | { valid: true; data: ProductInput; errors: ProductFormErrors }
  | { valid: false; errors: ProductFormErrors };

export function validateProductForm(
  values: ProductFormValues,
): ProductValidationResult {
  const errors: ProductFormErrors = {};
  const sku = normalizeSku(values.sku);
  const name = values.name.trim();
  const category = values.category.trim();
  const salePrice = Number(values.salePrice);
  const costPrice = Number(values.costPrice);
  const minimumStock = Number(values.minimumStock);

  if (!sku) {
    errors.sku = "Ingresa el SKU.";
  } else if (!/^[A-Z0-9][A-Z0-9._ -]*$/.test(sku)) {
    errors.sku =
      "Usa letras, números, espacios, puntos, guiones o guiones bajos.";
  }

  if (!name) {
    errors.name = "Ingresa el nombre del producto.";
  }

  if (!category) {
    errors.category = "Ingresa una categoría.";
  }

  if (!values.salePrice.trim()) {
    errors.salePrice = "Ingresa el precio de venta.";
  } else if (!Number.isFinite(salePrice) || salePrice < 0) {
    errors.salePrice = "El precio de venta debe ser mayor o igual a 0.";
  }

  if (!values.costPrice.trim()) {
    errors.costPrice = "Ingresa el costo.";
  } else if (!Number.isFinite(costPrice) || costPrice < 0) {
    errors.costPrice = "El costo debe ser mayor o igual a 0.";
  }

  if (!values.minimumStock.trim()) {
    errors.minimumStock = "Ingresa el stock mínimo.";
  } else if (!Number.isInteger(minimumStock) || minimumStock < 0) {
    errors.minimumStock = "El stock mínimo debe ser un entero mayor o igual a 0.";
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors };
  }

  const internalCode = values.internalCode.trim();
  const description = values.description.trim();

  return {
    valid: true,
    errors,
    data: {
      sku,
      ...(internalCode ? { internalCode } : {}),
      name,
      ...(description ? { description } : {}),
      category,
      salePrice,
      costPrice,
      minimumStock,
      active: values.active,
    },
  };
}
