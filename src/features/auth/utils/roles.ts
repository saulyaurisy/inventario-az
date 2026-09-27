import type { UserProfile, UserRole } from "../types/auth.types";

const ROLE_LABELS: Readonly<Record<UserRole, string>> = {
  admin: "Administrador",
  agent: "Agente",
};

export function hasRole(
  profile: UserProfile | null,
  role: UserRole,
): boolean {
  return profile?.role === role;
}

export function getRoleLabel(role: UserRole): string {
  return ROLE_LABELS[role];
}
