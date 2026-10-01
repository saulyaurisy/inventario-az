import type { UserRole } from "@/features/auth";

export interface NavigationItem {
  label: string;
  shortLabel: string;
  href: string;
  roles: readonly UserRole[];
}

const ALL_ROLES: readonly UserRole[] = ["admin", "agent"];

export const NAVIGATION_ITEMS: readonly NavigationItem[] = [
  { label: "Dashboard", shortLabel: "DB", href: "/dashboard", roles: ALL_ROLES },
  { label: "Productos", shortLabel: "PR", href: "/products", roles: ["admin"] },
  { label: "Clientes", shortLabel: "CL", href: "/clients", roles: ALL_ROLES },
  { label: "Inventario", shortLabel: "IN", href: "/inventory", roles: ALL_ROLES },
  { label: "Kardex", shortLabel: "KX", href: "/kardex", roles: ALL_ROLES },
  {
    label: "Reposiciones",
    shortLabel: "RE",
    href: "/replenishments",
    roles: ALL_ROLES,
  },
  { label: "Ventas", shortLabel: "VE", href: "/sales", roles: ALL_ROLES },
  { label: "Comprobantes", shortLabel: "CP", href: "/payment-proofs", roles: ["admin"] },
  { label: "Proveedores", shortLabel: "PV", href: "/suppliers", roles: ["admin"] },
  { label: "Compras", shortLabel: "CO", href: "/purchases", roles: ["admin"] },
  { label: "Reportes", shortLabel: "RP", href: "/reports", roles: ALL_ROLES },
];

export function getNavigationForRole(role: UserRole): NavigationItem[] {
  return NAVIGATION_ITEMS.filter((item) => item.roles.includes(role));
}

export function getNavigationItem(pathname: string): NavigationItem | undefined {
  return NAVIGATION_ITEMS.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
}
