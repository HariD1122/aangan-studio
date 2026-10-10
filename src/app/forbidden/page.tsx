import Link from "next/link";

export default function Forbidden() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-stone-50">
      <h1 className="text-xl font-semibold">You don&apos;t have access to this page</h1>
      <Link href="/dashboard" className="text-sm underline">Back to dashboard</Link>
    </main>
  );
}
