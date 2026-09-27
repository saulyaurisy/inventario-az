import type { UserProfile } from "@/features/auth";
import { getRoleLabel } from "@/features/auth";

import { NavItem } from "./nav-item";
import type { NavigationItem } from "./navigation";

interface SidebarContentProps {
  currentPath: string;
  isSigningOut: boolean;
  items: readonly NavigationItem[];
  onNavigate?: () => void;
  onSignOut: () => void;
  profile: UserProfile;
}

export function SidebarContent({
  currentPath,
  isSigningOut,
  items,
  onNavigate,
  onSignOut,
  profile,
}: SidebarContentProps) {
  return (
    <div className="flex h-full flex-col bg-slate-950 text-white">
      <div className="border-b border-white/10 px-5 py-6">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-emerald-400 text-sm font-black tracking-tight text-emerald-950 shadow-lg shadow-emerald-950/30">
            AZ
          </div>
          <div>
            <p className="font-semibold tracking-tight">Inventario AZ</p>
            <p className="mt-0.5 text-xs text-slate-400">Gestión comercial</p>
          </div>
        </div>
      </div>

      <nav aria-label="Navegación principal" className="flex-1 overflow-y-auto px-3 py-5">
        <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          Módulos
        </p>
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.href}>
              <NavItem
                active={
                  currentPath === item.href ||
                  currentPath.startsWith(`${item.href}/`)
                }
                item={item}
                onNavigate={onNavigate}
              />
            </li>
          ))}
        </ul>
      </nav>

      <div className="border-t border-white/10 p-4">
        <div className="rounded-xl bg-white/5 p-3">
          <p className="truncate text-sm font-semibold text-white">
            {profile.displayName}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Rol: {getRoleLabel(profile.role)}
          </p>
        </div>
        <button
          className="mt-3 flex w-full items-center justify-center rounded-xl border border-white/10 px-3 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-white/20 hover:bg-white/8 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSigningOut}
          onClick={onSignOut}
          type="button"
        >
          {isSigningOut ? "Cerrando sesión..." : "Cerrar sesión"}
        </button>
      </div>
    </div>
  );
}

export function DesktopSidebar(props: SidebarContentProps) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-slate-800 lg:block">
      <SidebarContent {...props} />
    </aside>
  );
}
