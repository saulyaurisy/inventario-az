interface ModulePlaceholderProps {
  description: string;
  title: string;
}

export function ModulePlaceholder({
  description,
  title,
}: ModulePlaceholderProps) {
  return (
    <section aria-labelledby="module-title">
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-gradient-to-br from-white to-emerald-50/70 p-6 sm:p-8">
          <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-800">
            Próximamente
          </span>
          <h2
            className="mt-4 text-3xl font-bold tracking-tight text-slate-950"
            id="module-title"
          >
            {title}
          </h2>
          <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
            {description}
          </p>
        </div>
        <div className="p-6 sm:p-8">
          <div className="flex min-h-44 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 text-center">
            <div>
              <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-white text-lg font-black text-emerald-700 shadow-sm">
                AZ
              </div>
              <p className="mt-4 font-semibold text-slate-800">
                Este módulo se implementará en una próxima issue.
              </p>
              <p className="mt-1 text-sm text-slate-500">
                La navegación y el acceso ya están preparados.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
