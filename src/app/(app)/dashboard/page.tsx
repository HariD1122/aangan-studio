import { requireUser } from "@/server/auth";
import { withUser } from "@/server/db";

export const metadata = { title: "Dashboard – Aangan Studio" };

export default async function Dashboard() {
  const user = await requireUser();
  const s = await withUser(user.id, async (c) => {
    const r = await c.query(`
      select
        (select count(*) from clients)::int as clients,
        (select count(*) from clients cl where not exists
           (select 1 from designer_assignments a where a.client_id = cl.id and a.unassigned_at is null))::int as unassigned,
        (select count(*) from designers where is_active)::int as designers`);
    return r.rows[0] as { clients: number; unassigned: number; designers: number };
  });
  const cards = [
    { label: user.role === "designer" ? "My clients" : "Clients", value: s.clients },
    ...(user.role === "designer" ? [] : [{ label: "Unassigned clients", value: s.unassigned }, { label: "Active designers", value: s.designers }]),
  ];
  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Dashboard</h1>
      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-lg border border-stone-200 bg-white p-5">
            <div className="text-sm text-slate-500">{c.label}</div>
            <div className="mt-1 text-3xl font-semibold">{c.value}</div>
          </div>
        ))}
      </div>
      <p className="mt-6 text-sm text-slate-500">
        These are live counts from the database. Call, pipeline and response-time metrics will appear once phone enquiries
        are connected (later phase); until then they are not shown rather than estimated.
      </p>
    </div>
  );
}
