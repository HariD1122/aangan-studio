import { redirect } from "next/navigation";
import { getUser } from "@/server/auth";
import { loginAction } from "@/server/actions";
import { ActionForm, Field } from "../form";

export const metadata = { title: "Sign in – Aangan Studio" };

export default async function LoginPage() {
  if (await getUser()) redirect("/dashboard");
  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 px-4">
      <div className="w-full max-w-sm rounded-lg border border-stone-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Aangan Studio</h1>
        <p className="mb-6 mt-1 text-sm text-slate-500">Sign in to the management platform</p>
        <ActionForm action={loginAction} submitLabel="Sign in" className="space-y-4">
          <Field label="Email" name="email" type="email" required />
          <Field label="Password" name="password" type="password" required />
        </ActionForm>
        <p className="mt-6 text-xs text-slate-500">
          Forgot your password? Ask an administrator to reset it. Accounts are created by administrators only.
        </p>
      </div>
    </main>
  );
}
