import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/server/auth";
import { withUser } from "@/server/db";
import { assignClientAction } from "@/server/actions";
import { formatBudget, formatIST } from "@/lib/format";
import { ActionForm, Field, selectCls } from "../../../form";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ClientDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const data = await withUser(user.id, async (c) => {
    const cl = (await c.query("select * from clients where id = $1", [id])).rows[0]; // RLS hides other designers' clients
    if (!cl) return null;
    const asg = (await c.query(
      "select d.id, d.full_name, a.assigned_at from designer_assignments a join designers d on d.id = a.designer_id where a.client_id = $1 and a.unassigned_at is null", [id])).rows[0];
    const designers = user.canAssign ? (await c.query("select id, full_name from designers where is_active order by full_name")).rows : [];
    return { cl, asg, designers };
  });
  if (!data) notFound();
  const { cl, asg, designers } = data;
  const rows: [string, React.ReactNode][] = [
    ["Phone", cl.phone], ["Email", cl.email ?? "—"], ["Project type", cl.project_type ?? "—"],
    ["Location", cl.project_location ?? "—"], ["Property type", cl.property_type ?? "—"],
    ["Carpet area", cl.area_value ? `${Number(cl.area_value)} ${cl.area_unit === "sqm" ? "sq m" : "sq ft"}` : "—"],
    ["Stated budget", formatBudget(cl.budget_min, cl.budget_max)], ["Timeline", cl.timeline ?? "—"],
    ["Expected start", cl.expected_start_date ? String(cl.expected_start_date).slice(0, 10) : "—"],
    ["Requirements", cl.requirements ?? "—"], ["Lead stage", cl.lead_stage], ["Qualification", cl.qualification_status],
    ["Added", formatIST(cl.created_at)],
  ];
  return (
    <div className="max-w-2xl">
      <Link href="/clients" className="text-sm underline">← Clients</Link>
      <h1 className="mb-1 mt-2 text-2xl font-semibold">{cl.full_name}</h1>
      <p className="mb-6 text-sm text-slate-500">
        Assigned designer: {asg ? <Link className="underline" href={`/designers/${asg.id}`}>{asg.full_name}</Link> : <span className="text-amber-700">Unassigned</span>}
      </p>
      <dl className="divide-y divide-stone-100 rounded-lg border border-stone-200 bg-white">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-3 gap-4 p-3 text-sm"><dt className="text-slate-500">{k}</dt><dd className="col-span-2 whitespace-pre-wrap">{v}</dd></div>
        ))}
      </dl>
      {user.canAssign && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold">{asg ? "Reassign designer" : "Assign designer"}</h2>
          <ActionForm action={assignClientAction} submitLabel="Assign" className="max-w-sm">
            <input type="hidden" name="clientId" value={cl.id} />
            <Field label="Designer" name="designerId">
              <select name="designerId" required className={selectCls} defaultValue="">
                <option value="" disabled>Choose a designer…</option>
                {designers.map((d: { id: string; full_name: string }) => <option key={d.id} value={d.id}>{d.full_name}</option>)}
              </select>
            </Field>
          </ActionForm>
        </section>
      )}
    </div>
  );
}
