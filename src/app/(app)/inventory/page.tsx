import { RoleRoute } from "@/features/auth";
import { InventoryContent } from "@/features/inventory";

export default function InventoryPage() {
  return (
    <RoleRoute allowedRoles={["admin", "agent"]}>
      <InventoryContent />
    </RoleRoute>
  );
}
