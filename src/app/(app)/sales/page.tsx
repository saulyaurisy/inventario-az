import { RoleRoute } from "@/features/auth";
import { SalesContent } from "@/features/sales";

export default function SalesPage() {
  return (
    <RoleRoute allowedRoles={["admin", "agent"]}>
      <SalesContent />
    </RoleRoute>
  );
}
