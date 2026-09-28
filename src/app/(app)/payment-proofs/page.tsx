import { RoleRoute } from "@/features/auth";
import { PaymentProofsContent } from "@/features/payment-proofs";

export default function PaymentProofsPage() {
  return <RoleRoute allowedRoles={["admin"]}><PaymentProofsContent /></RoleRoute>;
}
