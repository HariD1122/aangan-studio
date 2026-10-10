import { requireUser, type Role } from "@/server/auth";
import { logoutAction } from "@/server/actions";
import { MobileNav, Sidebar, type NavItem } from "@/components/shell/nav";
import { Topbar } from "@/components/shell/topbar";

const NAV: (NavItem & { roles: Role[] })[] = [
  { href: "/dashboard", label: "Dashboard", icon: "home", roles: ["admin", "front_desk", "designer", "viewer"] },
  { href: "/clients", label: "Clients", icon: "clients", roles: ["admin", "front_desk", "designer", "viewer"] },
  { href: "/calendar", label: "Calendar", icon: "calendar", roles: ["admin", "designer"] },
  { href: "/designers", label: "Designers", icon: "designers", roles: ["admin", "front_desk", "viewer"] },
  { href: "/settings", label: "Integrations", icon: "settings", roles: ["admin"] },
  { href: "/staff", label: "Staff", icon: "staff", roles: ["admin"] },
];

const ROLE_LABEL: Record<Role, string> = { admin: "Admin / Owner", front_desk: "Front desk", designer: "Designer", viewer: "Viewer (read-only)" };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const items: NavItem[] = NAV.filter((n) => n.roles.includes(user.role)).map(({ href, label, icon }) => ({ href, label, icon }));
  return (
    <div className="flex min-h-screen">
      <a href="#content" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">Skip to content</a>
      <Sidebar items={items} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar name={user.fullName || user.email} roleLabel={ROLE_LABEL[user.role]} signOut={logoutAction} />
        <main id="content" className="mx-auto w-full max-w-5xl flex-1 px-4 pb-24 pt-6 md:px-8 md:pb-10">{children}</main>
      </div>
      <MobileNav items={items} />
    </div>
  );
}
