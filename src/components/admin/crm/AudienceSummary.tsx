"use client";

import { useId, useState } from "react";
import { describeAudienceFilter, AUDIENCE_MAX_PEOPLE, type AudienceFilter } from "@/lib/crm/audience-filter";
import { cn } from "@/lib/utils";
import type { CountState } from "@/components/admin/crm/AudienceResultCard";

const n = (v: number) => v.toLocaleString("en-US");
const people = (v: number) => `${n(v)} ${v === 1 ? "person" : "people"}`;

// The "Your list" card: the plain sentence, the count, and the one big button to go on.
export function AudienceSummary({
  filter,
  count,
  currentKey,
  onNext,
  onReset,
  onCheck,
  nextLabel,
  ignored,
  save,
  className,
}: {
  filter: AudienceFilter;
  count: CountState;
  currentKey: string;
  onNext: () => void;
  onReset: () => void;
  onCheck: () => void;
  nextLabel: string;
  ignored?: React.ReactNode;
  save?: React.ReactNode;
  className?: string;
}) {
  const ids = useId();
  const [open, setOpen] = useState(false);
  const fresh = count.key === currentKey;
  const loading = fresh && count.status === "loading";
  const data = fresh && count.status === "done" ? count.data : null;
  const canNext = !!data && !data.tooLarge && !data.needsUpdate && data.inFile > 0;
  const detailsId = `${ids}-details`;
  // On phone the sentence and the left-out lines sit behind the toggle; from lg up they are always shown.
  const detailsClass = cn("max-h-[60dvh] space-y-3 overflow-y-auto", !open && "hidden lg:block");

  let body: React.ReactNode;
  if (loading) {
    body = <p className="font-body text-sm text-pz-on-surface-variant">Counting…</p>;
  } else if (fresh && count.status === "error") {
    body = <p className="font-body text-sm text-pz-danger">{count.error}</p>;
  } else if (data?.needsUpdate) {
    body = <p className="font-body text-sm text-pz-on-surface-variant">Counting needs one small database update first.</p>;
  } else if (data?.tooLarge) {
    body = (
      <p className="font-body text-sm text-pz-danger">
        This is too many people for one file (more than {n(AUDIENCE_MAX_PEOPLE)}). Narrow the choices and check again.
      </p>
    );
  } else if (data) {
    const { noContact, doNotContact } = data.leftOut;
    body = (
      <div className="space-y-1 font-body">
        <p className="font-headline text-xl font-bold text-pz-secondary tabular-nums lg:text-3xl">{`${people(data.total)} match`}</p>
        <p className="inline-block rounded-full bg-pz-primary-container px-3 py-1 text-sm font-semibold text-pz-on-primary-container tabular-nums">
          {`${n(data.inFile)} uploadable to Meta`}
        </p>
        <div className={cn("space-y-0.5 text-xs text-pz-on-surface-variant tabular-nums", !open && "hidden lg:block")}>
          {noContact > 0 && <p>{`${n(noContact)} cannot be used: no email or phone`}</p>}
          {doNotContact > 0 && <p>{`${n(doNotContact)} asked not to be contacted`}</p>}
        </div>
      </div>
    );
  } else {
    body = (
      <p className="font-body text-sm text-pz-on-surface-variant">
        {count.status === "idle" ? "Choose who to include, then check the count." : "Choices changed. The count will update in a moment."}
      </p>
    );
  }

  return (
    <section
      data-testid="audience-result"
      aria-label="Your list"
      className={cn(
        "space-y-2 rounded-2xl border border-pz-outline-variant bg-pz-surface-container-lowest p-3 shadow-xl lg:space-y-3 lg:p-4 lg:shadow-none",
        className,
      )}
    >
      <h2 className="sr-only font-headline text-sm font-bold text-pz-secondary lg:not-sr-only">Your list</h2>
      <div id={detailsId} className={detailsClass}>
        <p className="rounded-xl bg-pz-primary-container p-3 font-body text-sm text-pz-on-primary-container">
          {`You are choosing: ${describeAudienceFilter(filter).join(" · ")}`}
        </p>
      </div>
      <div className="flex items-start justify-between gap-3">
        {/* Only the counts are announced, not the buttons. */}
        <div aria-live="polite" className="min-w-0 flex-1">{body}</div>
        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={onCheck}
            disabled={loading}
            className="min-h-11 font-body text-sm text-pz-primary underline disabled:opacity-50"
          >
            Check count
          </button>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={detailsId}
            onClick={() => setOpen((v) => !v)}
            className="min-h-11 font-body text-sm text-pz-primary underline lg:hidden"
          >
            Details
          </button>
        </div>
      </div>
      {ignored}
      <button
        type="button"
        onClick={onNext}
        disabled={!canNext}
        className="min-h-12 w-full rounded-full bg-pz-primary px-5 py-3 font-headline text-base font-semibold text-pz-on-primary disabled:opacity-50"
      >
        {nextLabel}
      </button>
      <button type="button" onClick={onReset} className="min-h-11 font-body text-sm text-pz-primary underline">
        Reset all filters
      </button>
      {/* Outside the collapsible details so the form stays visible when open. */}
      <div>{save}</div>
    </section>
  );
}
