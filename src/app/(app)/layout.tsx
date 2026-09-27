import { AppShell } from "@/components/layout";
import { ProtectedRoute } from "@/features/auth";

export default function AuthenticatedLayout({ children }: React.PropsWithChildren) {
  return (
    <ProtectedRoute>
      <AppShell>{children}</AppShell>
    </ProtectedRoute>
  );
}
