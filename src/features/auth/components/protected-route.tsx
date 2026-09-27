"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useAuth } from "../hooks/use-auth";
import { AuthLoading } from "./auth-loading";

export function ProtectedRoute({ children }: React.PropsWithChildren) {
  const router = useRouter();
  const { isAuthenticated, loading } = useAuth();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, loading, router]);

  if (loading) {
    return <AuthLoading />;
  }

  if (!isAuthenticated) {
    return <AuthLoading message="Redirigiendo al inicio de sesión..." />;
  }

  return children;
}
