import { requireRole } from "@/server/auth";
import { createClientAction } from "@/server/actions";
import { ActionForm, Field, selectCls } from "../../../form";

export const metadata = { title: "Add client – Aangan Studio" };

export default async function NewClient() {
  await requireRole("admin", "front_desk");
  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 text-2xl font-semibold">Add client</h1>
      <p className="mb-4 text-sm text-muted">Only enter what the customer actually said. Leave unknown fields blank; estimates are not commitments.</p>
      <ActionForm action={createClientAction} submitLabel="Save client" className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" name="fullName" required />
        <Field label="Phone" name="phone" required placeholder="98XXXXXXXX" />
        <Field label="Email" name="email" type="email" />
        <Field label="Project type" name="projectType" placeholder="e.g. Full home, Office" />
        <Field label="Project location" name="projectLocation" placeholder="e.g. Baner, Pune" />
        <Field label="Property type" name="propertyType" placeholder="e.g. 3BHK apartment" />
        <Field label="Carpet area" name="areaValue" type="number" />
        <Field label="Area unit" name="areaUnit">
          <select name="areaUnit" className={selectCls} defaultValue="sqft"><option value="sqft">sq ft</option><option value="sqm">sq m</option></select>
        </Field>
        <Field label="Budget minimum (₹)" name="budgetMin" type="number" />
        <Field label="Budget maximum (₹)" name="budgetMax" type="number" />
        <Field label="Timeline" name="timeline" placeholder="e.g. Move in by March" />
        <Field label="Expected start date" name="expectedStartDate" type="date" />
        <div className="sm:col-span-2">
          <Field label="Requirements" name="requirements">
            <textarea name="requirements" rows={3} className={selectCls} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="allowDuplicate" /> Create anyway if this phone number already exists
        </label>
      </ActionForm>
    </div>
  );
}
