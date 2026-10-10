"use client";
import { useActionState, useState } from "react";
import type { FormState } from "@/server/actions";
import { btn, inputCls } from "./ui";

/** Accept button, or Reject with a required reason. Shows server errors (for example a calendar clash). */
export function RespondControls({ id, action }: { id: string; action: (s: FormState, fd: FormData) => Promise<FormState> }) {
  const [state, run, pending] = useActionState(action, undefined);
  const [rejecting, setRejecting] = useState(false);
  return (
    <form action={run} className="mt-3">
      <input type="hidden" name="id" value={id} />
      {!rejecting ? (
        <div className="flex flex-wrap gap-2">
          <button name="decision" value="accept" disabled={pending} className={`${btn.base} ${btn.primary}`}>{pending ? "Saving…" : "Accept"}</button>
          <button type="button" onClick={() => setRejecting(true)} disabled={pending} className={`${btn.base} ${btn.secondary}`}>Reject…</button>
        </div>
      ) : (
        <div className="space-y-2">
          <label className="block text-sm font-medium" htmlFor={`reason-${id}`}>Reason for rejecting (the admin will see this)</label>
          <textarea id={`reason-${id}`} name="reason" rows={2} required minLength={3} maxLength={1000} autoFocus className={inputCls} placeholder="e.g. I'm on a site visit at that time" />
          <div className="flex flex-wrap gap-2">
            <button name="decision" value="reject" disabled={pending} className={`${btn.base} ${btn.primary}`}>{pending ? "Saving…" : "Send rejection"}</button>
            <button type="button" onClick={() => setRejecting(false)} disabled={pending} className={`${btn.base} ${btn.ghost}`}>Back</button>
          </div>
        </div>
      )}
      {state?.error && <p role="alert" className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p>}
      {state?.ok && <p role="status" className="mt-2 rounded-lg bg-success-soft px-3 py-2 text-sm text-success">{state.ok}</p>}
    </form>
  );
}
