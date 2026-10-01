import Image from "next/image";

import type { UserProfile } from "@/features/auth";
import { getRoleLabel } from "@/features/auth";

interface AppHeaderProps {
  isSigningOut: boolean;
  onOpenMenu: () => void;
  onSignOut: () => void;
  profile: UserProfile;
  title: string;
}

export function AppHeader({
  isSigningOut,
  onOpenMenu,
  onSignOut,
  profile,
  title,
}: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-[#dce5df]/90 bg-[#f8faf9]/92 backdrop-blur-xl">
      <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <button
            aria-label="Abrir menú de navegación"
            className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-[#c8d5cd] bg-white text-slate-700 shadow-sm hover:bg-emerald-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 lg:hidden"
            onClick={onOpenMenu}
            type="button"
          >
            <span aria-hidden="true" className="space-y-1">
              <span className="block h-0.5 w-5 rounded bg-current" />
              <span className="block h-0.5 w-5 rounded bg-current" />
              <span className="block h-0.5 w-5 rounded bg-current" />
            </span>
          </button>
          <div className="min-w-0">
            <div className="mb-0.5 flex items-center gap-2">
              <Image alt="Azbel" className="h-auto w-[3.75rem]" height={718} priority src="/brand/azbel-logo.png" width={1900} />
              <span className="sr-only">Inventario AZ</span>
            </div>
            <h1 className="truncate text-lg font-bold tracking-[-0.02em] text-slate-950">
              {title}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <p className="max-w-48 truncate text-sm font-semibold text-slate-900">
              {profile.displayName}
            </p>
            <p className="text-xs text-slate-500">
              {getRoleLabel(profile.role)}
            </p>
          </div>
          <div
            aria-hidden="true"
            className="flex size-9 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-sm font-bold text-emerald-800"
          >
            {profile.displayName.slice(0, 1).toUpperCase()}
          </div>
          <button
            className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-white hover:text-slate-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:cursor-not-allowed disabled:opacity-60 md:block"
            disabled={isSigningOut}
            onClick={onSignOut}
            type="button"
          >
            {isSigningOut ? "Cerrando..." : "Salir"}
          </button>
        </div>
      </div>
    </header>
  );
}
