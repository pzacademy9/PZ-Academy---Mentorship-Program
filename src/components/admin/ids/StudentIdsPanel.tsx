"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Check, Copy, FileText, LayoutGrid, Search, Users } from "lucide-react";
import { cardCls, fieldCls, primaryBtn, quietBtn } from "@/components/admin/classes/styles";
import {
  copyLines,
  countByFilter,
  filterRows,
  initials,
  scopeTag,
  type IdFilter,
  type IdRow,
} from "@/lib/pzid/id-list";

type CopyState = "idle" | "copied" | "failed";

/** Copies text to the clipboard and reports idle / copied / failed (back to idle after 2 seconds). */
function useCopy(): [CopyState, (text: string) => Promise<void>] {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  async function copy(text: string) {
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch {
      ok = false;
    }
    setState(ok ? "copied" : "failed");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2000);
  }
  return [state, copy];
}

function RowCopy({ pzId }: { pzId: string }) {
  const [state, copy] = useCopy();
  return (
    <button
      type="button"
      aria-label={`Copy ID ${pzId}`}
      onClick={() => void copy(pzId)}
      className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-3 font-headline text-sm font-bold transition-colors ${
        state === "copied"
          ? "bg-pz-primary text-pz-on-primary"
          : "bg-pz-surface-container text-pz-on-surface-variant hover:text-pz-on-surface"
      }`}
    >
      {state === "copied" ? <Check aria-hidden className="h-4 w-4" /> : <Copy aria-hidden className="h-4 w-4" />}
      <span aria-live="polite">{state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : "Copy"}</span>
    </button>
  );
}

function Stat({ icon, label, value, share }: { icon: React.ReactNode; label: string; value: number; share?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-pz-surface-container-low p-3 md:p-4">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-pz-surface-container text-pz-primary">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-xs font-headline font-bold uppercase tracking-wide text-pz-on-surface-variant">{label}</p>
        <p className="font-headline text-2xl font-extrabold text-pz-on-surface">
          {value}
          {share && <span className="ml-1.5 text-sm font-medium text-pz-on-surface-variant">{share}</span>}
        </p>
      </div>
    </div>
  );
}

const CHIPS: { key: IdFilter; label: string; count: (c: ReturnType<typeof countByFilter>) => number }[] = [
  { key: "all", label: "All", count: (c) => c.all },
  { key: "full", label: "Full course", count: (c) => c.full },
  { key: 1, label: "Module 1", count: (c) => c["1"] },
  { key: 2, label: "Module 2", count: (c) => c["2"] },
  { key: 3, label: "Module 3", count: (c) => c["3"] },
  { key: 4, label: "Module 4", count: (c) => c["4"] },
  { key: "unknown", label: "Scope not set", count: (c) => c.unknown },
];

export function StudentIdsPanel({ pageTitle, rows }: { pageTitle: string; rows: IdRow[] }) {
  const [filter, setFilter] = useState<IdFilter>("all");
  const [query, setQuery] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [allState, copyAll] = useCopy();

  const counts = useMemo(() => countByFilter(rows), [rows]);
  const shown = useMemo(() => filterRows(rows, filter, query), [rows, filter, query]);
  const filtered = filter !== "all" || query.trim() !== "";
  const empty = rows.length === 0;
  const pct = (n: number) => (rows.length > 0 ? `(${Math.round((n / rows.length) * 100)}%)` : undefined);

  async function downloadPdf() {
    setPdfBusy(true);
    setNote(null);
    try {
      const { buildBatchPdf } = await import("@/lib/pzid/batch-pdf");
      const url = URL.createObjectURL(buildBatchPdf(pageTitle, shown.map((r) => ({ name: r.name, pzId: r.pzId }))));
      const link = document.createElement("a");
      link.href = url;
      link.download = `${pageTitle} - PZ IDs.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      setNote("Could not download the ID list. Please try again.");
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className={cardCls}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-headline text-2xl font-extrabold text-pz-on-surface">Student IDs</h2>
            <span className="rounded-full bg-pz-primary-fixed px-3 py-1 text-sm font-headline font-bold text-pz-on-primary-fixed dark:bg-pz-primary-fixed/30 dark:text-pz-on-surface">
              {rows.length} students
            </span>
          </div>
          <button
            type="button"
            onClick={() => void downloadPdf()}
            disabled={pdfBusy || shown.length === 0}
            className={`${quietBtn} max-md:w-full`}
          >
            <FileText aria-hidden className="h-4 w-4" />
            Download ID PDF
          </button>
        </div>
        {note && <p role="alert" className="mt-2 text-base text-pz-academy-error">{note}</p>}

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Stat icon={<Users aria-hidden className="h-5 w-5" />} label="Total enrolled" value={rows.length} />
          <Stat icon={<BookOpen aria-hidden className="h-5 w-5" />} label="Full course" value={counts.full} share={pct(counts.full)} />
          <Stat icon={<LayoutGrid aria-hidden className="h-5 w-5" />} label="Modular" value={counts.modular} share={pct(counts.modular)} />
        </div>
      </section>

      <section className={`${cardCls} space-y-4`}>
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-3">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Filter by course">
            {CHIPS.filter((c) => c.key !== "unknown" || counts.unknown > 0).map((c) => {
              const on = filter === c.key;
              return (
                <button
                  key={String(c.key)}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setFilter(c.key)}
                  className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 font-headline text-sm font-bold transition-colors ${
                    on
                      ? "bg-pz-primary text-pz-on-primary"
                      : "bg-pz-surface-container text-pz-on-surface-variant hover:text-pz-on-surface"
                  }`}
                >
                  {c.label} <span className="rounded-full bg-black/10 dark:bg-white/10 px-2 py-0.5 text-xs">{c.count(counts)}</span>
                </button>
              );
            })}
          </div>
          <div className="flex shrink-0 items-center gap-3 text-sm text-pz-on-surface-variant">
            <span>
              Showing {shown.length} of {rows.length} students
            </span>
            {filtered && (
              <button
                type="button"
                onClick={() => {
                  setFilter("all");
                  setQuery("");
                }}
                className="min-h-11 font-headline font-bold text-pz-primary"
              >
                Reset
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <label className="relative block flex-1">
            <span className="sr-only">Search by name or PZ ID</span>
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-pz-on-surface-variant" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or PZ ID"
              className={`${fieldCls} pl-10`}
            />
          </label>
          <div className="flex items-center gap-3 max-md:flex-col max-md:items-stretch">
            <button
              type="button"
              onClick={() => void copyAll(copyLines(shown))}
              disabled={shown.length === 0}
              className={`${primaryBtn} max-md:w-full`}
            >
              {allState === "copied" ? <Check aria-hidden className="h-4 w-4" /> : <Copy aria-hidden className="h-4 w-4" />}
              {allState === "copied" ? "Copied" : allState === "failed" ? "Copy failed" : "Copy all IDs in this filter"}
            </button>
            <span className="text-xs text-pz-on-surface-variant max-md:text-center">
              Copies {shown.length} records as Name - PZ ID
            </span>
          </div>
        </div>

        {empty ? (
          <p className="py-8 text-center text-base text-pz-on-surface-variant">No students enrolled yet.</p>
        ) : shown.length === 0 ? (
          <p className="py-8 text-center text-base text-pz-on-surface-variant">No students match this filter.</p>
        ) : (
          <ul className="divide-y divide-pz-outline-variant/40">
            {shown.map((r) => (
              <li key={r.pzId} className="flex items-center gap-3 py-3">
                <span
                  aria-hidden
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pz-primary-fixed font-headline text-sm font-bold text-pz-on-primary-fixed dark:bg-pz-primary-fixed/30 dark:text-pz-on-surface max-md:hidden"
                >
                  {initials(r.name)}
                </span>
                <div className="min-w-0 flex-1 md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1fr)] md:items-center md:gap-4">
                  <p className="truncate font-headline text-base font-bold text-pz-on-surface" title={r.name}>
                    {r.name}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 md:contents">
                    <code className="w-fit rounded bg-pz-surface-container px-2 py-1 font-mono text-sm font-bold text-pz-on-surface-variant">
                      {r.pzId}
                    </code>
                    <span className="text-sm text-pz-on-surface-variant">{scopeTag(r)}</span>
                  </div>
                </div>
                <RowCopy pzId={r.pzId} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
