"use client";

import type { Client, ClientInput } from "../types/client.types";
import {
  clientToFormValues,
  EMPTY_CLIENT_FORM,
} from "../utils/client-validation";
import { ClientForm } from "./client-form";

interface ClientDialogProps {
  client: Client | null;
  onClose: () => void;
  onSubmit: (input: ClientInput) => Promise<void>;
}

export function ClientDialog({
  client,
  onClose,
  onSubmit,
}: ClientDialogProps) {
  const mode = client ? "edit" : "create";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <section
        aria-labelledby="client-dialog-title"
        aria-modal="true"
        className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
        role="dialog"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white/95 px-5 py-5 backdrop-blur sm:px-7">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
              Directorio
            </p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950" id="client-dialog-title">
              {client ? "Editar cliente" : "Nuevo cliente"}
            </h2>
          </div>
          <button
            aria-label="Cerrar formulario"
            className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-2xl text-slate-600 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
            onClick={onClose}
            type="button"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <div className="px-5 py-6 sm:px-7">
          <ClientForm
            initialValues={client ? clientToFormValues(client) : EMPTY_CLIENT_FORM}
            mode={mode}
            onCancel={onClose}
            onSubmit={onSubmit}
          />
        </div>
      </section>
    </div>
  );
}
