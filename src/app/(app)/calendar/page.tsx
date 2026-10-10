import Link from "next/link";
import { requireRole } from "@/server/auth";
import { withUser } from "@/server/db";
import { assignTaskAction, requestMeetingAction, withdrawAction } from "@/server/schedule-actions";
import { addDays, dayLabel, isKey, istDateTime, istKey, istTime, monthLabel, shiftMonth, startOfIstDay, todayKey, weekdayMon0 } from "@/lib/time";
import { layoutOverlaps } from "@/lib/layout";
import { Badge, Card, EmptyState, PageHeader, btn } from "@/components/ui";
import { ActionForm, Field, selectCls } from "../../form";

export const metadata = { title: "Calendar – Aangan Studio" };

const HOUR_H = 56; // px per hour in the time grid
const VIEWS = [["day", "Day"], ["workweek", "Work week"], ["week", "Week"], ["month", "Month"]] as const;
type View = (typeof VIEWS)[number][0];
// One colour per designer (light fill + strong left bar), like Teams' calendar colours.
const PALETTE = [
  { bg: "#f3e9df", bar: "#a65d3f" }, { bg: "#e3effa", bar: "#2f5fb3" }, { bg: "#e4f3ea", bar: "#1f7a4d" },
  { bg: "#f1e6f5", bar: "#7a3f93" }, { bg: "#e3f1f3", bar: "#1f6f7a" }, { bg: "#fbf0d6", bar: "#8a5a00" },
];

type Ev = { id: string; title: string; start: Date; end: Date; designerId: string; designer: string; client: string | null; location: string | null };
type Tk = { id: string; title: string; due: string; done: boolean; designerId: string; designer: string };

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ view?: string; date?: string; designer?: string; new?: string }> }) {
  const user = await requireRole("admin", "designer");
  const sp = await searchParams;
  const view: View = (VIEWS.map((v) => v[0]) as string[]).includes(sp.view ?? "") ? (sp.view as View) : "workweek";
  const anchor = isKey(sp.date) ? sp.date : todayKey();
  const isAdmin = user.role === "admin";
  const prefill = sp.new && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(sp.new) ? sp.new : undefined;

  const monday = addDays(anchor, -weekdayMon0(anchor));
  let days: string[];
  if (view === "day") days = [anchor];
  else if (view === "workweek") days = Array.from({ length: 5 }, (_, i) => addDays(monday, i));
  else if (view === "week") days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  else {
    const first = `${anchor.slice(0, 7)}-01`;
    const next = shiftMonth(first, 1);
    const weeks = Math.ceil((weekdayMon0(first) + (Date.parse(next) - Date.parse(first)) / 86_400_000) / 7);
    const start = addDays(first, -weekdayMon0(first));
    days = Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
  }
  const rangeStart = startOfIstDay(days[0]);
  const rangeEnd = startOfIstDay(addDays(days[days.length - 1], 1));

  const data = await withUser(user.id, async (c) => {
    const own = isAdmin ? null : (await c.query("select id from designers where user_id = $1", [user.id])).rows[0]?.id ?? null;
    const filter: string | null = isAdmin ? (sp.designer && /^[0-9a-f-]{36}$/i.test(sp.designer) ? sp.designer : null) : own;
    const designers = isAdmin ? (await c.query("select id, full_name, user_id is not null as has_login from designers where is_active order by full_name")).rows : [];
    const clients = isAdmin ? (await c.query("select id, full_name from clients order by full_name limit 300")).rows : [];
    const meetings: Ev[] = (await c.query(
      `select m.id, m.title, m.starts_at, m.ends_at, m.location, m.designer_id, d.full_name as designer, cl.full_name as client
         from meetings m join designers d on d.id = m.designer_id left join clients cl on cl.id = m.client_id
        where m.status = 'accepted' and m.starts_at < $2 and m.ends_at > $1 and ($3::uuid is null or m.designer_id = $3)
        order by m.starts_at`, [rangeStart, rangeEnd, filter])).rows
      .map((m) => ({ id: m.id, title: m.title, start: new Date(m.starts_at), end: new Date(m.ends_at), designerId: m.designer_id, designer: m.designer, client: m.client, location: m.location }));
    const tasks: Tk[] = (await c.query(
      `select t.id, t.title, t.due_date::text as due, t.status, t.designer_id, d.full_name as designer
         from tasks t join designers d on d.id = t.designer_id
        where t.status in ('accepted','completed') and t.due_date >= $1::date and t.due_date < $2::date and ($3::uuid is null or t.designer_id = $3)
        order by t.due_date`, [days[0], addDays(days[days.length - 1], 1), filter])).rows
      .map((t) => ({ id: t.id, title: t.title, due: t.due, done: t.status === "completed", designerId: t.designer_id, designer: t.designer }));
    const pending = isAdmin ? {
      meetings: (await c.query(
        `select m.id, m.title, m.starts_at, d.full_name as designer from meetings m join designers d on d.id = m.designer_id
          where m.status = 'requested' and ($1::uuid is null or m.designer_id = $1) order by m.starts_at`, [filter])).rows,
      tasks: (await c.query(
        `select t.id, t.title, t.due_date::text as due, d.full_name as designer from tasks t join designers d on d.id = t.designer_id
          where t.status = 'assigned' and ($1::uuid is null or t.designer_id = $1) order by t.created_at`, [filter])).rows,
    } : null;
    return { filter, designers, clients, meetings, tasks, pending };
  });

  const colourOf = (designerId: string) => {
    const i = data.designers.findIndex((d) => d.id === designerId);
    return PALETTE[(i < 0 ? 0 : i) % PALETTE.length];
  };

  const today = todayKey();
  const link = (over: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const merged = { view, date: anchor, designer: isAdmin ? data.filter ?? undefined : undefined, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
    return `/calendar?${q}`;
  };
  const step = view === "day" ? 1 : 7;
  const prev = view === "month" ? shiftMonth(anchor, -1) : addDays(anchor, -step);
  const next = view === "month" ? shiftMonth(anchor, 1) : addDays(anchor, step);
  const title =
    view === "month" ? monthLabel(anchor)
    : view === "day" ? new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${anchor}T12:00:00+05:30`))
    : `${dayLabel(days[0])} – ${dayLabel(days[days.length - 1])}`;

  // events per day (a meeting that crosses midnight shows on each day it touches)
  const eventsByDay = new Map<string, (Ev & { startMin: number; endMin: number })[]>();
  for (const d of days) {
    const ds = startOfIstDay(d).getTime();
    const de = ds + 86_400_000;
    for (const m of data.meetings) {
      if (m.start.getTime() < de && m.end.getTime() > ds) {
        const startMin = Math.max(0, (m.start.getTime() - ds) / 60000);
        const endMin = Math.min(1440, (m.end.getTime() - ds) / 60000);
        eventsByDay.set(d, [...(eventsByDay.get(d) ?? []), { ...m, startMin, endMin }]);
      }
    }
  }
  const tasksByDay = new Map<string, Tk[]>();
  for (const t of data.tasks) tasksByDay.set(t.due, [...(tasksByDay.get(t.due) ?? []), t]);

  // visible hour range: 7:00–20:00 by default, stretched to fit any event
  const allMins = [...eventsByDay.values()].flat();
  const startH = Math.min(7, ...allMins.map((e) => Math.floor(e.startMin / 60)));
  const endH = Math.max(20, ...allMins.map((e) => Math.ceil(e.endMin / 60)));
  const hours = Array.from({ length: endH - startH }, (_, i) => startH + i);
  const gridH = hours.length * HOUR_H;
  const hourLabel = (h: number) => new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: true, timeZone: "UTC" }).format(new Date(Date.UTC(2000, 0, 1, h)));
  const nowMin = (Date.now() - startOfIstDay(today).getTime()) / 60000;

  const nothing = days.every((d) => !eventsByDay.get(d)?.length && !tasksByDay.get(d)?.length);
  const showLegend = isAdmin && !data.filter && data.designers.length > 0;
  const monthPrefix = anchor.slice(0, 7);
  const cols = days.length;

  const eventTitle = (e: Ev) => [e.title, `${istTime(e.start)} – ${istTime(e.end)}`, isAdmin ? e.designer : null, e.client, e.location].filter(Boolean).join("\n");
  const chip = (key: string, label: string, sub: string, colour: { bg: string; bar: string }, done = false) => (
    <li key={key} className={`rounded-md border-l-4 px-2 py-1 text-xs leading-tight ${done ? "line-through opacity-60" : ""}`} style={{ background: colour.bg, borderColor: colour.bar }}>
      <span className="font-medium">{label}</span>
      {sub && <span className="block text-muted">{sub}</span>}
    </li>
  );

  return (
    <div>
      <PageHeader
        title={isAdmin ? "Team calendar" : "My calendar"}
        subtitle={isAdmin ? "Accepted meetings and tasks for each designer. Requests show here only after the designer accepts." : "Meetings you accepted and tasks you took on."}
      />

      {/* Teams-style toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Link href={link({ date: today })} className={`${btn.base} ${btn.secondary}`}>Today</Link>
        <div className="flex">
          <Link href={link({ date: prev })} aria-label="Previous" className={`${btn.base} ${btn.ghost} !px-3 text-lg`}>‹</Link>
          <Link href={link({ date: next })} aria-label="Next" className={`${btn.base} ${btn.ghost} !px-3 text-lg`}>›</Link>
        </div>
        <h2 className="text-base font-semibold md:text-lg">{title}</h2>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {isAdmin && (
            <form method="get" className="flex items-center gap-2">
              <input type="hidden" name="view" value={view} /><input type="hidden" name="date" value={anchor} />
              <label className="sr-only" htmlFor="designer-filter">Designer</label>
              <select id="designer-filter" name="designer" defaultValue={data.filter ?? ""} className={`${selectCls} !w-auto`}>
                <option value="">All designers</option>
                {data.designers.map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}
              </select>
              <button className={`${btn.base} ${btn.secondary}`}>Show</button>
            </form>
          )}
          <div className="flex rounded-lg border border-line bg-surface p-0.5 text-sm" role="group" aria-label="Calendar view">
            {VIEWS.map(([v, label]) => (
              <Link key={v} href={link({ view: v })} aria-current={view === v ? "page" : undefined}
                className={`rounded-md px-2.5 py-1.5 ${view === v ? "bg-accent text-white" : "hover:bg-accent-soft"}`}>{label}</Link>
            ))}
          </div>
          {isAdmin && <a href="#request-meeting" className={`${btn.base} ${btn.primary}`}>+ New meeting</a>}
        </div>
      </div>

      {showLegend && (
        <ul className="mb-3 flex flex-wrap gap-3 text-xs text-muted" aria-label="Designer colours">
          {data.designers.map((d, i) => (
            <li key={d.id} className="flex items-center gap-1.5"><span aria-hidden className="size-3 rounded-sm border-l-4" style={{ background: PALETTE[i % PALETTE.length].bg, borderColor: PALETTE[i % PALETTE.length].bar }} />{d.full_name}</li>
          ))}
        </ul>
      )}

      {/* ---- Desktop: time grid (day / work week / week) ---- */}
      {view !== "month" && (
        <Card className="mb-6 hidden overflow-hidden md:block">
          <div className="grid border-b border-line bg-surface" style={{ gridTemplateColumns: `56px repeat(${cols}, minmax(0, 1fr))` }}>
            <div />
            {days.map((d) => (
              <div key={d} className="border-l border-line py-2 text-center">
                <div className="text-xs text-muted">{new Intl.DateTimeFormat("en-IN", { weekday: "short", timeZone: "Asia/Kolkata" }).format(new Date(`${d}T12:00:00+05:30`))}</div>
                <div className={`mx-auto mt-0.5 flex size-8 items-center justify-center rounded-full text-lg ${d === today ? "bg-accent font-medium text-white" : ""}`}>{Number(d.slice(8))}</div>
              </div>
            ))}
          </div>
          {days.some((d) => tasksByDay.get(d)?.length) && (
            <div className="grid border-b border-line bg-canvas" style={{ gridTemplateColumns: `56px repeat(${cols}, minmax(0, 1fr))` }}>
              <div className="px-1 py-2 text-right text-[11px] text-muted">Tasks due</div>
              {days.map((d) => (
                <ul key={d} className="space-y-1 border-l border-line p-1">
                  {(tasksByDay.get(d) ?? []).map((t) => chip(t.id, t.title, isAdmin && !data.filter ? t.designer : "", colourOf(t.designerId), t.done))}
                </ul>
              ))}
            </div>
          )}
          <div className="grid" style={{ gridTemplateColumns: `56px repeat(${cols}, minmax(0, 1fr))` }}>
            <div className="relative" style={{ height: gridH }}>
              {hours.map((h, i) => (
                <div key={h} className="absolute right-2 -translate-y-1/2 text-[11px] text-muted" style={{ top: i * HOUR_H, display: i === 0 ? "none" : "block" }}>{hourLabel(h)}</div>
              ))}
            </div>
            {days.map((d) => {
              const placed = layoutOverlaps(eventsByDay.get(d) ?? []);
              return (
                <div key={d} className="relative border-l border-line" style={{ height: gridH, backgroundImage: "linear-gradient(to bottom, var(--color-line) 1px, transparent 1px)", backgroundSize: `100% ${HOUR_H}px`, backgroundColor: d === today ? "#fdfbf8" : undefined }}>
                  {isAdmin && hours.map((h, i) => (
                    <Link key={h} href={`${link({ date: anchor })}&new=${d}T${String(h).padStart(2, "0")}:00#request-meeting`}
                      aria-label={`New meeting on ${d} at ${hourLabel(h)}`} title="Click to request a meeting at this time"
                      className="absolute inset-x-0 z-0 hover:bg-accent-soft/50" style={{ top: i * HOUR_H, height: HOUR_H }} />
                  ))}
                  {placed.map((e) => {
                    const top = ((e.startMin - startH * 60) / 60) * HOUR_H;
                    const height = Math.max(22, ((e.endMin - e.startMin) / 60) * HOUR_H - 2);
                    const col = isAdmin ? colourOf(e.designerId) : PALETTE[0];
                    return (
                      <div key={e.id} title={eventTitle(e)} className="absolute z-10 overflow-hidden rounded-md border-l-4 px-1.5 py-1 text-xs leading-tight shadow-sm"
                        style={{ top, height, left: `calc(${(e.col / e.cols) * 100}% + 2px)`, width: `calc(${100 / e.cols}% - 4px)`, background: col.bg, borderColor: col.bar }}>
                        <div className="truncate font-medium">{e.title}</div>
                        {height > 36 && <div className="truncate text-muted">{istTime(e.start)} – {istTime(e.end)}</div>}
                        {height > 52 && <div className="truncate text-muted">{[isAdmin && !data.filter ? e.designer : null, e.client, e.location].filter(Boolean).join(" · ")}</div>}
                      </div>
                    );
                  })}
                  {d === today && nowMin >= startH * 60 && nowMin <= endH * 60 && (
                    <div aria-hidden className="pointer-events-none absolute inset-x-0 z-20 flex items-center" style={{ top: ((nowMin - startH * 60) / 60) * HOUR_H }}>
                      <span className="-ml-1 size-2.5 rounded-full bg-danger" /><span className="h-px flex-1 bg-danger" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* ---- Desktop: month grid ---- */}
      {view === "month" && (
        <Card className="mb-6 hidden overflow-hidden md:block">
          <div className="grid grid-cols-7 border-b border-line bg-accent-soft/60 text-center text-xs font-medium text-muted">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="py-2">{d}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {days.map((d) => {
              const inMonth = d.startsWith(monthPrefix);
              const evs = (eventsByDay.get(d) ?? []).filter((e) => istKey(e.start) === d);
              return (
                <div key={d} className={`min-h-28 border-b border-r border-line p-1.5 ${inMonth ? "" : "bg-canvas text-muted/60"}`}>
                  <div className={`mb-1 flex size-6 items-center justify-center rounded-full text-xs ${d === today ? "bg-accent font-medium text-white" : ""}`}>{Number(d.slice(8))}</div>
                  <ul className="space-y-1">
                    {evs.map((e) => chip(e.id, `${istTime(e.start)} ${e.title}`, isAdmin ? e.designer : "", isAdmin ? colourOf(e.designerId) : PALETTE[0]))}
                    {(tasksByDay.get(d) ?? []).map((t) => chip(t.id, `Due: ${t.title}`, isAdmin ? t.designer : "", colourOf(t.designerId), t.done))}
                  </ul>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* ---- Mobile: agenda ---- */}
      <div className="mb-6 space-y-3 md:hidden">
        {days.filter((d) => view !== "month" || d.startsWith(monthPrefix)).filter((d) => eventsByDay.get(d)?.length || tasksByDay.get(d)?.length).map((d) => (
          <Card key={d} className="p-3">
            <div className={`mb-2 text-sm font-medium ${d === today ? "text-accent-strong" : ""}`}>{dayLabel(d)}{d === today && " · Today"}</div>
            <ul className="space-y-1">
              {(eventsByDay.get(d) ?? []).filter((e) => view !== "month" || istKey(e.start) === d).map((e) => chip(e.id, `${istTime(e.start)} ${e.title}`, [isAdmin ? e.designer : null, e.client].filter(Boolean).join(" · "), isAdmin ? colourOf(e.designerId) : PALETTE[0]))}
              {(tasksByDay.get(d) ?? []).map((t) => chip(t.id, `Due: ${t.title}`, isAdmin ? t.designer : "", colourOf(t.designerId), t.done))}
            </ul>
          </Card>
        ))}
      </div>
      {nothing && (
        <div className="mb-6"><EmptyState title="Nothing scheduled in this period">
          {isAdmin ? "Meetings and tasks show here after the designer accepts them. Click an empty time slot to request a meeting." : "Accepted meetings and tasks will appear here."}
        </EmptyState></div>
      )}

      {isAdmin && data.pending && (
        <>
          <h2 className="mb-3 mt-8 text-lg font-semibold">Waiting for a designer to answer</h2>
          {data.pending.meetings.length + data.pending.tasks.length === 0 ? (
            <p className="mb-6 text-sm text-muted">No open requests.</p>
          ) : (
            <Card className="mb-6 divide-y divide-line">
              {data.pending.meetings.map((m) => (
                <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                  <span><Badge tone="warning">Meeting</Badge> <span className="font-medium">{m.title}</span> · {m.designer} · {istDateTime(m.starts_at)}</span>
                  <form action={withdrawAction}><input type="hidden" name="id" value={m.id} /><input type="hidden" name="kind" value="meeting" />
                    <button className={`${btn.base} ${btn.ghost}`}>Withdraw</button></form>
                </div>
              ))}
              {data.pending.tasks.map((t) => (
                <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                  <span><Badge tone="warning">Task</Badge> <span className="font-medium">{t.title}</span> · {t.designer}{t.due ? ` · due ${t.due}` : ""}</span>
                  <form action={withdrawAction}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="kind" value="task" />
                    <button className={`${btn.base} ${btn.ghost}`}>Withdraw</button></form>
                </div>
              ))}
            </Card>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="scroll-mt-20 p-4" >
              <h2 id="request-meeting" className="mb-1 scroll-mt-24 text-lg font-semibold">Request a meeting</h2>
              <p className="mb-3 text-sm text-muted">The designer accepts or rejects it (with a reason). Times are India time.</p>
              <ActionForm action={requestMeetingAction} submitLabel="Send request" className="space-y-3">
                <Field label="Designer" name="designerId" required>
                  <select name="designerId" required defaultValue={data.filter ?? ""} className={selectCls}>
                    <option value="" disabled>Choose a designer…</option>
                    {data.designers.map((d) => <option key={d.id} value={d.id} disabled={!d.has_login}>{d.full_name}{d.has_login ? "" : " (no login yet)"}</option>)}
                  </select>
                </Field>
                <Field label="Title" name="title" required placeholder="e.g. Site visit, Design review" />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Start (IST)" name="startsAt" type="datetime-local" required defaultValue={prefill} />
                  <Field label="Length" name="durationMin">
                    <select name="durationMin" defaultValue="60" className={selectCls}>
                      {[30, 45, 60, 90, 120, 180].map((m) => <option key={m} value={m}>{m} min</option>)}
                    </select>
                  </Field>
                </div>
                <Field label="Client (optional)" name="clientId">
                  <select name="clientId" defaultValue="" className={selectCls}>
                    <option value="">No client</option>
                    {data.clients.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                  </select>
                </Field>
                <Field label="Location or meeting link (optional)" name="location" />
                <Field label="Notes (optional)" name="description" />
              </ActionForm>
            </Card>

            <Card className="p-4">
              <h2 className="mb-1 text-lg font-semibold">Assign a task</h2>
              <p className="mb-3 text-sm text-muted">The designer accepts or rejects it. Accepted tasks with a due date appear on the calendar.</p>
              <ActionForm action={assignTaskAction} submitLabel="Assign task" className="space-y-3">
                <Field label="Designer" name="designerId" required>
                  <select name="designerId" required defaultValue={data.filter ?? ""} className={selectCls}>
                    <option value="" disabled>Choose a designer…</option>
                    {data.designers.map((d) => <option key={d.id} value={d.id} disabled={!d.has_login}>{d.full_name}{d.has_login ? "" : " (no login yet)"}</option>)}
                  </select>
                </Field>
                <Field label="Task" name="title" required placeholder="e.g. Prepare 3 layout options" />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Due date (optional)" name="dueDate" type="date" />
                  <Field label="Priority" name="priority">
                    <select name="priority" defaultValue="normal" className={selectCls}>
                      <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option>
                    </select>
                  </Field>
                </div>
                <Field label="Client (optional)" name="clientId">
                  <select name="clientId" defaultValue="" className={selectCls}>
                    <option value="">No client</option>
                    {data.clients.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                  </select>
                </Field>
                <Field label="Details (optional)" name="description" />
              </ActionForm>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
