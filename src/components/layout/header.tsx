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
    <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
      <div className="flex h-18 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <button
            aria-label="Abrir menú de navegación"
            className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 lg:hidden"
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
            <p className="text-xs font-medium text-slate-500">Inventario AZ</p>
            <h1 className="truncate text-lg font-bold tracking-tight text-slate-950 sm:text-xl">
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
              Rol: {getRoleLabel(profile.role)}
            </p>
          </div>
          <div
            aria-hidden="true"
            className="flex size-10 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-800"
          >
            {profile.displayName.slice(0, 1).toUpperCase()}
          </div>
          <button
            className="hidden rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:cursor-not-allowed disabled:opacity-60 md:block"
            disabled={isSigningOut}
            onClick={onSignOut}
            type="button"
          >
            {isSigningOut ? "Cerrando..." : "Cerrar sesión"}
          </button>
        </div>
      </div>
    </header>
  );
}
