"use client";
import { useActionState } from "react";
import type { FormState } from "@/server/actions";
import { btn } from "./ui";

/** A button that runs a server action with no inputs and shows its result message. */
export function RunButton({ action, label, variant = "secondary" }: { action: (s: FormState, fd: FormData) => Promise<FormState>; label: string; variant?: "primary" | "secondary" }) {
  const [state, run, pending] = useActionState(action, undefined);
  return (
    <form action={run} className="inline-block">
      <button disabled={pending} className={`${btn.base} ${btn[variant]}`}>{pending ? "Working…" : label}</button>
      {state?.error && <p role="alert" className="mt-2 max-w-sm rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p>}
      {state?.ok && <p role="status" className="mt-2 max-w-sm rounded-lg bg-success-soft px-3 py-2 text-sm text-success">{state.ok}</p>}
    </form>
  );
}
