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
    <div className="min-h-screen bg-slate-50">
      <DesktopSidebar {...sidebarProps} />
      <MobileSidebar
        {...sidebarProps}
        onClose={() => setMobileMenuOpen(false)}
        open={mobileMenuOpen}
      />

      <div className="min-w-0 lg:pl-72">
        <AppHeader
          isSigningOut={isSigningOut}
          onOpenMenu={() => setMobileMenuOpen(true)}
          onSignOut={handleSignOut}
          profile={profile}
          title={currentItem?.label ?? "Sistema"}
        />
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
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
      </div>
    </div>
  );
}
