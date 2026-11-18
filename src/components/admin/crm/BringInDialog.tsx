"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import type { AudienceFacets } from "@/lib/data/audience-query";
import { BRING_IN_MAX_PAGES } from "@/lib/validations/audience";

type LandingPage = AudienceFacets["landingPages"][number];
type PageResult = { id: string; ok: boolean; paidAdded: number; interestedAdded: number; skipped: number; error?: string };

const UNFINISHED = "This page did not finish. Press Bring in again to retry it.";

const failed = (id: string, error: string): PageResult => ({ id, ok: false, paidAdded: 0, interestedAdded: 0, skipped: 0, error });

/**
 * One page per request, so a long "Select all" never runs past the server's
 * time limit. Any answer that is not a page result (a timeout page, a
 * dropped connection) becomes a plain line for that page only.
 */
async function bringInOne(id: string): Promise<PageResult> {
  try {
    const res = await fetch("/api/admin/crm/audiences/bring-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageIds: [id] }),
    });
    const json = (await res.json().catch(() => null)) as { pages?: PageResult[]; error?: unknown } | null;
    const page = res.ok && json && Array.isArray(json.pages) ? json.pages.find((p) => p.id === id) : undefined;
    if (page) return page;
    if (json && typeof json.error === "string") return failed(id, json.error);
    return failed(id, UNFINISHED);
  } catch {
    return failed(id, UNFINISHED);
  }
}

function resultLine(r: PageResult): string {
  if (!r.ok) return r.error ?? "Could not bring this page in. Please try again.";
  const main = `Brought in ${r.paidAdded.toLocaleString("en-US")} paid, ${r.interestedAdded.toLocaleString("en-US")} interested.`;
  return r.skipped > 0 ? `${main} ${r.skipped.toLocaleString("en-US")} cannot be used: no email or phone, or no consent.` : main;
}

export function BringInDialog({ landingPages, onDone }: { landingPages: LandingPage[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<PageResult[] | null>(null);
  const [progress, setProgress] = useState<{ at: number; of: number } | null>(null);

  const titleOf = (id: string) => landingPages.find((p) => p.id === id)?.title ?? "A page";
  const tooMany = picked.length > BRING_IN_MAX_PAGES;

  function changeOpen(next: boolean) {
    if (running) return; // never close mid-request
    if (next) {
      setPicked([]);
      setResults(null);
      setProgress(null);
    }
    setOpen(next);
  }

  const toggle = (id: string) => setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  async function bringIn() {
    if (running || picked.length === 0 || tooMany) return;
    const ids = [...picked];
    setRunning(true);
    setResults([]);
    try {
      // One page at a time; a failed page never stops the rest.
      for (let i = 0; i < ids.length; i++) {
        setProgress({ at: i + 1, of: ids.length });
        const result = await bringInOne(ids[i]);
        setResults((prev) => [...(prev ?? []), result]);
      }
    } finally {
      setProgress(null);
      setRunning(false);
      // Even an unfinished page may have been partly copied, so always refresh.
      onDone();
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="min-h-11" disabled={running}>
          <UserPlus aria-hidden="true" />
          Bring in from landing pages
        </Button>
      </DialogTrigger>
      <DialogContent
        className="md:max-w-xl"
        onEscapeKeyDown={(e) => {
          if (running) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          if (running) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle className="font-headline text-pz-secondary">Bring in from landing pages</DialogTitle>
          <DialogDescription className="font-body text-pz-on-surface-variant">
            Copy people who registered on landing pages into the CRM. Safe to press again.
          </DialogDescription>
        </DialogHeader>

        {landingPages.length === 0 ? (
          <p className="font-body text-sm text-pz-on-surface-variant">No landing pages yet.</p>
        ) : (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setPicked(landingPages.map((p) => p.id))}
              disabled={running}
              className="min-h-11 font-body text-sm text-pz-primary underline disabled:opacity-50"
            >
              Select all
            </button>
            <ul className="max-h-[45dvh] space-y-1 overflow-y-auto">
              {landingPages.map((p) => (
                <li key={p.id}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-2 py-2 font-body text-sm hover:bg-pz-surface-container-high">
                    <input
                      type="checkbox"
                      checked={picked.includes(p.id)}
                      onChange={() => toggle(p.id)}
                      disabled={running}
                      className="h-4 w-4 shrink-0"
                    />
                    <span className="flex-1">
                      {p.title}, {p.registrations.toLocaleString("en-US")} {p.registrations === 1 ? "person" : "people"}
                    </span>
                    {p.alreadyBrought && (
                      <span className="rounded-full bg-pz-primary-container px-2 py-0.5 text-[10px] font-bold uppercase text-pz-on-primary-container">
                        already brought in
                      </span>
                    )}
                  </label>
                </li>
              ))}
            </ul>
            {tooMany && (
              <p className="font-body text-xs text-pz-danger">Pick {BRING_IN_MAX_PAGES} pages at most, then bring in the rest after.</p>
            )}
          </div>
        )}

        <div aria-live="polite" className="space-y-1">
          {progress && (
            <p className="font-body text-sm font-semibold text-pz-on-surface-variant tabular-nums">
              {`Page ${progress.at} of ${progress.of}`}
            </p>
          )}
          {results?.map((r) => (
            <p key={r.id} className={`font-body text-sm ${r.ok ? "text-pz-on-surface-variant" : "text-pz-danger"}`}>
              <span className="font-semibold">{titleOf(r.id)}:</span> {resultLine(r)}
            </p>
          ))}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" className="min-h-11" disabled={running} onClick={() => changeOpen(false)}>
            {results && !running ? "Close" : "Cancel"}
          </Button>
          {landingPages.length > 0 && (
            <Button className="min-h-11" loading={running} disabled={picked.length === 0 || tooMany} onClick={bringIn}>
              {running ? "Bringing in…" : "Bring in"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
