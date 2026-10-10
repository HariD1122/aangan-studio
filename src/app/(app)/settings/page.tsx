import { requireRole } from "@/server/auth";
import { withUser } from "@/server/db";
import { getHealth, dealUrl } from "@/server/hubspot";
import { telegramHealth } from "@/server/telegram";
import { getAgentInfo } from "@/server/vaani";
import { runSampleCallAction } from "@/server/voice-actions";
import { telegramSendPendingAction, telegramTestAction } from "@/server/telegram-actions";
import { resyncAllAction, retryClientAction, setNewDealStageAction, setupFieldsAction, syncNowAction } from "@/server/hubspot-actions";
import { istDateTime } from "@/lib/time";
import { Badge, Card, PageHeader, btn } from "@/components/ui";
import { RunButton } from "@/components/run-button";
import { ActionForm, Field, selectCls } from "../../form";

export const metadata = { title: "Integrations – Aangan Studio" };

export default async function Settings() {
  const me = await requireRole("admin");
  const [health, tg, agent, data] = await Promise.all([
    getHealth(),
    telegramHealth(),
    getAgentInfo(),
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
      const alerts = (await c.query(
        `select count(*) filter (where status = 'sent')::int as sent, count(*) filter (where status = 'pending')::int as pending,
                count(*) filter (where status = 'failed')::int as failed, max(sent_at) as last_sent from notification_queue`)).rows[0];
      const alertProblem = (await c.query(
        "select last_error from notification_queue where status = 'failed' and last_error is not null order by created_at desc limit 1")).rows[0]?.last_error ?? null;
      const calls = (await c.query(
        `select v.id, v.created_at, v.status, v.phone, v.client_id, v.error, cl.full_name from voice_calls v left join clients cl on cl.id = v.client_id
          order by v.created_at desc limit 8`)).rows;
      return { counts, open, recent, alerts, alertProblem, calls };
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

      <Card className="mb-6 p-4">
        <h2 className="mb-3 text-lg font-semibold">VaaniVoice phone agent</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div><dt className="text-muted">Connection</dt><dd className="mt-1">{agent.connected ? <Badge tone="success">Connected</Badge> : <Badge tone="danger">Not connected</Badge>}</dd></div>
          <div><dt className="text-muted">Agent</dt><dd className="mt-1">{agent.agentName ?? "—"}{agent.status ? <span className="text-muted"> · {agent.status}</span> : null}</dd></div>
          <div><dt className="text-muted">Phone number for callers</dt><dd className="mt-1">{agent.inboundNumber ? <Badge tone="success">{agent.inboundNumber}</Badge> : <Badge tone="warning">None attached yet</Badge>}</dd></div>
        </dl>
        {agent.error && <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{agent.error}</p>}
        {agent.connected && !agent.inboundNumber && (
          <p role="note" className="mt-3 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">Customers cannot phone the agent yet. In your VaaniVoice dashboard, go to Settings → Telephony, get a phone number, and assign it to this agent.</p>
        )}
        <div className="mt-4">
          <div className="text-sm font-medium">Webhook address (paste into VaaniVoice → Settings → Webhooks)</div>
          <code className="mt-1 block select-all break-all rounded-lg bg-canvas p-2 text-xs">{process.env.APP_URL ?? "https://aangan-studio-azure.vercel.app"}/api/webhooks/vaani?key={process.env.VAANIVOICE_WEBHOOK_SECRET ?? "(secret not set)"}</code>
          <p className="mt-1 text-xs text-muted">Keep this address private: anyone with it can send fake calls.</p>
        </div>
        <div className="mt-4 flex flex-wrap items-start gap-3">
          <RunButton action={runSampleCallAction} label="Run a sample call (no phone needed)" variant="primary" />
        </div>
        {data.calls.length > 0 && (
          <div className="mt-4">
            <div className="mb-2 text-sm font-medium">Recent calls</div>
            <div className="divide-y divide-line rounded-lg border border-line text-sm">
              {data.calls.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 p-2">
                  <span>{istDateTime(c.created_at)} · {c.phone ?? "no number"} {c.full_name ? <>· <a className="text-accent-strong underline" href={`/clients/${c.client_id}`}>{c.full_name}</a></> : null}</span>
                  <Badge tone={c.status === "done" ? "success" : c.status === "failed" || c.status === "needs_review" ? "danger" : "warning"}>{c.status === "needs_review" ? "needs review" : c.status}</Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      <Card className="mb-6 p-4">
        <h2 className="mb-3 text-lg font-semibold">Telegram lead alerts</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div><dt className="text-muted">Bot</dt><dd className="mt-1">{tg.botName ? <Badge tone="success">Connected · {tg.botName}</Badge> : <Badge tone="danger">Not connected</Badge>}</dd></div>
          <div><dt className="text-muted">Group</dt><dd className="mt-1">{tg.groupName ? <Badge tone="success">{tg.groupName}</Badge> : tg.chatConfigured ? <Badge tone="danger">Not reachable</Badge> : <Badge tone="warning">Group not set yet</Badge>}</dd></div>
          <div><dt className="text-muted">Alerts</dt><dd className="mt-1">{data.alerts.sent} sent · {data.alerts.pending} waiting · {data.alerts.failed} failed{data.alerts.last_sent ? ` · last ${istDateTime(data.alerts.last_sent)}` : ""}</dd></div>
        </dl>
        {tg.error && <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{tg.error}</p>}
        {data.alertProblem && <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">Last alert problem: {data.alertProblem}</p>}
        <p className="mt-3 text-sm text-muted">Each new lead is posted to the group with name, project, location, budget and a link. Phone numbers and emails are deliberately not sent to Telegram.</p>
        <div className="mt-4 flex flex-wrap items-start gap-3">
          <RunButton action={telegramTestAction} label="Send a test message" variant="primary" />
          <RunButton action={telegramSendPendingAction} label="Send waiting alerts now" />
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
            <li><Badge tone="warning">Admin in HubSpot</Badge> the deal <strong>Amount</strong> and the deal stage. While a lead is in progress, type the <em>quote</em> in Amount. When you move the deal to <strong>Deal Won</strong>, that Amount is the revenue. Use <strong>Deal Lost</strong> plus a lost reason for lost leads. The <strong>Summary</strong> page reads these.</li>
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
