"use client";

import { useRef, useState } from "react";
import { Check, Copy, Eye, Info, Link2, UserPlus, CircleCheck } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

export type MyLinkRow = { id: string; title: string; link: string; views: number; registered: number; paid: number };

function Stat({ icon: Icon, label, value }: { icon: typeof Eye; label: string; value: number }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-0.5 rounded-xl bg-pz-surface-container-low px-3 py-2.5 md:min-w-[5.5rem] md:flex-none">
      <span className="flex items-center gap-1 font-body text-xs text-pz-on-surface-variant">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
      </span>
      <span className="font-headline text-xl font-bold text-pz-secondary">{value.toLocaleString("en-US")}</span>
    </div>
  );
}

function LinkCard({ row }: { row: MyLinkRow }) {
  const [state, setState] = useState<"idle" | "copied" | "manual">("idle");
  const boxRef = useRef<HTMLInputElement>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(row.link);
      setState("copied");
      setTimeout(() => setState("idle"), 2500);
    } catch {
      // Clipboard blocked: select the link so it can be copied by hand.
      boxRef.current?.focus();
      boxRef.current?.select();
      setState("manual");
    }
  }

  return (
    <section className="rounded-2xl border border-pz-outline-variant bg-pz-surface-container-lowest p-4 md:p-5">
      <h2 className="font-headline text-lg font-bold text-pz-on-surface">{row.title}</h2>
      <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-pz-surface-container-low px-3 py-2.5">
          <Link2 className="h-4 w-4 shrink-0 text-pz-on-surface-variant" aria-hidden="true" />
          <input
            ref={boxRef}
            readOnly
            value={row.link}
            aria-label={`Link for ${row.title}`}
            onFocus={(e) => e.currentTarget.select()}
            className="min-w-0 flex-1 bg-transparent font-mono text-xs text-pz-on-surface outline-none"
          />
        </div>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-pz-primary px-4 py-2.5 font-body text-sm font-semibold text-pz-on-primary hover:opacity-90 max-md:w-full"
        >
          {state === "copied" ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
          {state === "copied" ? "Copied!" : "Copy link"}
        </button>
      </div>
      {state === "manual" && (
        <p role="status" className="mt-2 font-body text-xs text-pz-on-surface-variant">
          Your browser did not allow copying. The link is selected above: press Ctrl+C (or hold and tap Copy on a phone).
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-pz-outline-variant pt-4">
        <div className="flex w-full gap-2 md:w-auto">
          <Stat icon={Eye} label="Views" value={row.views} />
          <Stat icon={UserPlus} label="Registered" value={row.registered} />
          <Stat icon={CircleCheck} label="Paid" value={row.paid} />
        </div>
        <p className="flex items-center gap-1.5 font-body text-xs text-pz-on-surface-variant md:ml-auto">
          <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Counts are only for people who came through your link.
        </p>
      </div>
    </section>
  );
}

export function MyLinks({ code, rows }: { code: string; rows: MyLinkRow[] }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl">
          <h1 className="font-headline text-2xl font-bold text-pz-secondary">My links</h1>
          <p className="mt-1 font-body text-sm text-pz-on-surface-variant">
            Share your own link for each course. We count everyone who comes through it, so you can see how you are doing.
          </p>
        </div>
        <span className="rounded-full bg-pz-surface-container-high px-3 py-1 font-mono text-xs font-semibold text-pz-on-surface-variant">
          Ref: {code}
        </span>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Link2}
          title="No pages are open for registration yet"
          description="When a course or workshop opens, your personal link will appear here."
        />
      ) : (
        <div className="space-y-4">
          {rows.map((r) => (
            <LinkCard key={r.id} row={r} />
          ))}
        </div>
      )}
    </div>
  );
}
