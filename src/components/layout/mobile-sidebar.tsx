import type { ComponentProps } from "react";

import { SidebarContent } from "./sidebar";

interface MobileSidebarProps extends ComponentProps<typeof SidebarContent> {
  open: boolean;
  onClose: () => void;
}

export function MobileSidebar({ open, onClose, ...props }: MobileSidebarProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <button
        aria-label="Cerrar menú de navegación"
        className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
        onClick={onClose}
        type="button"
      />
      <aside
        aria-label="Menú móvil"
        className="relative h-full w-[min(19rem,86vw)] shadow-2xl"
      >
        <button
          aria-label="Cerrar menú"
          className="absolute right-3 top-3 z-10 flex size-10 items-center justify-center rounded-xl text-2xl text-slate-300 transition hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          onClick={onClose}
          type="button"
        >
          <span aria-hidden="true">×</span>
        </button>
        <SidebarContent {...props} onNavigate={onClose} />
      </aside>
    </div>
  );
}
