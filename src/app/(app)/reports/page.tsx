import { ModulePlaceholder } from "@/components/layout";
import { RoleRoute } from "@/features/auth";

export default function ReportsPage() {
  return (
    <RoleRoute allowedRoles={["admin"]}>
      <ModulePlaceholder
        description="Indicadores y reportes para la toma de decisiones."
        title="Reportes"
      />
    </RoleRoute>
  );
}
