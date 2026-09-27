"use client";

import { useAuth } from "../hooks/use-auth";
import { getRoleLabel } from "../utils/roles";

export function DashboardContent() {
  const { profile } = useAuth();

  if (!profile) {
    return null;
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl bg-slate-950 px-6 py-8 text-white shadow-xl shadow-slate-200 sm:px-8 sm:py-10">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-400">
          Sesión activa
        </p>
        <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
          Bienvenido, {profile.displayName}
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
          Tu espacio de trabajo está listo. Actualmente tienes acceso como{" "}
          <span className="font-semibold text-white">
            {getRoleLabel(profile.role)}
          </span>
          .
        </p>
      </section>

      <section aria-labelledby="dashboard-preview-title">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-emerald-700">Vista general</p>
            <h3
              className="mt-1 text-xl font-bold tracking-tight text-slate-950"
              id="dashboard-preview-title"
            >
              Próximos módulos
            </h3>
          </div>
          <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-600">
            Sin datos reales
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[
            ["Ventas", "Registro y seguimiento comercial", "VE"],
            ["Inventario", "Control de existencias", "IN"],
            ["Reposiciones", "Planificación de abastecimiento", "RE"],
          ].map(([title, description, initials]) => (
            <article
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              key={title}
            >
              <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-100 text-xs font-black text-emerald-800">
                {initials}
              </div>
              <h4 className="mt-5 font-bold text-slate-950">{title}</h4>
              <p className="mt-1 text-sm text-slate-500">{description}</p>
              <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-emerald-700">
                Próximamente
              </p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
