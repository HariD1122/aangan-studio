import { formatIST } from "@/lib/format";
import { Badge, Card } from "./ui";

type CallRow = {
  id: string; created_at: string; status: string; duration_seconds: string | null; transcript: string | null;
  provider_summary: string | null; recording_url: string | null; error: string | null;
  notes: { short_notes?: string[]; qualification?: string; qualification_reason?: string; missing_fields?: string[]; customer_questions?: string[]; follow_ups?: string[] } | null;
};

const QUAL: Record<string, { label: string; tone: "success" | "warning" | "danger" }> = {
  qualified: { label: "Looks qualified", tone: "success" },
  needs_review: { label: "Needs a person to review", tone: "warning" },
  not_qualified: { label: "May not fit our criteria", tone: "danger" },
};

const List = ({ title, items }: { title: string; items?: string[] }) =>
  items && items.length ? (
    <div className="mt-3"><div className="text-sm font-medium">{title}</div><ul className="mt-1 list-disc pl-5 text-sm">{items.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
  ) : null;

/** Short notes from a phone call. These are AI suggestions written from what the caller said, not confirmed facts. */
export function CallSummary({ calls, isAdmin }: { calls: CallRow[]; isAdmin: boolean }) {
  if (!calls.length) return null;
  return (
    <section className="mt-6" aria-labelledby="calls">
      <h2 id="calls" className="mb-3 text-lg font-semibold">Phone call notes</h2>
      <div className="space-y-4">
        {calls.map((c) => {
          const n = c.notes;
          const q = n?.qualification ? QUAL[n.qualification] : null;
          return (
            <Card key={c.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{formatIST(c.created_at)}</span>
                {c.duration_seconds && <span className="text-muted">· {Math.round(Number(c.duration_seconds) / 60 * 10) / 10} min</span>}
                {q && <Badge tone={q.tone}>{q.label}</Badge>}
              </div>
              <p className="mt-1 text-xs text-muted">Written by AI from the call. Please confirm important details with the customer.</p>
              {n?.short_notes?.length ? (
                <ul className="mt-3 list-disc pl-5 text-sm">{n.short_notes.map((b, i) => <li key={i}>{b}</li>)}</ul>
              ) : c.provider_summary ? <p className="mt-3 text-sm">{c.provider_summary}</p> : null}
              {n?.qualification_reason && <p className="mt-3 text-sm"><span className="font-medium">Why: </span>{n.qualification_reason}</p>}
              <List title="Still missing" items={n?.missing_fields} />
              <List title="Customer asked" items={n?.customer_questions} />
              <List title="Next steps" items={n?.follow_ups} />
              {c.error && <p className="mt-3 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">{c.error}</p>}
              {c.transcript && (
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer text-accent-strong">Read the full transcript</summary>
                  <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-canvas p-3 font-sans text-sm">{c.transcript}</pre>
                </details>
              )}
              {isAdmin && c.recording_url && /^https?:\/\//.test(c.recording_url) && (
                <p className="mt-2 text-sm"><a className="text-accent-strong underline" href={c.recording_url} target="_blank" rel="noopener noreferrer">Listen to the recording</a></p>
              )}
            </Card>
          );
        })}
      </div>
    </section>
  );
}
