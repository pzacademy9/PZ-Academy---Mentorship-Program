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

const GENERIC = "Could not bring these pages in. Please try again.";

function resultLine(r: PageResult): string {
  if (!r.ok) return r.error ?? "Could not bring this page in. Please try again.";
  const main = `Brought in ${r.paidAdded.toLocaleString("en-US")} paid, ${r.interestedAdded.toLocaleString("en-US")} interested.`;
  return r.skipped > 0 ? `${main} ${r.skipped.toLocaleString("en-US")} left out: no email or phone, or no consent.` : main;
}

export function BringInDialog({ landingPages, onDone }: { landingPages: LandingPage[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<PageResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const titleOf = (id: string) => landingPages.find((p) => p.id === id)?.title ?? "A page";
  const tooMany = picked.length > BRING_IN_MAX_PAGES;

  function changeOpen(next: boolean) {
    if (running) return; // never close mid-request
    if (next) {
      setPicked([]);
      setResults(null);
      setError(null);
    }
    setOpen(next);
  }

  const toggle = (id: string) => setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  async function bringIn() {
    if (running || picked.length === 0 || tooMany) return;
    setRunning(true);
    setError(null);
    setResults(null);
    try {
      const res = await fetch("/api/admin/crm/audiences/bring-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageIds: picked }),
      });
      const json = (await res.json().catch(() => ({}))) as { pages?: PageResult[]; error?: unknown };
      if (!res.ok || !Array.isArray(json.pages)) {
        setError(typeof json.error === "string" ? json.error : GENERIC);
        return;
      }
      setResults(json.pages);
      if (json.pages.some((p) => p.ok)) onDone();
    } catch {
      setError(GENERIC);
    } finally {
      setRunning(false);
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
          {error && <p className="font-body text-sm text-pz-danger">{error}</p>}
          {results?.map((r) => (
            <p key={r.id} className={`font-body text-sm ${r.ok ? "text-pz-on-surface-variant" : "text-pz-danger"}`}>
              <span className="font-semibold">{titleOf(r.id)}:</span> {resultLine(r)}
            </p>
          ))}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" className="min-h-11" disabled={running} onClick={() => changeOpen(false)}>
            {results ? "Close" : "Cancel"}
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
