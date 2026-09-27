import { RoleRoute } from "@/features/auth";
import { ClientsContent } from "@/features/clients";

export default function ClientsPage() {
  return (
    <RoleRoute allowedRoles={["admin", "agent"]}>
      <ClientsContent />
    </RoleRoute>
  );
}
