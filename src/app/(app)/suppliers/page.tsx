import { RoleRoute } from "@/features/auth";
import { SuppliersContent } from "@/features/suppliers";

export default function SuppliersPage() {
  return <RoleRoute allowedRoles={["admin"]}><SuppliersContent /></RoleRoute>;
}
