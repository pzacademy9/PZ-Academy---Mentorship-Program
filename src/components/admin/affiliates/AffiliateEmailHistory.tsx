"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronRight, MailOpen, Users, X } from "lucide-react";
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
  const opener = useRef<HTMLElement | null>(null);
  const backRef = useRef<HTMLButtonElement | null>(null);
  // On a wide screen the reading panel sits beside the list; only the phone sheet is a modal.
  const [wide, setWide] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setWide(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const close = () => {
    latest.current += 1;
    setOpenId(null);
    opener.current?.focus();
  };
  const closeRef = useRef(close);
  closeRef.current = close;

  const modal = openId !== null && !wide;
  useEffect(() => {
    if (openId === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openId]);
  useEffect(() => {
    if (!modal) return;
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    backRef.current?.focus();
    return () => {
      document.body.style.overflow = before;
    };
  }, [modal]);

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
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <section aria-label="Sent emails" className="min-w-0 space-y-3">
        <p className="font-headline text-sm font-bold text-pz-secondary">
          Sent emails <span className="font-body text-xs font-semibold text-pz-on-surface-variant">({sends.length})</span>
        </p>
        {sends.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={(e) => {
              opener.current = e.currentTarget;
              setOpenId(s.id);
            }}
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
                Reading view
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </span>
            </span>
          </button>
        ))}
      </section>

      {open ? (
        <section
          role={wide ? undefined : "dialog"}
          aria-modal={wide ? undefined : true}
          aria-label="Email details"
          className="fixed inset-0 z-50 flex min-w-0 flex-col overflow-y-auto bg-pz-surface-container-lowest lg:static lg:z-auto lg:self-start lg:rounded-2xl lg:border lg:border-pz-outline-variant"
        >
          <div className="sticky top-0 flex items-center justify-between gap-2 border-b border-pz-outline-variant bg-pz-surface-container-lowest px-4 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                ref={backRef}
                aria-label="Back"
                onClick={close}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-pz-on-surface lg:hidden"
              >
                <ArrowLeft className="h-5 w-5" aria-hidden="true" />
              </button>
              <div className="min-w-0">
                <p className="hidden font-headline text-xs font-bold text-pz-on-surface-variant lg:block">Selected email</p>
                <h3 className="min-w-0 break-words font-headline text-sm font-bold text-pz-secondary lg:text-lg">Sent email details</h3>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {open.failedCount > 0 ? (
                <span className="rounded-full border border-pz-outline-variant bg-pz-surface-container px-2 py-0.5 font-headline text-xs font-semibold text-pz-danger">
                  {open.failedCount} failed
                </span>
              ) : null}
              <button
                type="button"
                onClick={close}
                className="hidden min-h-11 items-center gap-1 rounded-lg px-2 font-headline text-xs font-semibold text-pz-on-surface-variant lg:inline-flex"
              >
                <X className="h-4 w-4" aria-hidden="true" />
                Close
              </button>
            </div>
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

            <div className="flex flex-wrap items-center gap-2 font-headline text-xs font-semibold">
              <span className="rounded-md border border-pz-outline-variant bg-pz-surface-container px-3 py-1 text-pz-mid">{open.recipientCount} Delivered</span>
              {open.failedCount > 0 ? (
                <span className="rounded-md border border-pz-outline-variant bg-pz-surface-container px-3 py-1 text-pz-danger">{open.failedCount} Failed</span>
              ) : null}
            </div>

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
              <p className="mb-2 font-headline text-sm font-bold text-pz-secondary">
                Recipients{" "}
                <span className="font-body text-xs font-medium text-pz-on-surface-variant">
                  ({open.recipients.length} total, {open.recipients.filter((r) => r.ok).length} delivered, {open.recipients.filter((r) => !r.ok).length} failed)
                </span>
              </p>
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
      ) : (
        <section
          aria-label="Email details"
          className="hidden min-h-48 items-center justify-center rounded-2xl border border-dashed border-pz-outline-variant p-6 text-center lg:flex"
        >
          <p className="font-body text-sm text-pz-on-surface-variant">Select an email to read it.</p>
        </section>
      )}
    </div>
  );
}
