import { ModulePlaceholder } from "@/components/layout";
import { RoleRoute } from "@/features/auth";

export default function ProductsPage() {
  return (
    <RoleRoute allowedRoles={["admin"]}>
      <ModulePlaceholder
        description="Gestión del catálogo de productos y su información base."
        title="Productos"
      />
    </RoleRoute>
  );
}
