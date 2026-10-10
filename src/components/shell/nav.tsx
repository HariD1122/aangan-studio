"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export type NavItem = { href: string; label: string; icon: IconName };
type IconName = "home" | "clients" | "designers" | "staff" | "calendar" | "settings" | "chart";

const PATHS: Record<IconName, string> = {
  home: "M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  clients: "M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0zM4 21c0-4 3.6-6 8-6s8 2 8 6",
  designers: "M4 20l4-1L19 8a2.1 2.1 0 0 0-3-3L5 16zM14 7l3 3",
  calendar: "M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 10h16M8 3v4M16 3v4",
  chart: "M5 20V11M11 20V4M17 20v-6M3 20h18",
  settings: "M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M14 4v4M8 10v4M16 16v4",
  staff: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
};

function Icon({ name }: { name: IconName }) {
  return (
    <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d={PATHS[name]} />
    </svg>
  );
}

const isActive = (path: string, href: string) => path === href || path.startsWith(href + "/");

export function Sidebar({ items }: { items: NavItem[] }) {
  const path = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  return (
    <aside className={`hidden shrink-0 flex-col border-r border-line bg-surface p-3 transition-[width] md:flex ${collapsed ? "w-16" : "w-56"}`}>
      <div className={`mb-6 flex items-center ${collapsed ? "justify-center" : "justify-between px-2"}`}>
        {!collapsed && <span className="text-lg font-semibold tracking-tight">Aangan Studio</span>}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          className="rounded-lg p-2 text-muted hover:bg-accent-soft"
        >
          <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d={collapsed ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6"} /></svg>
        </button>
      </div>
      <nav aria-label="Main" className="flex flex-col gap-1">
        {items.map((n) => {
          const active = isActive(path, n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              title={collapsed ? n.label : undefined}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${collapsed ? "justify-center" : ""} ${active ? "bg-accent-soft text-accent-strong" : "text-ink hover:bg-accent-soft"}`}
            >
              <Icon name={n.icon} />
              {collapsed ? <span className="sr-only">{n.label}</span> : n.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

export function MobileNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-20 flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
      {items.map((n) => {
        const active = isActive(path, n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium ${active ? "text-accent-strong" : "text-muted"}`}
          >
            <Icon name={n.icon} />
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
