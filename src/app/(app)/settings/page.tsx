import { requireRole } from "@/server/auth";
import { withUser } from "@/server/db";
import { getHealth, dealUrl } from "@/server/hubspot";
import { resyncAllAction, retryClientAction, setNewDealStageAction, setupFieldsAction, syncNowAction } from "@/server/hubspot-actions";
import { istDateTime } from "@/lib/time";
import { Badge, Card, PageHeader, btn } from "@/components/ui";
import { RunButton } from "@/components/run-button";
import { ActionForm, Field, selectCls } from "../../form";

export const metadata = { title: "Integrations – Aangan Studio" };

export default async function Settings() {
  const me = await requireRole("admin");
  const [health, data] = await Promise.all([
    getHealth(),
    withUser(me.id, async (c) => {
      const counts = (await c.query(
        `select count(*) filter (where status = 'synced')::int as synced, count(*) filter (where status = 'pending')::int as pending,
                count(*) filter (where status = 'failed')::int as failed, max(last_synced_at) as last_sync from hubspot_sync`)).rows[0];
      const open = (await c.query(
        `select hs.client_id, hs.status, hs.attempts, hs.last_error, c.full_name, c.is_demo from hubspot_sync hs join clients c on c.id = hs.client_id
          where hs.status <> 'synced' order by hs.status, hs.queued_at limit 50`)).rows;
      const recent = (await c.query(
        `select hs.client_id, hs.hubspot_deal_id, hs.last_synced_at, c.full_name, c.is_demo from hubspot_sync hs join clients c on c.id = hs.client_id
          where hs.status = 'synced' order by hs.last_synced_at desc limit 8`)).rows;
      return { counts, open, recent };
    }),
  ]);

  return (
    <div>
      <PageHeader title="Integrations" subtitle="HubSpot connection and sync health. Only admins can see this page." />

      <Card className="mb-6 p-4">
        <h2 className="mb-3 text-lg font-semibold">HubSpot</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div><dt className="text-muted">Connection</dt><dd className="mt-1">{health.connected ? <Badge tone="success">Connected · account {health.portalId}</Badge> : <Badge tone="danger">Not connected</Badge>}</dd></div>
          <div><dt className="text-muted">Custom fields</dt><dd className="mt-1">{health.fieldsReady ? <Badge tone="success">Ready</Badge> : <Badge tone="warning">Not created yet</Badge>}</dd></div>
          <div><dt className="text-muted">Last successful sync</dt><dd className="mt-1">{data.counts.last_sync ? istDateTime(data.counts.last_sync) : "Never"}</dd></div>
        </dl>
        {health.error && <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{health.error}</p>}
        <div className="mt-4 flex flex-wrap items-start gap-3">
          {!health.fieldsReady && health.connected && <RunButton action={setupFieldsAction} label="Create HubSpot fields" variant="primary" />}
          <RunButton action={syncNowAction} label="Sync now" variant={health.fieldsReady ? "primary" : "secondary"} />
          <RunButton action={resyncAllAction} label="Queue every client again" />
        </div>
      </Card>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {[["Synced", data.counts.synced], ["Waiting", data.counts.pending], ["Failed", data.counts.failed]].map(([l, v]) => (
          <Card key={l as string} className="p-4"><div className="text-sm text-muted">{l}</div><div className="mt-1 text-3xl font-semibold tabular-nums">{v as number}</div></Card>
        ))}
      </div>

      {data.open.length > 0 && (
        <>
          <h2 className="mb-3 text-lg font-semibold">Waiting or failed</h2>
          <Card className="mb-6 divide-y divide-line">
            {data.open.map((r) => (
              <div key={r.client_id} className="flex flex-wrap items-start justify-between gap-3 p-3 text-sm">
                <div>
                  <span className="font-medium">{r.full_name}</span> {r.is_demo && <Badge>DEMO</Badge>}{" "}
                  <Badge tone={r.status === "failed" ? "danger" : "warning"}>{r.status === "failed" ? "Failed" : "Waiting"}</Badge>
                  {r.last_error && <p className="mt-1 text-danger">{r.last_error} <span className="text-muted">(tried {r.attempts}×)</span></p>}
                </div>
                <form action={retryClientAction}><input type="hidden" name="id" value={r.client_id} /><button className={`${btn.base} ${btn.secondary}`}>Retry now</button></form>
              </div>
            ))}
          </Card>
        </>
      )}

      {data.recent.length > 0 && (
        <>
          <h2 className="mb-3 text-lg font-semibold">Recently synced</h2>
          <Card className="mb-6 divide-y divide-line">
            {data.recent.map((r) => {
              const url = dealUrl(health.portalId, r.hubspot_deal_id);
              return (
                <div key={r.client_id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                  <span><span className="font-medium">{r.full_name}</span> {r.is_demo && <Badge>DEMO</Badge>} <span className="text-muted">· {istDateTime(r.last_synced_at)}</span></span>
                  {url && <a href={url} target="_blank" rel="noopener noreferrer" className="text-accent-strong underline">Open in HubSpot</a>}
                </div>
              );
            })}
          </Card>
        </>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-2 text-lg font-semibold">Who owns what</h2>
          <ul className="space-y-2 text-sm">
            <li><Badge tone="success">App → HubSpot</Badge> contact details, project context, the budget the customer <em>stated</em>, assigned designer, live status.</li>
            <li><Badge tone="warning">Admin in HubSpot</Badge> final budget (the deal <strong>Amount</strong>) and outcome (deal stage <strong>Deal Won</strong> / <strong>Deal Lost</strong>, plus the lost reason).</li>
            <li><Badge>Never sent</Badge> tasks and meetings. The app also never overwrites Amount or the deal stage after a deal is created.</li>
          </ul>
        </Card>
        {health.stages.length > 0 && (
          <Card className="p-4">
            <h2 className="mb-1 text-lg font-semibold">Where new deals start</h2>
            <p className="mb-3 text-sm text-muted">Pipeline stages in your HubSpot: {health.stages.map((s) => s.label).join(" → ")}.</p>
            <ActionForm action={setNewDealStageAction} submitLabel="Save" className="max-w-xs">
              <Field label="Starting stage for new deals" name="stage">
                <select name="stage" defaultValue={health.newDealStage} className={selectCls}>
                  {health.stages.filter((s) => !s.closed).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </Field>
            </ActionForm>
          </Card>
        )}
      </div>
    </div>
  );
}
