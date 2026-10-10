import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/server/auth";
import { withUser } from "@/server/db";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function DesignerDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const data = await withUser(user.id, async (c) => {
    const d = (await c.query("select * from designers where id = $1", [id])).rows[0];
    if (!d) return null;
    const clients = (await c.query(
      `select cl.id, cl.full_name, cl.project_type, cl.lead_stage from designer_assignments a
         join clients cl on cl.id = a.client_id where a.designer_id = $1 and a.unassigned_at is null order by a.assigned_at desc`, [id])).rows;
    return { d, clients };
  });
  if (!data) notFound();
  const { d, clients } = data;
  return (
    <div className="max-w-2xl">
      <Link href="/designers" className="text-sm underline">← Designers</Link>
      <h1 className="mb-1 mt-2 text-2xl font-semibold">{d.full_name}</h1>
      <p className="mb-6 text-sm text-slate-500">{d.is_active ? "Active" : "Inactive"} · {d.experience_years != null ? `${d.experience_years} years experience` : "Experience not listed"}</p>
      <dl className="mb-8 divide-y divide-stone-100 rounded-lg border border-stone-200 bg-white text-sm">
        {([["Email", d.email], ["Phone", d.phone], ["Specializations", d.specializations.join(", ")], ["Portfolio", d.portfolio_url]] as const).map(([k, v]) => (
          <div key={k} className="grid grid-cols-3 gap-4 p-3"><dt className="text-slate-500">{k}</dt><dd className="col-span-2">{v || "—"}</dd></div>
        ))}
      </dl>
      <h2 className="mb-3 text-lg font-semibold">Assigned clients ({clients.length})</h2>
      {clients.length === 0 ? <p className="text-sm text-slate-500">No clients assigned.</p> : (
        <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200 bg-white">
          {clients.map((c) => (
            <li key={c.id} className="flex justify-between p-3 text-sm">
              <Link className="underline" href={`/clients/${c.id}`}>{c.full_name}</Link>
              <span className="text-slate-500">{c.project_type ?? "—"} · {c.lead_stage}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
