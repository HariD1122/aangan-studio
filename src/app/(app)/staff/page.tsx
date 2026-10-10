import { requireRole } from "@/server/auth";
import { withUser } from "@/server/db";
import { createStaffAction, resetPasswordAction } from "@/server/actions";
import { ActionForm, Field, selectCls } from "../../form";

export const metadata = { title: "Staff & access – Aangan Studio" };

export default async function Staff() {
  const me = await requireRole("admin");
  const users = await withUser(me.id, async (c) =>
    (await c.query("select id, email, full_name, role, can_assign_leads, is_active from users order by created_at")).rows);
  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 text-2xl font-semibold">Staff & access</h1>
      <ul className="mb-10 divide-y divide-stone-100 rounded-lg border border-stone-200 bg-white">
        {users.map((u) => (
          <li key={u.id} className="p-3 text-sm">
            <div className="flex justify-between">
              <span className="font-medium">{u.full_name || u.email} <span className="text-slate-500">({u.email})</span></span>
              <span className="text-slate-500">{u.role}{u.can_assign_leads && u.role !== "admin" ? " · can assign" : ""}</span>
            </div>
            <details className="mt-2">
              <summary className="cursor-pointer text-slate-500">Reset password</summary>
              <ActionForm action={resetPasswordAction} submitLabel="Reset password" className="mt-2 max-w-xs">
                <input type="hidden" name="userId" value={u.id} />
                <Field label="New password (min 10 characters)" name="password" type="password" required />
              </ActionForm>
            </details>
          </li>
        ))}
      </ul>
      <h2 className="mb-3 text-lg font-semibold">Add staff user</h2>
      <p className="mb-4 text-sm text-slate-500">Designers are created from the Designers page so their profile and login stay linked.</p>
      <ActionForm action={createStaffAction} submitLabel="Create user" className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" name="fullName" required />
        <Field label="Email" name="email" type="email" required />
        <Field label="Temporary password (min 10 characters)" name="password" type="password" required />
        <Field label="Role" name="role">
          <select name="role" className={selectCls} defaultValue="front_desk">
            <option value="front_desk">Front desk / Sales</option><option value="viewer">Viewer (CEO / board, read-only)</option><option value="admin">Admin / Owner</option>
          </select>
        </Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="canAssign" /> Allowed to assign leads to designers</label>
      </ActionForm>
    </div>
  );
}
