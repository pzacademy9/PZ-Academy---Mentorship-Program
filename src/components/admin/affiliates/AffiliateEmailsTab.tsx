"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useAsyncAction } from "@/hooks/useAsyncAction";

// The same limit and counting as the server: .length, nothing smarter.
const MESSAGE_MAX = 1000;
const CHUNK = 25;

type Candidate = { id: string; name: string; email: string | null; sentAt: string | null };
type BatchResult = { sent: number; failed: number; skipped: number; limitReached: boolean; remainingToday: number };

const LABEL = "mb-1.5 block font-headline text-xs font-bold uppercase tracking-wide text-pz-on-surface-variant";
const CARD = "min-w-0 rounded-2xl border border-pz-outline-variant bg-pz-surface-container-lowest p-4 md:p-6";
const LINK_BTN = "inline-flex min-h-11 items-center px-1 font-body text-sm font-semibold text-pz-primary underline disabled:opacity-50";

const sentOn = (iso: string): string => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const people = (n: number): string => `${n} ${n === 1 ? "person" : "people"}`;

/** Admin: the message added to Progress and Welcome emails, and the Motivation send. */
export function AffiliateEmailsTab({
  initialMessage,
  messageFailed,
  onSaved,
}: {
  initialMessage: string;
  messageFailed: boolean;
  /** Tells the parent the new saved text, so it survives a switch to another tab. */
  onSaved?: (message: string) => void;
}) {
  const [message, setMessage] = useState(initialMessage);
  const [saved, setSaved] = useState<string | null>(null);

  const [includeSent, setIncludeSent] = useState(false);
  const [list, setList] = useState<Candidate[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string[]>([]);

  // Only the newest list request may change the screen, so a slow old answer cannot overwrite it.
  const latest = useRef(0);

  const load = useCallback(async (withSent: boolean): Promise<boolean> => {
    const mine = ++latest.current;
    try {
      const res = await fetch(`/api/admin/affiliates/motivation${withSent ? "?includeSent=1" : ""}`);
      const data = (await res.json().catch(() => null)) as { candidates?: Candidate[] } | null;
      if (mine !== latest.current) return true;
      if (!res.ok || !Array.isArray(data?.candidates)) return false;
      setList(data.candidates);
      // People who already got the email are shown but not ticked, so one tap cannot email them twice.
      setPicked(new Set(data.candidates.filter((c) => c.sentAt === null).map((c) => c.id)));
      return true;
    } catch {
      return mine !== latest.current;
    }
  }, []);

  useEffect(() => {
    let live = true;
    setList(null);
    setLoadFailed(false);
    void load(includeSent).then((ok) => {
      if (live && !ok) setLoadFailed(true);
    });
    return () => {
      live = false;
    };
  }, [includeSent, load]);

  const save = useAsyncAction(async () => {
    setSaved(null);
    try {
      const res = await fetch("/api/admin/affiliates/email-message", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        toast.error(data?.error ?? "Could not save the message. Please try again.");
        return;
      }
      onSaved?.(message);
      setSaved(
        message.trim() === ""
          ? "Saved. The message is switched off, so progress and welcome emails go out without it."
          : "Saved. This message is now added to every progress and welcome email.",
      );
    } catch {
      toast.error("Could not reach the server. Please check your connection and try again.");
    }
  });

  const send = useAsyncAction(async () => {
    const ids = (list ?? []).filter((c) => picked.has(c.id)).map((c) => c.id);
    if (ids.length === 0) return;
    setOutcome([]);
    let sent = 0;
    let failed = 0;
    let skipped = 0;
    let limit = false;
    let broke = false;
    setProgress(`Sent 0 of ${ids.length}`);
    for (let i = 0; i < ids.length; i += CHUNK) {
      try {
        const res = await fetch("/api/admin/affiliates/motivation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: ids.slice(i, i + CHUNK), includeSent }),
        });
        const data = (await res.json().catch(() => null)) as (Partial<BatchResult> & { error?: string }) | null;
        if (!res.ok || !data || typeof data.sent !== "number") {
          toast.error(data?.error ?? "Could not send. Please try again.");
          broke = true;
          break;
        }
        sent += data.sent;
        failed += data.failed ?? 0;
        skipped += data.skipped ?? 0;
        setProgress(`Sent ${sent} of ${ids.length}`);
        if (data.limitReached) {
          limit = true;
          break;
        }
      } catch {
        toast.error("Could not reach the server. Please check your connection and try again.");
        broke = true;
        break;
      }
    }
    const notReached = ids.length - (sent + failed + skipped);
    const lines: string[] = [];
    if (limit && notReached > 0) lines.push(`Daily limit reached. ${people(notReached)} left for tomorrow.`);
    else if (broke) lines.push(`Stopped. Sent ${sent}. ${people(notReached)} ${notReached === 1 ? "was" : "were"} not reached.`);
    else if (limit) lines.push(`Done. Sent ${sent}. Today's limit is now used up.`);
    else lines.push(`Done. Sent ${sent}.`);
    if (failed > 0) lines.push(`${failed} ${failed === 1 ? "email" : "emails"} could not be sent. They stay on the list so you can try again.`);
    if (skipped > 0) lines.push(`${people(skipped)} ${skipped === 1 ? "was" : "were"} skipped (no email address, or already handled).`);
    setProgress(null);
    setOutcome(lines);
    // Bring the list back in line with what the server now says.
    await load(includeSent);
  });

  const busy = send.pending;
  const count = picked.size;
  const sendLabel = busy ? "Sending..." : `Send to ${people(count)}`;

  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-2">
      <section aria-label="Message for all affiliates" className={`${CARD} self-start space-y-4`}>
        <div>
          <h2 className="font-headline text-lg font-bold text-pz-secondary">Message for all affiliates</h2>
          <p className="mt-1 font-body text-sm text-pz-on-surface-variant">
            This message is added to every Progress email and Welcome email. Leave it empty to switch it off.
          </p>
        </div>
        {messageFailed ? (
          <p className="rounded-lg border border-pz-outline-variant bg-pz-surface-container px-3 py-2 font-body text-sm text-pz-danger">
            The saved message could not be loaded, so the box is empty. Saving now would replace it. Refresh the page to try again.
          </p>
        ) : null}
        <div>
          <label htmlFor="aff-message" className={LABEL}>Message text</label>
          <textarea
            id="aff-message"
            rows={6}
            maxLength={MESSAGE_MAX}
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              setSaved(null);
            }}
            className="w-full min-w-0 rounded-lg border border-pz-outline-variant bg-pz-surface-container-lowest px-3 py-2.5 font-body text-sm max-md:text-base focus:outline-none focus:ring-2 focus:ring-pz-primary/20"
          />
          <div className="flex items-center justify-between">
            <span className="font-body text-xs text-pz-on-surface-variant">{message.length} / {MESSAGE_MAX}</span>
            <button type="button" className={`${LINK_BTN} min-h-11`} onClick={() => { setMessage(""); setSaved(null); }}>
              Clear text
            </button>
          </div>
        </div>
        <Button type="button" className="min-h-11 w-full" onClick={() => void save.run()} disabled={save.pending}>
          Save message
        </Button>
        {saved ? (
          <p role="status" className="rounded-lg border border-pz-outline-variant bg-pz-primary/10 px-3 py-2 font-body text-sm font-semibold text-pz-primary">
            {saved}
          </p>
        ) : null}
        <p className="font-body text-xs text-pz-on-surface-variant">
          Every email also carries the affiliate&apos;s own private link and discount code.
        </p>
      </section>

      <section aria-label="Send Motivation emails" className={`${CARD} relative min-w-0 space-y-4`}>
        <div className="md:pr-52">
          <h2 className="font-headline text-lg font-bold text-pz-secondary">Send Motivation emails</h2>
          <p className="mt-1 font-body text-sm text-pz-on-surface-variant">
            For affiliates with no paid sale yet. Each person gets it once.
          </p>
        </div>

        {list !== null && list.length === 0 && !includeSent ? null : (
          <div className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-pz-outline-variant bg-pz-surface-container px-3">
            <span id="aff-switch-label" className="font-body text-sm text-pz-on-surface">Also show people who already got it</span>
            <button
              type="button"
              role="switch"
              aria-checked={includeSent}
              aria-labelledby="aff-switch-label"
              disabled={busy}
              onClick={() => {
                setProgress(null);
                setOutcome([]);
                setIncludeSent((v) => !v);
              }}
              className={`relative inline-flex min-h-11 w-14 shrink-0 items-center rounded-full disabled:opacity-50`}
            >
              <span className={`absolute inset-x-0 h-7 rounded-full border border-pz-outline-variant ${includeSent ? "bg-pz-solid-forest" : "bg-pz-surface-container-high"}`} />
              <span className={`absolute h-5 w-5 rounded-full bg-white shadow transition-all ${includeSent ? "left-8" : "left-1"}`} />
            </button>
          </div>
        )}

        {loadFailed ? (
          <div className="space-y-2">
            <p className="font-body text-sm text-pz-danger">Could not load the list. Please try again.</p>
            <Button type="button" variant="outline" className="min-h-11" onClick={() => { setLoadFailed(false); void load(includeSent).then((ok) => setLoadFailed(!ok)); }}>
              Try again
            </Button>
          </div>
        ) : list === null ? (
          <p className="font-body text-sm text-pz-on-surface-variant">Loading the list...</p>
        ) : list.length === 0 && !includeSent ? (
          <EmptyState icon={Mail} title="Everyone has at least one paid sale." description="Nobody needs a Motivation email right now." />
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 border-b border-pz-outline-variant pb-1">
              <p className="font-body text-sm text-pz-on-surface-variant">
                <span className="font-headline text-base font-bold text-pz-secondary">{people(count)}</span> picked
              </p>
              <button type="button" className={LINK_BTN} disabled={busy} onClick={() => setPicked(new Set())}>
                Select none
              </button>
            </div>
            <ul data-testid="motivation-list" className="max-h-[28rem] min-w-0 divide-y divide-pz-outline-variant overflow-y-auto">
              {list.map((c) => (
                <li key={c.id} className="min-w-0">
                  <label className="flex min-h-11 min-w-0 cursor-pointer items-center gap-3 py-2">
                    <input
                      type="checkbox"
                      className="h-5 w-5 shrink-0"
                      checked={picked.has(c.id)}
                      disabled={busy}
                      onChange={() =>
                        setPicked((prev) => {
                          const next = new Set(prev);
                          if (!next.delete(c.id)) next.add(c.id);
                          return next;
                        })
                      }
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block break-words font-headline text-sm font-bold text-pz-secondary">{c.name}</span>
                      <span className="block font-body text-xs text-pz-on-surface-variant">
                        {c.sentAt ? `Sent ${sentOn(c.sentAt)}` : "Not sent yet"}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            {list.length === 0 ? <p className="font-body text-sm text-pz-on-surface-variant">Nobody to show.</p> : null}
          </>
        )}

        {progress ? <p role="status" className="font-body text-sm font-semibold text-pz-primary">{progress}</p> : null}
        {outcome.length > 0 ? (
          <div role="status" className="space-y-1 rounded-lg border border-pz-outline-variant bg-pz-surface-container px-3 py-2 font-body text-sm text-pz-on-surface">
            {outcome.map((line) => <p key={line}>{line}</p>)}
          </div>
        ) : null}

        {list !== null && list.length > 0 ? (
          <div className="sticky bottom-0 -mx-4 border-t border-pz-outline-variant bg-pz-surface-container-lowest p-3 md:absolute md:right-6 md:top-6 md:mx-0 md:border-0 md:bg-transparent md:p-0">
            <Button type="button" className="min-h-11 w-full md:w-auto" onClick={() => void send.run()} disabled={busy || count === 0}>
              {sendLabel}
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
