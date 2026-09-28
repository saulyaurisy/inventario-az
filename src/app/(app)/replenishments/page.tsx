import { RoleRoute } from "@/features/auth";
import { ReplenishmentsContent } from "@/features/replenishments";

export default function ReplenishmentsPage() {
  return (
    <RoleRoute allowedRoles={["admin", "agent"]}>
      <ReplenishmentsContent />
    </RoleRoute>
  );
}
