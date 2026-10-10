"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { inputCls } from "../ui";

/** Debounced client search. Updates /clients?q=... 300ms after the user stops typing. */
export function SearchBox({ className = "", autoFocus = false }: { className?: string; autoFocus?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get("q") ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  function go(q: string) {
    const trimmed = q.trim();
    router.replace(trimmed ? `/clients?q=${encodeURIComponent(trimmed)}` : "/clients");
  }

  return (
    <form
      role="search"
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        clearTimeout(timer.current);
        go(value);
      }}
    >
      <label className="sr-only" htmlFor="client-search">Search clients by name or phone</label>
      <input
        id="client-search"
        type="search"
        value={value}
        autoFocus={autoFocus}
        placeholder="Search clients by name or phone"
        className={inputCls}
        onChange={(e) => {
          setValue(e.target.value);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => go(e.target.value), 300);
        }}
      />
    </form>
  );
}
