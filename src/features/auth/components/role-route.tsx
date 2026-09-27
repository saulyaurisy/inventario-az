"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import type { UserRole } from "../types/auth.types";
import { useAuth } from "../hooks/use-auth";
import { AuthLoading } from "./auth-loading";

interface RoleRouteProps extends React.PropsWithChildren {
  allowedRoles: readonly UserRole[];
}

export function RoleRoute({ allowedRoles, children }: RoleRouteProps) {
  const router = useRouter();
  const { hasRole, loading } = useAuth();
  const isAllowed = allowedRoles.some((role) => hasRole(role));

  useEffect(() => {
    if (!loading && !isAllowed) {
      router.replace("/dashboard");
    }
  }, [isAllowed, loading, router]);

  if (loading || !isAllowed) {
    return <AuthLoading message="Verificando permisos..." />;
  }

  return children;
}
