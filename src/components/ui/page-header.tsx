import type { ReactNode } from "react";

interface PageHeaderProps {
  actions?: ReactNode;
  context?: string;
  description?: string;
  title: string;
}

export function PageHeader({ actions, context, description, title }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-4 rounded-[1.125rem] border border-[#dce5df] bg-white px-5 py-5 shadow-[0_1px_2px_rgb(18_55_37_/_0.04),0_12px_32px_rgb(18_55_37_/_0.05)] sm:px-6 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        {context ? <p className="text-xs font-semibold text-emerald-700">{context}</p> : null}
        <h2 className="mt-1 text-2xl font-bold tracking-[-0.035em] text-slate-950 sm:text-[1.75rem]">
          {title}
        </h2>
        {description ? <p className="mt-1.5 max-w-3xl text-sm leading-6 text-slate-600">{description}</p> : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </header>
  );
}
