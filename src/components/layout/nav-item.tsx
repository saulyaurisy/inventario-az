import Link from "next/link";

import type { NavigationItem } from "./navigation";

interface NavItemProps {
  active: boolean;
  item: NavigationItem;
  onNavigate?: () => void;
}

export function NavItem({ active, item, onNavigate }: NavItemProps) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={`group flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#13251d] ${
        active
          ? "bg-emerald-200/12 text-emerald-100 shadow-[inset_3px_0_0_#6ee7a2]"
          : "text-emerald-50/70 hover:bg-white/[0.055] hover:text-white"
      }`}
      href={item.href}
      onClick={onNavigate}
    >
      <span
        aria-hidden="true"
        className={`flex size-7 shrink-0 items-center justify-center rounded-md text-[9px] font-bold tracking-wider transition ${
          active
            ? "bg-emerald-300 text-emerald-950"
            : "bg-white/[0.055] text-emerald-100/55 group-hover:bg-white/10 group-hover:text-white"
        }`}
      >
        {item.shortLabel}
      </span>
      <span>{item.label}</span>
    </Link>
  );
}
