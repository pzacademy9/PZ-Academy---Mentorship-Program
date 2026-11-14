"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronRight, MailOpen, Users } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import type { MotivationSendRow } from "@/lib/data/affiliate-motivation-sends";

const people = (n: number): string => `${n} ${n === 1 ? "person" : "people"}`;
const when = (iso: string): string =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

type Html = { id: string; html: string };

/** Admin: what was sent before. A card opens the saved example email and the names. Full-screen sheet on a phone, a reading panel beside the list on a desktop. */
export function AffiliateEmailHistory({ sends, failed }: { sends: MotivationSendRow[]; failed: boolean }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Html | null>(null);
  const [error, setError] = useState(false);
  // Only the newest open request may change the panel, so a slow old answer cannot replace it.
  const latest = useRef(0);

  useEffect(() => {
    if (openId === null) return;
    const mine = ++latest.current;
    setLoaded(null);
    setError(false);
    void (async () => {
      try {
        const res = await fetch(`/api/admin/affiliates/motivation-sends/${openId}`);
        const data = (await res.json().catch(() => null)) as { html?: unknown } | null;
        if (mine !== latest.current) return;
        if (!res.ok || typeof data?.html !== "string") {
          setError(true);
          return;
        }
        setLoaded({ id: openId, html: data.html });
      } catch {
        if (mine === latest.current) setError(true);
      }
    })();
  }, [openId]);

  if (failed) {
    return <p className="font-body text-sm text-pz-on-surface-variant">History could not be loaded.</p>;
  }
  if (sends.length === 0) {
    return (
      <EmptyState
        icon={MailOpen}
        title="No motivation emails sent yet"
        description="When you send a Motivation email, a record of it appears here."
      />
    );
  }

  const open = sends.find((s) => s.id === openId) ?? null;

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <section aria-label="Sent emails" className="min-w-0 space-y-3">
        <p className="font-headline text-xs font-bold uppercase tracking-wide text-pz-on-surface-variant">Recent sends</p>
        {sends.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setOpenId(s.id)}
            aria-pressed={s.id === openId}
            className={`block min-h-11 w-full min-w-0 rounded-2xl border bg-pz-surface-container-lowest p-3.5 text-left ${s.id === openId ? "border-pz-solid-forest" : "border-pz-outline-variant"}`}
          >
            <span className="flex items-start justify-between gap-2">
              <span className="font-headline text-xs font-semibold text-pz-on-surface-variant">{when(s.createdAt)}</span>
              {s.failedCount > 0 ? (
                <span className="rounded-full border border-pz-outline-variant bg-pz-surface-container px-2 py-0.5 font-headline text-xs font-semibold text-pz-danger">
                  {s.failedCount} failed
                </span>
              ) : null}
            </span>
            <span className="mt-1.5 block break-words font-headline text-sm font-bold text-pz-secondary">{s.subject}</span>
            <span className="mt-2.5 flex items-center justify-between gap-2 border-t border-pz-outline-variant pt-2 font-body text-xs text-pz-on-surface-variant">
              <span className="flex items-center gap-1">
                <Users className="h-4 w-4" aria-hidden="true" />
                Sent to {people(s.recipientCount)}
              </span>
              <span className="flex items-center gap-0.5 font-semibold text-pz-primary">
                View email and names
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </span>
            </span>
          </button>
        ))}
      </section>

      {open ? (
        <section
          aria-label="Email details"
          className="fixed inset-0 z-50 flex min-w-0 flex-col overflow-y-auto bg-pz-surface-container-lowest lg:static lg:z-auto lg:self-start lg:rounded-2xl lg:border lg:border-pz-outline-variant"
        >
          <div className="sticky top-0 flex items-center justify-between gap-2 border-b border-pz-outline-variant bg-pz-surface-container-lowest px-4 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                aria-label="Back"
                onClick={() => setOpenId(null)}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-pz-on-surface lg:hidden"
              >
                <ArrowLeft className="h-5 w-5" aria-hidden="true" />
              </button>
              <h3 className="min-w-0 break-words font-headline text-sm font-bold text-pz-secondary">Sent email details</h3>
            </div>
            {open.failedCount > 0 ? (
              <span className="shrink-0 rounded-full border border-pz-outline-variant bg-pz-surface-container px-2 py-0.5 font-headline text-xs font-semibold text-pz-danger">
                {open.failedCount} failed
              </span>
            ) : null}
          </div>
          <div className="space-y-4 p-4 pb-12 md:p-6">
            <dl className="space-y-1.5 rounded-lg border border-pz-outline-variant bg-pz-surface-container p-3 font-body text-xs text-pz-on-surface-variant">
              <div className="flex items-start justify-between gap-3">
                <dt className="font-headline font-semibold">Subject</dt>
                <dd className="min-w-0 break-words text-right font-headline font-bold text-pz-secondary">{open.subject}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="font-headline font-semibold">Sent</dt>
                <dd>{when(open.createdAt)}</dd>
              </div>
            </dl>

            <div>
              <p className="mb-1.5 font-headline text-xs font-bold uppercase tracking-wide text-pz-on-surface-variant">Email preview</p>
              {error ? (
                <p className="font-body text-sm text-pz-danger">Could not open this email.</p>
              ) : loaded && loaded.id === open.id ? (
                <iframe
                  title="Email preview"
                  sandbox=""
                  srcDoc={loaded.html}
                  className="h-96 w-full rounded-lg border border-pz-outline-variant bg-white"
                />
              ) : (
                <p className="font-body text-sm text-pz-on-surface-variant">Opening the email...</p>
              )}
            </div>

            <div>
              <p className="mb-2 font-headline text-xs font-bold text-pz-secondary">Recipients ({open.recipients.length})</p>
              {open.recipients.length === 0 ? (
                <p className="font-body text-sm text-pz-on-surface-variant">No names were saved for this send.</p>
              ) : (
                <ul className="divide-y divide-pz-outline-variant rounded-lg border border-pz-outline-variant">
                  {open.recipients.map((r, i) => (
                    <li key={`${r.name}-${i}`} className="flex min-h-11 items-center justify-between gap-3 px-3 py-2">
                      <span className="min-w-0 break-words font-headline text-sm font-semibold text-pz-secondary">{r.name}</span>
                      <span className={`shrink-0 font-headline text-xs font-semibold ${r.ok ? "text-pz-mid" : "text-pz-danger"}`}>
                        {r.ok ? "Delivered" : "Failed"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
