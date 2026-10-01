"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";

import { useAuth } from "@/features/auth";

import { AppHeader } from "./header";
import { MobileSidebar } from "./mobile-sidebar";
import { getNavigationForRole, getNavigationItem } from "./navigation";
import { DesktopSidebar } from "./sidebar";

export function AppShell({ children }: React.PropsWithChildren) {
  const pathname = usePathname();
  const { error, profile, signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  if (!profile) {
    return null;
  }

  const navigationItems = getNavigationForRole(profile.role);
  const currentItem = getNavigationItem(pathname);

  async function handleSignOut() {
    setIsSigningOut(true);
    await signOut();
    setIsSigningOut(false);
  }

  const sidebarProps = {
    currentPath: pathname,
    isSigningOut,
    items: navigationItems,
    onSignOut: handleSignOut,
    profile,
  };

  return (
    <div className="min-h-[100dvh] bg-transparent">
      <a className="skip-link" href="#main-content">
        Saltar al contenido
      </a>
      <DesktopSidebar {...sidebarProps} />
      <MobileSidebar
        {...sidebarProps}
        onClose={() => setMobileMenuOpen(false)}
        open={mobileMenuOpen}
      />

      <div className="min-w-0 lg:pl-64">
        <AppHeader
          isSigningOut={isSigningOut}
          onOpenMenu={() => setMobileMenuOpen(true)}
          onSignOut={handleSignOut}
          profile={profile}
          title={currentItem?.label ?? "Sistema"}
        />
        <main className="app-content" id="main-content" tabIndex={-1}>
          {error ? (
            <div
              className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
              role="alert"
            >
              {error}
            </div>
          ) : null}
          {children}
        </main>
        <footer className="mx-auto flex w-full max-w-[120rem] flex-col gap-1 px-4 pb-6 text-center text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <span>Inventario AZ · Operación comercial</span>
          <span>Desarrollado por Saúl Yauri · <a className="font-semibold text-emerald-700 hover:text-emerald-900" href="https://www.instagram.com/syxnb.10" rel="noopener noreferrer" target="_blank">IG @syxnb.10</a> · <a className="font-semibold text-emerald-700 hover:text-emerald-900" href="https://wa.me/51961407627" rel="noopener noreferrer" target="_blank">WhatsApp</a></span>
        </footer>
      </div>
    </div>
  );
}
