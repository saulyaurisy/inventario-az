import { RoleRoute } from "@/features/auth";
import { ProductsContent } from "@/features/products";

export default function ProductsPage() {
  return (
    <RoleRoute allowedRoles={["admin"]}>
      <ProductsContent />
    </RoleRoute>
  );
}
