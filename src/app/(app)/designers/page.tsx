import Link from "next/link";
import { requireUser } from "@/server/auth";
import { withUser } from "@/server/db";
import { createDesignerAction } from "@/server/actions";
import { ActionForm, Field } from "../../form";

export const metadata = { title: "Designers – Aangan Studio" };

export default async function Designers() {
  const user = await requireUser();
  const rows = await withUser(user.id, async (c) =>
    (await c.query(
      `select d.id, d.full_name, d.specializations, d.is_active,
              (select count(*) from designer_assignments a where a.designer_id = d.id and a.unassigned_at is null)::int as clients
         from designers d order by d.full_name`)).rows,
  );
  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Designers</h1>
      {rows.length === 0 ? (
        <p className="rounded border border-dashed border-line bg-surface p-8 text-center text-sm text-muted">No designers yet.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {rows.map((d) => (
            <Link key={d.id} href={`/designers/${d.id}`} className="rounded-xl border border-line bg-surface p-4 hover:bg-accent-soft/60">
              <div className="font-medium">{d.full_name} {!d.is_active && <span className="text-xs text-muted">(inactive)</span>}</div>
              <div className="mt-1 text-sm text-muted">{d.specializations.length ? d.specializations.join(", ") : "No specializations listed"}</div>
              <div className="mt-2 text-sm">{d.clients} active client{d.clients === 1 ? "" : "s"}</div>
            </Link>
          ))}
        </div>
      )}
      {user.role === "admin" && (
        <section className="mt-10 max-w-xl">
          <h2 className="mb-3 text-lg font-semibold">Add designer</h2>
          <ActionForm action={createDesignerAction} submitLabel="Create designer" className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" name="fullName" required />
            <Field label="Work email" name="email" type="email" />
            <Field label="Phone" name="phone" />
            <Field label="Portfolio link" name="portfolioUrl" placeholder="https://" />
            <Field label="Specializations (comma separated)" name="specializations" placeholder="Residential, Kitchens" />
            <Field label="Years of experience" name="experienceYears" type="number" />
            <div className="sm:col-span-2">
              <Field label="Login password (optional, min 10 characters; lets the designer sign in with the work email)" name="loginPassword" type="password" />
            </div>
          </ActionForm>
        </section>
      )}
    </div>
  );
}
