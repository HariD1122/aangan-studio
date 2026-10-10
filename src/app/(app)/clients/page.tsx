import Link from "next/link";
import { requireUser } from "@/server/auth";
import { withUser } from "@/server/db";
import { formatBudget } from "@/lib/format";

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
      `select cl.id, cl.full_name, cl.phone, cl.project_type, cl.budget_min, cl.budget_max, cl.lead_stage, d.full_name as designer
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
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Clients</h1>
        {canCreate && <Link href="/clients/new" className="rounded bg-slate-900 px-4 py-2 text-sm text-white">Add client</Link>}
      </div>
      <form className="mb-4"><input name="q" defaultValue={q} placeholder="Search name or phone" aria-label="Search clients"
        className="w-full max-w-sm rounded border border-stone-300 bg-white px-3 py-2 text-sm" /></form>
      {rows.length === 0 ? (
        <p className="rounded border border-dashed border-stone-300 bg-white p-8 text-center text-sm text-slate-500">
          {user.role === "designer" ? "No clients are assigned to you yet." : "No clients found."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-stone-100 text-slate-600">
              <tr><th className="p-3">Name</th><th className="p-3">Phone</th><th className="p-3">Project</th><th className="p-3">Budget</th><th className="p-3">Stage</th><th className="p-3">Designer</th></tr>
            </thead>
            <tbody>
              {rows.slice(0, PAGE).map((r) => (
                <tr key={r.id} className="border-t border-stone-100 hover:bg-amber-50/40">
                  <td className="p-3"><Link className="font-medium underline" href={`/clients/${r.id}`}>{r.full_name}</Link></td>
                  <td className="p-3">{r.phone}</td>
                  <td className="p-3">{r.project_type ?? "—"}</td>
                  <td className="p-3">{formatBudget(r.budget_min, r.budget_max)}</td>
                  <td className="p-3">{r.lead_stage}</td>
                  <td className="p-3">{r.designer ?? <span className="text-amber-700">Unassigned</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-4 flex gap-4 text-sm">
        {page > 1 && <Link href={`/clients?q=${encodeURIComponent(q)}&page=${page - 1}`}>← Previous</Link>}
        {more && <Link href={`/clients?q=${encodeURIComponent(q)}&page=${page + 1}`}>Next →</Link>}
      </div>
    </div>
  );
}
