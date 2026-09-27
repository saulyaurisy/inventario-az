"use client";

import { useState, type FormEvent } from "react";

import type {
  ClientFormErrors,
  ClientFormValues,
  ClientInput,
} from "../types/client.types";
import {
  CLIENT_DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  validateClientForm,
} from "../utils/client-validation";

interface ClientFormProps {
  initialValues: ClientFormValues;
  mode: "create" | "edit";
  onCancel: () => void;
  onSubmit: (input: ClientInput) => Promise<void>;
}

interface FieldProps {
  error?: string;
  id: keyof ClientFormValues;
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: "text" | "email" | "tel";
  value: string;
}

function Field({
  error,
  id,
  label,
  onChange,
  placeholder,
  required,
  type = "text",
  value,
}: FieldProps) {
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
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
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

export function ClientForm({
  initialValues,
  mode,
  onCancel,
  onSubmit,
}: ClientFormProps) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<ClientFormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function updateValue<Key extends keyof ClientFormValues>(
    key: Key,
    value: ClientFormValues[Key],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setSubmitError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateClientForm(values);
    setErrors(validation.errors);

    if (!validation.valid) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmit(validation.data);
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "No se pudo guardar el cliente.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="space-y-5" noValidate onSubmit={handleSubmit}>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className="text-sm font-semibold text-slate-800" htmlFor="documentType">
            Tipo de documento <span className="text-red-600">*</span>
          </label>
          <select
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
            id="documentType"
            onChange={(event) =>
              updateValue(
                "documentType",
                event.target.value as ClientFormValues["documentType"],
              )
            }
            value={values.documentType}
          >
            {CLIENT_DOCUMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {DOCUMENT_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </div>
        <Field
          error={errors.documentNumber}
          id="documentNumber"
          label="Número de documento"
          onChange={(value) => updateValue("documentNumber", value)}
          placeholder="12345678"
          required
          value={values.documentNumber}
        />
      </div>

      <Field
        error={errors.name}
        id="name"
        label="Nombre o razón social"
        onChange={(value) => updateValue("name", value)}
        required
        value={values.name}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          error={errors.phone}
          id="phone"
          label="Teléfono"
          onChange={(value) => updateValue("phone", value)}
          placeholder="Opcional"
          type="tel"
          value={values.phone}
        />
        <Field
          error={errors.email}
          id="email"
          label="Email"
          onChange={(value) => updateValue("email", value)}
          placeholder="cliente@ejemplo.com"
          type="email"
          value={values.email}
        />
      </div>

      <Field
        error={errors.address}
        id="address"
        label="Dirección"
        onChange={(value) => updateValue("address", value)}
        placeholder="Opcional"
        value={values.address}
      />

      <div>
        <label className="text-sm font-semibold text-slate-800" htmlFor="notes">
          Observaciones
        </label>
        <textarea
          className="mt-2 min-h-24 w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
          id="notes"
          onChange={(event) => updateValue("notes", event.target.value)}
          placeholder="Información adicional opcional"
          value={values.notes}
        />
      </div>

      {mode === "edit" ? (
        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <input
            checked={values.active}
            className="size-4 accent-emerald-700"
            onChange={(event) => updateValue("active", event.target.checked)}
            type="checkbox"
          />
          <span>
            <span className="block text-sm font-semibold text-slate-800">Cliente activo</span>
            <span className="block text-xs text-slate-500">
              Los clientes inactivos permanecen registrados.
            </span>
          </span>
        </label>
      ) : null}

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
              ? "Crear cliente"
              : "Guardar cambios"}
        </button>
      </div>
    </form>
  );
}
