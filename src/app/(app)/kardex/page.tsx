import { RoleRoute } from "@/features/auth";
import { KardexContent } from "@/features/kardex";

export default function KardexPage() {
  return (
    <RoleRoute allowedRoles={["admin", "agent"]}>
      <KardexContent />
    </RoleRoute>
  );
}
