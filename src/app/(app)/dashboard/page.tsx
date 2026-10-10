import Link from "next/link";
import { requireUser } from "@/server/auth";
import { withUser } from "@/server/db";
import { acknowledgeAction, completeTaskAction, respondMeetingAction, respondTaskAction } from "@/server/schedule-actions";
import { istDateTime, istTime } from "@/lib/time";
import { Badge, Card, LinkButton, PageHeader, btn } from "@/components/ui";
import { RespondControls } from "@/components/respond";

export const metadata = { title: "Dashboard – Aangan Studio" };

const PRIORITY_TONE = { high: "danger", normal: "neutral", low: "neutral" } as const;

export default async function Dashboard() {
  const user = await requireUser();
  const isDesigner = user.role === "designer";
  const isAdmin = user.role === "admin";

  const s = await withUser(user.id, async (c) => {
    const counts = (await c.query(`
      select (select count(*) from clients)::int as clients,
             (select count(*) from clients cl where not exists
                (select 1 from designer_assignments a where a.client_id = cl.id and a.unassigned_at is null))::int as unassigned,
             (select count(*) from designers where is_active)::int as designers,
             (select count(*) from clients where is_demo)::int as demo`)).rows[0] as { clients: number; unassigned: number; designers: number; demo: number };

    // Designer view: row-level security limits these to their own rows.
    const requested = isDesigner ? (await c.query(
      `select m.id, m.title, m.starts_at, m.ends_at, m.location, m.description, cl.full_name as client
         from meetings m left join clients cl on cl.id = m.client_id where m.status = 'requested' order by m.starts_at`)).rows : [];
    const assigned = isDesigner ? (await c.query(
      `select t.id, t.title, t.description, t.due_date::text as due, t.priority, cl.full_name as client
         from tasks t left join clients cl on cl.id = t.client_id where t.status = 'assigned' order by t.created_at`)).rows : [];
    const active = isDesigner ? (await c.query(
      `select t.id, t.title, t.due_date::text as due, t.priority from tasks t where t.status = 'accepted' order by t.due_date nulls last`)).rows : [];
    const upcoming = isDesigner ? (await c.query(
      `select m.id, m.title, m.starts_at, m.location, cl.full_name as client from meetings m left join clients cl on cl.id = m.client_id
        where m.status = 'accepted' and m.ends_at > now() and m.starts_at < now() + interval '7 days' order by m.starts_at limit 8`)).rows : [];

    // Admin view
    const waiting = isAdmin ? (await c.query(
      `select (select count(*) from meetings where status = 'requested')::int as meetings,
              (select count(*) from tasks where status = 'assigned')::int as tasks`)).rows[0] as { meetings: number; tasks: number } : null;
    const responses = isAdmin ? (await c.query(
      `select * from (
         select 'meeting' as kind, m.id, m.title, m.status, m.rejection_reason as reason, m.responded_at, d.full_name as designer
           from meetings m join designers d on d.id = m.designer_id where m.status in ('accepted','rejected') and m.acknowledged_at is null
         union all
         select 'task', t.id, t.title, t.status, t.rejection_reason, t.responded_at, d.full_name
           from tasks t join designers d on d.id = t.designer_id where t.status in ('accepted','rejected') and t.acknowledged_at is null
       ) r order by responded_at desc limit 20`)).rows : [];
    return { counts, requested, assigned, active, upcoming, waiting, responses };
  });

  const cards = [
    { label: isDesigner ? "My clients" : "Clients", value: s.counts.clients },
    ...(isDesigner
      ? [{ label: "Meeting requests", value: s.requested.length }, { label: "Tasks to answer", value: s.assigned.length }]
      : [{ label: "Unassigned clients", value: s.counts.unassigned }, { label: "Active designers", value: s.counts.designers }]),
    ...(isAdmin && s.waiting ? [{ label: "Waiting on designers", value: s.waiting.meetings + s.waiting.tasks }] : []),
  ];

  return (
    <div>
      <PageHeader
        title={`Hello, ${(user.fullName || user.email).split(" ")[0]}`}
        subtitle={new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "full" }).format(new Date())}
        action={(isDesigner || isAdmin) ? <LinkButton href="/calendar" variant="secondary">{isAdmin ? "Team calendar" : "My calendar"}</LinkButton> : undefined}
      />
      {s.counts.demo > 0 && (
        <p role="note" className="mb-4 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
          Demo data is present: {s.counts.demo} of the {s.counts.clients} clients are sample records marked DEMO. They are not real business results.
        </p>
      )}
      <div className={`grid gap-4 ${cards.length > 3 ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
        {cards.map((c) => (
          <Card key={c.label} className="p-4">
            <div className="text-sm text-muted">{c.label}</div>
            <div className="mt-1 text-3xl font-semibold tabular-nums">{c.value}</div>
          </Card>
        ))}
      </div>

      {isDesigner && (
        <>
          <section className="mt-8" aria-labelledby="rec-meetings">
            <h2 id="rec-meetings" className="mb-3 text-lg font-semibold">Recommended meetings</h2>
            {s.requested.length === 0 ? (
              <p className="text-sm text-muted">No meeting requests waiting for you.</p>
            ) : (
              <div className="space-y-3">
                {s.requested.map((m) => (
                  <Card key={m.id} className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="font-medium">{m.title}</div>
                        <div className="text-sm text-muted">{istDateTime(m.starts_at)} – {istTime(m.ends_at)} (IST)</div>
                      </div>
                      <Badge tone="warning">Needs your answer</Badge>
                    </div>
                    {(m.client || m.location || m.description) && (
                      <p className="mt-2 text-sm">{[m.client && `Client: ${m.client}`, m.location && `Where: ${m.location}`, m.description].filter(Boolean).join(" · ")}</p>
                    )}
                    <RespondControls id={m.id} action={respondMeetingAction} />
                  </Card>
                ))}
              </div>
            )}
          </section>

          <section className="mt-8" aria-labelledby="assigned-tasks">
            <h2 id="assigned-tasks" className="mb-3 text-lg font-semibold">Assigned tasks</h2>
            {s.assigned.length === 0 ? (
              <p className="text-sm text-muted">No new tasks waiting for you.</p>
            ) : (
              <div className="space-y-3">
                {s.assigned.map((t) => (
                  <Card key={t.id} className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="font-medium">{t.title}</div>
                        <div className="text-sm text-muted">{t.due ? `Due ${t.due}` : "No due date"}{t.client ? ` · ${t.client}` : ""}</div>
                      </div>
                      <Badge tone={PRIORITY_TONE[t.priority as keyof typeof PRIORITY_TONE]}>{t.priority} priority</Badge>
                    </div>
                    {t.description && <p className="mt-2 text-sm">{t.description}</p>}
                    <RespondControls id={t.id} action={respondTaskAction} />
                  </Card>
                ))}
              </div>
            )}
          </section>

          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <section aria-labelledby="my-tasks">
              <h2 id="my-tasks" className="mb-3 text-lg font-semibold">My open tasks</h2>
              {s.active.length === 0 ? <p className="text-sm text-muted">Nothing in progress.</p> : (
                <Card className="divide-y divide-line">
                  {s.active.map((t) => (
                    <div key={t.id} className="flex items-center justify-between gap-2 p-3 text-sm">
                      <span><span className="font-medium">{t.title}</span><span className="block text-muted">{t.due ? `Due ${t.due}` : "No due date"}</span></span>
                      <form action={completeTaskAction}><input type="hidden" name="id" value={t.id} /><button className={`${btn.base} ${btn.secondary}`}>Mark done</button></form>
                    </div>
                  ))}
                </Card>
              )}
            </section>
            <section aria-labelledby="upcoming">
              <h2 id="upcoming" className="mb-3 text-lg font-semibold">Next 7 days</h2>
              {s.upcoming.length === 0 ? <p className="text-sm text-muted">No accepted meetings coming up.</p> : (
                <Card className="divide-y divide-line">
                  {s.upcoming.map((m) => (
                    <div key={m.id} className="p-3 text-sm">
                      <span className="font-medium">{m.title}</span>
                      <span className="block text-muted">{istDateTime(m.starts_at)}{m.client ? ` · ${m.client}` : ""}{m.location ? ` · ${m.location}` : ""}</span>
                    </div>
                  ))}
                </Card>
              )}
              <p className="mt-2 text-sm"><Link className="text-accent-strong underline" href="/calendar">Open full calendar</Link></p>
            </section>
          </div>
        </>
      )}

      {isAdmin && (
        <section className="mt-8" aria-labelledby="responses">
          <h2 id="responses" className="mb-3 text-lg font-semibold">Designer responses</h2>
          {s.responses.length === 0 ? (
            <p className="text-sm text-muted">No new responses. When a designer accepts or rejects a meeting or task, it shows up here with their reason.</p>
          ) : (
            <Card className="divide-y divide-line">
              {s.responses.map((r) => (
                <div key={`${r.kind}-${r.id}`} className="flex flex-wrap items-start justify-between gap-3 p-3 text-sm">
                  <div>
                    <div>
                      <Badge tone={r.status === "accepted" ? "success" : "danger"}>{r.status === "accepted" ? "Accepted" : "Rejected"}</Badge>{" "}
                      <span className="font-medium">{r.designer}</span> {r.status === "accepted" ? "accepted" : "rejected"} the {r.kind}{" "}
                      <span className="font-medium">&ldquo;{r.title}&rdquo;</span>
                    </div>
                    <div className="mt-0.5 text-muted">{istDateTime(r.responded_at)}</div>
                    {r.status === "rejected" && r.reason && <p className="mt-1 rounded-lg bg-danger-soft px-3 py-2 text-danger">Reason: {r.reason}</p>}
                  </div>
                  <form action={acknowledgeAction}>
                    <input type="hidden" name="id" value={r.id} /><input type="hidden" name="kind" value={r.kind} />
                    <button className={`${btn.base} ${btn.ghost}`}>Mark seen</button>
                  </form>
                </div>
              ))}
            </Card>
          )}
        </section>
      )}

      {!isDesigner && !isAdmin && <p className="mt-6 text-sm text-muted">These are live counts from the database.</p>}
    </div>
  );
}
