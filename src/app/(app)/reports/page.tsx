import { RoleRoute } from "@/features/auth";
import { ReportsContent } from "@/features/reports";

export default function ReportsPage() {
  return (
    <RoleRoute allowedRoles={["admin", "agent"]}>
      <ReportsContent />
    </RoleRoute>
  );
}
