"use client";

import { useState, useTransition } from "react";
import type { FindMyIdResult } from "@/app/ids/[slug]/actions";

interface Props {
  slug: string;
  search: (slug: string, query: string) => Promise<FindMyIdResult>;
}

export function FindMyId({ slug, search }: Props) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<FindMyIdResult | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim().length < 3) {
      setResult({ status: "too_short" });
      return;
    }
    startTransition(async () => {
      try {
        setResult(await search(slug, query));
      } catch {
        setResult({ status: "error", message: "Something went wrong. Please try again." });
      }
    });
  }

  async function copy(id: string) {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(id);
    } catch {
      setCopied(null);
    }
  }

  return (
    <div className="mt-6">
      <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row">
        <div className="flex-1">
          <label htmlFor="find-id-name" className="sr-only">Your name</label>
          <input
            id="find-id-name"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Your name"
            autoComplete="off"
            className="w-full rounded-xl border-[1.5px] border-pz-border bg-white px-4 py-3 text-pz-deep outline-none focus:border-pz-bright"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-pz-bright px-6 py-3 font-semibold text-pz-forest disabled:opacity-60"
        >
          Find my ID
        </button>
      </form>

      <div aria-live="polite" className="mt-6">
        {result?.status === "too_short" && <p className="text-pz-mid">Type at least 3 letters of your name</p>}
        {result?.status === "not_found" && (
          <p className="text-pz-mid">No match. Check the spelling of your name, or ask the team.</p>
        )}
        {result?.status === "rate_limited" && (
          <p className="text-pz-mid">Too many tries. Please wait a minute and try again.</p>
        )}
        {result?.status === "error" && <p className="text-red-700">{result.message}</p>}
        {result?.status === "ok" && (
          <ul className="flex flex-col gap-3">
            {result.rows.map((r) => (
              <li key={r.pzId} className="rounded-2xl border-[1.5px] border-pz-border bg-white p-5">
                <p className="font-semibold text-pz-deep">{r.name}</p>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="font-poppins text-3xl font-bold tracking-wide text-pz-forest">{r.pzId}</p>
                  <button
                    type="button"
                    onClick={() => copy(r.pzId)}
                    className="rounded-lg border border-pz-border px-3 py-1.5 text-sm font-semibold text-pz-deep"
                  >
                    {copied === r.pzId ? "Copied" : "Copy"}
                  </button>
                </div>
                <p className="mt-2 text-sm text-pz-mid">{r.emailMasked}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
