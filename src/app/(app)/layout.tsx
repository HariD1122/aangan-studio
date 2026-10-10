import Link from "next/link";
import { requireUser, type Role } from "@/server/auth";
import { logoutAction } from "@/server/actions";

const NAV: { href: string; label: string; roles: Role[] }[] = [
  { href: "/dashboard", label: "Dashboard", roles: ["admin", "front_desk", "designer", "viewer"] },
  { href: "/clients", label: "Clients", roles: ["admin", "front_desk", "designer", "viewer"] },
  { href: "/designers", label: "Designers", roles: ["admin", "front_desk", "designer", "viewer"] },
  { href: "/staff", label: "Staff & access", roles: ["admin"] },
];

const ROLE_LABEL: Record<Role, string> = { admin: "Admin / Owner", front_desk: "Front desk", designer: "Designer", viewer: "Viewer (read-only)" };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="flex min-h-screen bg-stone-50 text-slate-900">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-stone-200 bg-white p-4 md:flex">
        <div className="mb-6 text-lg font-semibold">Aangan Studio</div>
        <nav className="flex flex-1 flex-col gap-1" aria-label="Main">
          {NAV.filter((n) => n.roles.includes(user.role)).map((n) => (
            <Link key={n.href} href={n.href} className="rounded px-3 py-2 text-sm hover:bg-amber-50 focus:bg-amber-50 focus:outline-none focus:ring-1 focus:ring-slate-900">
              {n.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-stone-200 bg-white px-4 py-3">
          <nav className="flex gap-3 text-sm md:hidden" aria-label="Mobile">
            {NAV.filter((n) => n.roles.includes(user.role)).map((n) => <Link key={n.href} href={n.href}>{n.label}</Link>)}
          </nav>
          <div className="ml-auto flex items-center gap-4 text-sm">
            <span>{user.fullName || user.email} <span className="text-slate-500">· {ROLE_LABEL[user.role]}</span></span>
            <form action={logoutAction}><button className="rounded border border-stone-300 px-3 py-1 hover:bg-stone-100">Sign out</button></form>
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
