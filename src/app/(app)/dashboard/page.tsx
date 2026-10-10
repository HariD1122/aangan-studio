import { requireUser } from "@/server/auth";
import { withUser } from "@/server/db";
import { Card, PageHeader } from "@/components/ui";

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
      <PageHeader title={`Hello, ${(user.fullName || user.email).split(" ")[0]}`} subtitle={new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "full" }).format(new Date())} />
      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <Card key={c.label} className="p-4">
            <div className="text-sm text-muted">{c.label}</div>
            <div className="mt-1 text-3xl font-semibold tabular-nums">{c.value}</div>
          </Card>
        ))}
      </div>
      <p className="mt-6 text-sm text-muted">
        These are live counts from the database. Call, pipeline and response-time metrics will appear once phone enquiries
        are connected (later phase); until then they are not shown rather than estimated.
      </p>
    </div>
  );
}
