"use client";
import { useActionState } from "react";
import type { FormState } from "@/server/actions";
import { btn, inputCls } from "@/components/ui";

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
      {state?.error && <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p>}
      {state?.ok && <p role="status" className="mt-3 rounded-lg bg-success-soft px-3 py-2 text-sm text-success">{state.ok}</p>}
      <button disabled={pending} className={`mt-4 ${btn.base} ${btn.primary}`}>
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}

export function Field({ label, name, type = "text", required, placeholder, defaultValue, children }: {
  label: string; name: string; type?: string; required?: boolean; placeholder?: string; defaultValue?: string; children?: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-muted">{label}{required && " *"}</span>
      {children ?? (
        <input name={name} type={type} required={required} placeholder={placeholder} defaultValue={defaultValue}
          className={inputCls} />
      )}
    </label>
  );
}

export const selectCls = inputCls;
