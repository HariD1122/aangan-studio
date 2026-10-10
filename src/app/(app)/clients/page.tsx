import Link from "next/link";
import { requireUser } from "@/server/auth";
import { withUser } from "@/server/db";
import { formatBudget } from "@/lib/format";
import { Suspense } from "react";
import { SearchBox } from "@/components/shell/search-box";
import { Badge, EmptyState, LinkButton, PageHeader } from "@/components/ui";

export const metadata = { title: "Clients – Aangan Studio" };
const PAGE = 25;

export default async function Clients({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 80);
  const page = Math.max(1, Number(sp.page) || 1);
  const canCreate = user.role === "admin" || user.role === "front_desk";
  const rows = await withUser(user.id, async (c) =>
    (await c.query(
      `select cl.id, cl.full_name, cl.phone, cl.project_type, cl.budget_min, cl.budget_max, cl.lead_stage, cl.is_demo, d.full_name as designer
         from clients cl
         left join designer_assignments a on a.client_id = cl.id and a.unassigned_at is null
         left join designers d on d.id = a.designer_id
        where ($1 = '' or cl.full_name ilike '%'||$1||'%' or cl.phone like '%'||$1||'%')
        order by cl.created_at desc limit $2 offset $3`,
      [q, PAGE + 1, (page - 1) * PAGE],
    )).rows,
  );
  const more = rows.length > PAGE;
  return (
    <div>
      <PageHeader title="Clients" subtitle={user.role === "designer" ? "Clients assigned to you" : undefined}
        action={canCreate ? <LinkButton href="/clients/new">Add client</LinkButton> : undefined} />
      <Suspense fallback={null}><SearchBox className="mb-4 max-w-sm" /></Suspense>
      {rows.length === 0 ? (
        q ? (
          <EmptyState title="No clients match your search" action={<LinkButton href="/clients" variant="secondary">Clear search</LinkButton>}>
            Try a different name or part of the phone number.
          </EmptyState>
        ) : user.role === "designer" ? (
          <EmptyState title="No clients assigned yet">When the studio assigns you a client, they will appear here.</EmptyState>
        ) : (
          <EmptyState title="No clients yet" action={canCreate ? <LinkButton href="/clients/new">Add the first client</LinkButton> : undefined}>
            Clients appear here after a call is logged or someone adds them.
          </EmptyState>
        )
      ) : (
        <>
          <ul className="space-y-3 md:hidden">
            {rows.slice(0, PAGE).map((r) => (
              <li key={r.id}>
                <Link href={`/clients/${r.id}`} className="block rounded-xl border border-line bg-surface p-4 active:bg-accent-soft">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium">{r.full_name}{r.is_demo && <span className="ml-2 align-middle"><Badge tone="warning">DEMO</Badge></span>}</span>
                    <Badge tone={r.designer ? "success" : "warning"}>{r.designer ? "Assigned" : "New enquiry"}</Badge>
                  </div>
                  <div className="mt-1 text-sm text-muted">{r.project_type ?? "Project type not set"} · {formatBudget(r.budget_min, r.budget_max)}</div>
                  <div className="mt-1 text-sm">{r.designer ?? <span className="text-warning">Unassigned</span>}</div>
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto rounded-xl border border-line bg-surface md:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-accent-soft/60 text-muted">
                <tr><th className="p-3 font-medium">Name</th><th className="p-3 font-medium">Phone</th><th className="p-3 font-medium">Project</th><th className="p-3 font-medium">Budget</th><th className="p-3 font-medium">Status</th><th className="p-3 font-medium">Designer</th></tr>
              </thead>
              <tbody>
                {rows.slice(0, PAGE).map((r) => (
                  <tr key={r.id} className="border-t border-line hover:bg-accent-soft/40">
                    <td className="p-3"><Link className="font-medium text-accent-strong underline" href={`/clients/${r.id}`}>{r.full_name}</Link>{r.is_demo && <span className="ml-2"><Badge tone="warning">DEMO</Badge></span>}</td>
                    <td className="p-3">{r.phone}</td>
                    <td className="p-3">{r.project_type ?? "—"}</td>
                    <td className="p-3">{formatBudget(r.budget_min, r.budget_max)}</td>
                    <td className="p-3"><Badge tone={r.designer ? "success" : "warning"}>{r.designer ? "Assigned" : "New enquiry"}</Badge></td>
                    <td className="p-3">{r.designer ?? <span className="text-warning">Unassigned</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <div className="mt-4 flex gap-4 text-sm">
        {page > 1 && <Link href={`/clients?q=${encodeURIComponent(q)}&page=${page - 1}`}>← Previous</Link>}
        {more && <Link href={`/clients?q=${encodeURIComponent(q)}&page=${page + 1}`}>Next →</Link>}
      </div>
    </div>
  );
}
