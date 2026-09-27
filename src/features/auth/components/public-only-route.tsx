"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useAuth } from "../hooks/use-auth";
import { AuthLoading } from "./auth-loading";

export function PublicOnlyRoute({ children }: React.PropsWithChildren) {
  const router = useRouter();
  const { isAuthenticated, loading } = useAuth();

  useEffect(() => {
    if (!loading && isAuthenticated) {
      router.replace("/dashboard");
    }
  }, [isAuthenticated, loading, router]);

  if (loading) {
    return <AuthLoading />;
  }

  if (isAuthenticated) {
    return <AuthLoading message="Redirigiendo al panel..." />;
  }

  return children;
}
