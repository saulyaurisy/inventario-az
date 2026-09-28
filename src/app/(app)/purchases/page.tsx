import { RoleRoute } from "@/features/auth";
import { PurchasesContent } from "@/features/purchases";

export default function PurchasesPage() { return <RoleRoute allowedRoles={["admin"]}><PurchasesContent /></RoleRoute>; }
