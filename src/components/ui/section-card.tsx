import type { ReactNode } from "react";

interface SectionCardProps {
  children: ReactNode;
  className?: string;
  description?: string;
  title?: string;
  titleId?: string;
}

export function SectionCard({ children, className = "", description, title, titleId }: SectionCardProps) {
  return (
    <section
      aria-labelledby={title ? titleId : undefined}
      className={`min-w-0 rounded-[1.125rem] border border-[#dce5df] bg-white p-5 shadow-[0_1px_2px_rgb(18_55_37_/_0.04),0_10px_28px_rgb(18_55_37_/_0.045)] ${className}`}
    >
      {title ? (
        <div className="mb-5">
          <h3 className="text-base font-bold tracking-[-0.015em] text-slate-950" id={titleId}>
            {title}
          </h3>
          {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
