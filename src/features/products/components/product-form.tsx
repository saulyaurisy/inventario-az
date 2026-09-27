"use client";

import { useState, type FormEvent } from "react";

import type {
  ProductFormErrors,
  ProductFormValues,
  ProductInput,
} from "../types/product.types";
import { validateProductForm } from "../utils/product-validation";

interface ProductFormProps {
  initialValues: ProductFormValues;
  mode: "create" | "edit";
  onCancel: () => void;
  onSubmit: (input: ProductInput) => Promise<void>;
}

interface TextFieldProps {
  error?: string;
  id: keyof ProductFormValues;
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: "text" | "number";
  value: string;
}

function TextField({
  error,
  id,
  label,
  onChange,
  placeholder,
  required,
  type = "text",
  value,
}: TextFieldProps) {
  return (
    <div>
      <label className="text-sm font-semibold text-slate-800" htmlFor={id}>
        {label} {required ? <span className="text-red-600">*</span> : null}
      </label>
      <input
        aria-describedby={error ? `${id}-error` : undefined}
        aria-invalid={Boolean(error)}
        className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
        id={id}
        min={type === "number" ? "0" : undefined}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        step={type === "number" ? "any" : undefined}
        type={type}
        value={value}
      />
      {error ? (
        <p className="mt-1.5 text-xs font-medium text-red-700" id={`${id}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function ProductForm({
  initialValues,
  mode,
  onCancel,
  onSubmit,
}: ProductFormProps) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<ProductFormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function updateValue<Key extends keyof ProductFormValues>(
    key: Key,
    value: ProductFormValues[Key],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setSubmitError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateProductForm(values);
    setErrors(validation.errors);

    if (!validation.valid) {
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmit(validation.data);
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "No se pudo guardar el producto.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="space-y-5" noValidate onSubmit={handleSubmit}>
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          error={errors.sku}
          id="sku"
          label="SKU"
          onChange={(value) => updateValue("sku", value)}
          placeholder="PROD-001"
          required
          value={values.sku}
        />
        <TextField
          error={errors.internalCode}
          id="internalCode"
          label="Código interno"
          onChange={(value) => updateValue("internalCode", value)}
          placeholder="Opcional"
          value={values.internalCode}
        />
      </div>

      <TextField
        error={errors.name}
        id="name"
        label="Nombre"
        onChange={(value) => updateValue("name", value)}
        required
        value={values.name}
      />

      <div>
        <label className="text-sm font-semibold text-slate-800" htmlFor="description">
          Descripción
        </label>
        <textarea
          className="mt-2 min-h-24 w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
          id="description"
          onChange={(event) => updateValue("description", event.target.value)}
          placeholder="Descripción opcional del producto"
          value={values.description}
        />
      </div>

      <TextField
        error={errors.category}
        id="category"
        label="Categoría"
        onChange={(value) => updateValue("category", value)}
        placeholder="General"
        required
        value={values.category}
      />

      <div className="grid gap-5 sm:grid-cols-3">
        <TextField
          error={errors.salePrice}
          id="salePrice"
          label="Precio de venta"
          onChange={(value) => updateValue("salePrice", value)}
          required
          type="number"
          value={values.salePrice}
        />
        <TextField
          error={errors.costPrice}
          id="costPrice"
          label="Costo"
          onChange={(value) => updateValue("costPrice", value)}
          required
          type="number"
          value={values.costPrice}
        />
        <TextField
          error={errors.minimumStock}
          id="minimumStock"
          label="Stock mínimo"
          onChange={(value) => updateValue("minimumStock", value)}
          required
          type="number"
          value={values.minimumStock}
        />
      </div>

      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <input
          checked={values.active}
          className="size-4 accent-emerald-700"
          onChange={(event) => updateValue("active", event.target.checked)}
          type="checkbox"
        />
        <span>
          <span className="block text-sm font-semibold text-slate-800">Producto activo</span>
          <span className="block text-xs text-slate-500">
            Los productos inactivos permanecen en el catálogo.
          </span>
        </span>
      </label>

      {submitError ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {submitError}
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
        <button
          className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:opacity-60"
          disabled={submitting}
          onClick={onCancel}
          type="button"
        >
          Cancelar
        </button>
        <button
          className="rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={submitting}
          type="submit"
        >
          {submitting
            ? mode === "create"
              ? "Guardando..."
              : "Actualizando..."
            : mode === "create"
              ? "Crear producto"
              : "Guardar cambios"}
        </button>
      </div>
    </form>
  );
}
