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
      className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 ${
        active
          ? "bg-emerald-500/15 text-emerald-300"
          : "text-slate-300 hover:bg-white/7 hover:text-white"
      }`}
      href={item.href}
      onClick={onNavigate}
    >
      <span
        aria-hidden="true"
        className={`flex size-8 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold tracking-wider transition ${
          active
            ? "bg-emerald-400 text-emerald-950"
            : "bg-white/8 text-slate-400 group-hover:bg-white/12 group-hover:text-white"
        }`}
      >
        {item.shortLabel}
      </span>
      <span>{item.label}</span>
    </Link>
  );
}
