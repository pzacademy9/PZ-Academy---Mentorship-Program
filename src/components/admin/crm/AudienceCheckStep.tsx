"use client";

import { useEffect, useRef, useState } from "react";
import type { AudienceFilter } from "@/lib/crm/audience-filter";
import type { AudiencePreview } from "@/lib/crm/audience-preview";
import { stepCard, stepPrimary, stepText } from "@/components/admin/crm/audience-step-styles";

const PREVIEW_URL = "/api/admin/crm/audiences/preview";
const FAILED = "Could not load the list. Please try again.";
const n = (v: number) => v.toLocaleString("en-US");

type Failure = { key: string; error: string };

async function load(filter: AudienceFilter, signal: AbortSignal): Promise<AudiencePreview | string> {
  try {
    const res = await fetch(PREVIEW_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(filter),
      signal,
    });
    // A timeout can return a page that is not JSON: treat it like any other failure.
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok || !json) return typeof json?.error === "string" ? json.error : FAILED;
    const looksRight = Array.isArray(json.people) && typeof json.inFile === "number" && !!json.leftOut && Array.isArray(json.columns);
    return looksRight ? (json as unknown as AudiencePreview) : FAILED;
  } catch {
    return FAILED;
  }
}

export function LeftOutLines({ preview }: { preview: AudiencePreview }) {
  const { noContact, doNotContact } = preview.leftOut;
  if (noContact === 0 && doNotContact === 0) return null;
  return (
    <ul className="space-y-1 font-body text-sm text-pz-on-surface-variant">
      {noContact > 0 && <li>{`${n(noContact)} cannot be used: no email or phone`}</li>}
      {doNotContact > 0 && <li>{`${n(doNotContact)} asked not to be contacted`}</li>}
    </ul>
  );
}

// Step 2: a small look at who is in the list. Fetches the preview itself, once per set of choices.
export function AudienceCheckStep({
  filter,
  filterKey,
  preview,
  total,
  onLoaded,
  onBack,
  onNext,
}: {
  filter: AudienceFilter;
  filterKey: string;
  // The panel keeps the loaded preview (only if it belongs to these choices) so step 3 can reuse it.
  preview: AudiencePreview | null;
  total?: number;
  onLoaded: (key: string, preview: AudiencePreview) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const [failure, setFailure] = useState<Failure | null>(null);
  const [attempt, setAttempt] = useState(0);
  const filterRef = useRef(filter);
  filterRef.current = filter;
  const onLoadedRef = useRef(onLoaded);
  onLoadedRef.current = onLoaded;
  const have = preview !== null;

  useEffect(() => {
    if (have) return;
    const c = new AbortController();
    void load(filterRef.current, c.signal).then((r) => {
      if (c.signal.aborted) return;
      if (typeof r === "string") setFailure({ key: filterKey, error: r });
      else onLoadedRef.current(filterKey, r);
    });
    return () => c.abort();
  }, [filterKey, have, attempt]);

  const error = !have && failure && failure.key === filterKey ? failure.error : null;
  const sum = preview ? preview.inFile + preview.leftOut.noContact + preview.leftOut.doNotContact : 0;

  let body: React.ReactNode;
  if (error) {
    body = (
      <div className="space-y-2">
        <p role="alert" className="font-body text-sm text-pz-danger">{error}</p>
        <button
          type="button"
          onClick={() => {
            setFailure(null);
            setAttempt((a) => a + 1);
          }}
          className={stepText}
        >
          Try again
        </button>
      </div>
    );
  } else if (!preview) {
    body = <p role="status" className="font-body text-sm text-pz-on-surface-variant">Loading the list…</p>;
  } else if (preview.inFile === 0) {
    body = <p className="font-body text-sm text-pz-on-surface-variant">Nobody to download for these choices.</p>;
  } else {
    body = (
      <>
        <p className="font-body text-sm text-pz-on-surface-variant">
          {`Only people with an email or phone can go to Meta: ${n(preview.inFile)} of ${n(total ?? sum)}`}
        </p>
        <h3 className="font-headline text-base font-bold text-pz-secondary">A few people from this list</h3>
        <ul className="divide-y divide-pz-outline-variant rounded-xl border border-pz-outline-variant">
          {preview.people.map((p, i) => (
            <li key={i} className="flex flex-col gap-0.5 p-3 font-body text-sm sm:flex-row sm:items-center sm:gap-4">
              <span className="min-w-0 flex-1 break-words font-semibold">{p.name || "No name"}</span>
              <span className="break-all text-pz-on-surface-variant">{p.email || "No email"}</span>
              <span className="text-pz-on-surface-variant">{p.country || "No country"}</span>
            </li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <section aria-label="Check the list" className={stepCard}>
      <h2 className="font-headline text-lg font-bold text-pz-secondary">Check the list</h2>
      {body}
      {preview && <LeftOutLines preview={preview} />}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onBack} className={stepText}>Back</button>
        <button type="button" onClick={onNext} disabled={!preview || preview.inFile === 0} className={stepPrimary}>
          Next: Download
        </button>
      </div>
    </section>
  );
}
