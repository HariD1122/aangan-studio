"use client";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { SearchBox } from "./search-box";

export function Topbar({ name, roleLabel, signOut }: { name: string; roleLabel: string; signOut: () => Promise<void> }) {
  const path = usePathname();
  const showSearch = !path.startsWith("/clients"); // the Clients page has its own search box
  const initial = (name.trim()[0] ?? "?").toUpperCase();
  return (
    <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-surface/95 px-4 py-2.5 backdrop-blur md:px-8">
      <span className="text-base font-semibold md:hidden">Aangan Studio</span>
      {showSearch && (
        <Suspense fallback={null}>
          <SearchBox className="hidden max-w-sm flex-1 md:block" />
        </Suspense>
      )}
      <details className="relative ml-auto">
        <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-lg px-2 hover:bg-accent-soft [&::-webkit-details-marker]:hidden">
          <span aria-hidden className="flex size-8 items-center justify-center rounded-full bg-accent text-sm font-medium text-white">{initial}</span>
          <span className="hidden text-left text-sm leading-tight sm:block">
            <span className="block font-medium">{name}</span>
            <span className="block text-xs text-muted">{roleLabel}</span>
          </span>
        </summary>
        <div className="absolute right-0 mt-2 w-56 rounded-xl border border-line bg-surface p-2 shadow-sm">
          <p className="px-3 py-2 text-sm sm:hidden"><span className="block font-medium">{name}</span><span className="text-xs text-muted">{roleLabel}</span></p>
          <form action={signOut}>
            <button className="min-h-10 w-full rounded-lg px-3 text-left text-sm hover:bg-accent-soft">Sign out</button>
          </form>
        </div>
      </details>
    </header>
  );
}
