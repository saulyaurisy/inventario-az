import Image from "next/image";

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
    <div className="flex h-full flex-col bg-[#13251d] text-white">
      <div className="border-b border-white/8 px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-[4.75rem] shrink-0 items-center rounded-lg bg-white px-2 shadow-sm">
            <Image
              alt="Azbel"
              className="h-auto w-full"
              height={718}
              priority
              src="/brand/azbel-logo.png"
              width={1900}
            />
          </div>
          <div className="min-w-0">
            <p className="font-semibold tracking-tight">Inventario AZ</p>
            <p className="mt-0.5 text-xs text-emerald-100/55">Operación comercial</p>
          </div>
        </div>
      </div>

      <nav aria-label="Navegación principal" className="flex-1 overflow-y-auto px-3 py-4">
        <p className="px-3 pb-2 text-[11px] font-semibold tracking-wide text-emerald-100/45">
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

      <div className="border-t border-white/8 p-3">
        <div className="flex items-center gap-3 rounded-xl bg-white/[0.045] p-3">
          <div aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-200/12 text-xs font-bold text-emerald-100">
            {profile.displayName.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">
            {profile.displayName}
          </p>
          <p className="mt-0.5 text-xs text-emerald-100/55">
            {getRoleLabel(profile.role)}
          </p>
          </div>
        </div>
        <button
          className="mt-2 flex w-full items-center justify-center rounded-lg px-3 py-2 text-sm font-semibold text-emerald-50/75 hover:bg-white/[0.06] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
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
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-emerald-950/70 lg:block">
      <SidebarContent {...props} />
    </aside>
  );
}
