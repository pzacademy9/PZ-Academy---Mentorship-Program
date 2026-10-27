"use client";

import { useState, useTransition } from "react";
import type { PersonResult } from "@/lib/data/pz-people-admin";

type SearchResult = { ok: true; people: PersonResult[]; truncated?: boolean } | { ok: false; message: string };
type MergeResult = { ok: true } | { ok: false; message: string };

interface Props {
  search: (query: string) => Promise<SearchResult>;
  merge: (keepId: string, dropId: string) => Promise<MergeResult>;
}

export function PeopleLookup({ search, merge }: Props) {
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<PersonResult[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [keepId, setKeepId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /** Resolves true when the list was refreshed, false when the search itself failed. */
  function runSearch(q: string): Promise<boolean> {
    return search(q).then((res) => {
      if (res.ok) {
        setPeople(res.people);
        setTruncated(res.truncated === true);
        setError(null);
        return true;
      }
      setError(res.message);
      return false;
    });
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setNotice(null);
    setSelected([]);
    setKeepId(null);
    if (query.trim().length < 3) {
      setPeople(null);
      setError("Type at least 3 characters.");
      return;
    }
    startTransition(async () => {
      try {
        await runSearch(query);
      } catch {
        setError("Something went wrong. Please try again.");
      }
    });
  }

  function toggle(id: string) {
    setKeepId(null);
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 2 ? cur : [...cur, id]));
  }

  const byId = (id: string | null) => people?.find((p) => p.id === id);
  const keep = byId(keepId);
  const drop = keep ? byId(selected.find((id) => id !== keep.id) ?? null) : undefined;

  function confirmMerge() {
    if (!keep || !drop) return;
    startTransition(async () => {
      try {
        const res = await merge(keep.id, drop.id);
        if (!res.ok) {
          setError(res.message);
          return;
        }
        setNotice(`Done. ${drop.pzId} now points to ${keep.pzId} and still works.`);
        setError(null);
        setSelected([]);
        setKeepId(null);
        let refreshed = false;
        try {
          refreshed = await runSearch(keep.pzId);
        } catch {
          refreshed = false;
        }
        if (!refreshed) {
          setNotice("Merged. The list could not refresh, search again.");
          setError(null);
          setPeople(null);
          setTruncated(false);
        }
      } catch {
        setError("Something went wrong. Nothing was changed. Please try again.");
      }
    });
  }

  return (
    <div className="space-y-5">
      <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row">
        <div className="flex-1">
          <label htmlFor="people-query" className="sr-only">Search people</label>
          <input
            id="people-query"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="PZ ID, old ID, email or name"
            autoComplete="off"
            className="w-full rounded-lg border border-pz-outline-variant bg-pz-surface-container-lowest px-4 py-3 text-sm text-pz-on-surface outline-none focus:border-pz-primary max-md:min-h-11"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-pz-primary px-5 py-2.5 font-headline text-sm font-bold text-pz-on-primary hover:opacity-90 disabled:opacity-60 max-md:min-h-11"
        >
          Search
        </button>
      </form>

      <div aria-live="polite" className="space-y-3">
        {error && <p className="text-sm text-red-700 dark:text-red-400">{error}</p>}
        {notice && <p className="text-sm font-semibold text-pz-primary">{notice}</p>}
      </div>

      {people && people.length === 0 && (
        <p className="text-sm text-pz-on-surface-variant">No one found. Check the spelling, or try an email.</p>
      )}

      {people && people.length > 0 && (
        <>
          <p className="text-sm text-pz-on-surface-variant">
            {selected.length === 2
              ? "Two people selected. Choose which one should stay."
              : "To combine two IDs of the same student, tick both of them."}
          </p>
          {truncated && (
            <p className="text-sm text-pz-on-surface-variant">
              Showing the first 20 matches. Type more of the name to narrow it down.
            </p>
          )}
          <ul className="grid gap-3 md:grid-cols-2">
            {people.map((p) => {
              const isSel = selected.includes(p.id);
              return (
                <li
                  key={p.id}
                  className={`rounded-xl border p-5 bg-pz-surface-container-lowest ${
                    isSel ? "border-pz-primary" : "border-pz-outline-variant"
                  }`}
                >
                  <p className="font-headline text-2xl font-bold text-pz-on-surface">{p.pzId}</p>
                  <p className="mt-1 font-semibold text-pz-on-surface">{p.name}</p>
                  <p className="mt-2 text-sm text-pz-on-surface-variant">
                    {p.emails.length > 0 ? p.emails.join(", ") : "No email on file"}
                  </p>
                  <p className="mt-1 text-sm text-pz-on-surface-variant">
                    {p.batches === 1 ? "1 batch" : `${p.batches} batches`}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <label className="inline-flex items-center gap-2 text-sm font-semibold text-pz-on-surface max-md:min-h-11">
                      <input
                        type="checkbox"
                        checked={isSel}
                        disabled={!isSel && selected.length >= 2}
                        onChange={() => toggle(p.id)}
                      />
                      Select {p.pzId}
                    </label>
                    {isSel && selected.length === 2 && (
                      <button
                        type="button"
                        onClick={() => setKeepId(p.id)}
                        className="rounded-lg border border-pz-primary px-3 py-1.5 text-sm font-bold text-pz-primary max-md:min-h-11"
                      >
                        Merge into this person
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {keep && drop && (
        <div role="alertdialog" aria-label="Confirm merge" className="rounded-xl border border-pz-primary bg-pz-surface-container-lowest p-5">
          <p className="text-sm text-pz-on-surface">
            {`Merge ${drop.pzId} into ${keep.pzId}? The first ID will keep working and point to the second person. This cannot be undone.`}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={confirmMerge}
              disabled={pending}
              className="rounded-lg bg-pz-primary px-4 py-2 text-sm font-bold text-pz-on-primary disabled:opacity-60 max-md:min-h-11"
            >
              Yes, merge them
            </button>
            <button
              type="button"
              onClick={() => setKeepId(null)}
              className="rounded-lg border border-pz-outline-variant px-4 py-2 text-sm font-semibold text-pz-on-surface max-md:min-h-11"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
