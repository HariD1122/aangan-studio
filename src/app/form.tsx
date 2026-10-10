"use client";
import { useActionState } from "react";
import type { FormState } from "@/server/actions";

export function ActionForm({
  action, children, submitLabel, className = "",
}: {
  action: (s: FormState, fd: FormData) => Promise<FormState>;
  children: React.ReactNode;
  submitLabel: string;
  className?: string;
}) {
  const [state, run, pending] = useActionState(action, undefined);
  return (
    <form action={run} className={className}>
      {children}
      {state?.error && <p role="alert" className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</p>}
      {state?.ok && <p role="status" className="mt-3 rounded bg-green-50 px-3 py-2 text-sm text-green-800">{state.ok}</p>}
      <button disabled={pending} className="mt-4 rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50">
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}

export function Field({ label, name, type = "text", required, placeholder, children }: {
  label: string; name: string; type?: string; required?: boolean; placeholder?: string; children?: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">{label}{required && " *"}</span>
      {children ?? (
        <input name={name} type={type} required={required} placeholder={placeholder}
          className="w-full rounded border border-stone-300 bg-white px-3 py-2 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900" />
      )}
    </label>
  );
}

export const selectCls = "w-full rounded border border-stone-300 bg-white px-3 py-2 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900";
