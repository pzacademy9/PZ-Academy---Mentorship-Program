"use client";

import { useId, useState } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AUDIENCE_MAX_PEOPLE } from "@/lib/crm/audience-filter";
import { cn } from "@/lib/utils";

export type CountData = {
  total: number;
  inFile: number;
  leftOut: { noContact: number; doNotContact: number };
  tooLarge: boolean;
  ignoredChoices: string[];
  needsUpdate: boolean;
  statusNeedsUpdate: boolean;
};

export type CountState =
  | { status: "idle"; key: string }
  | { status: "loading"; key: string }
  | { status: "error"; key: string; error: string }
  | { status: "done"; key: string; data: CountData };

const EXPORT_URL = "/api/admin/crm/audiences/export";
const n = (v: number) => v.toLocaleString("en-US");
const people = (v: number) => `${n(v)} ${v === 1 ? "person" : "people"}`;

// Each reason on its own line: what cannot be used, and who asked not to be contacted.
function ExcludedLines({ d }: { d: CountData }) {
  const { noContact, doNotContact } = d.leftOut;
  if (noContact === 0 && doNotContact === 0) return null;
  return (
    <>
      {noContact > 0 && <p>{`${n(noContact)} cannot be used: no email or phone`}</p>}
      {doNotContact > 0 && <p>{`${n(doNotContact)} asked not to be contacted`}</p>}
    </>
  );
}

export function AudienceResultCard({
  count,
  currentKey,
  onCheck,
  ignored,
  save,
  className,
}: {
  count: CountState;
  currentKey: string;
  onCheck: () => void;
  ignored: React.ReactNode;
  save: React.ReactNode;
  className?: string;
}) {
  const ids = useId();
  const [open, setOpen] = useState(false);
  const fresh = count.key === currentKey;
  const data = fresh && count.status === "done" ? count.data : null;
  const canDownload = !!data && !data.tooLarge && !data.needsUpdate && data.inFile > 0;
  const metaHref = `${EXPORT_URL}?f=${currentKey}`;
  const plainHref = `${metaHref}&format=plain`;
  const noteId = `${ids}-plain-note`;
  const detailsId = `${ids}-details`;
  // On phone the details sit behind the toggle; from lg up they are always shown.
  const detailsClass = cn("max-h-[60dvh] space-y-3 overflow-y-auto", !open && "hidden lg:block");

  let body: React.ReactNode;
  if (fresh && count.status === "loading") {
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
    body = (
      <div className="space-y-0.5 font-body">
        <p className="font-headline text-lg font-bold text-pz-secondary tabular-nums lg:text-xl">{`${people(data.total)} match`}</p>
        <p className="text-sm tabular-nums">{`${n(data.inFile)} will go in the file`}</p>
        <div className={cn("space-y-0.5 text-xs text-pz-on-surface-variant tabular-nums", !open && "hidden lg:block")}>
          <ExcludedLines d={data} />
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
      aria-label="Result"
      className={cn(
        "space-y-2 rounded-2xl border border-pz-outline-variant bg-pz-surface-container-lowest p-3 shadow-xl lg:space-y-3 lg:p-4 lg:shadow-none",
        className,
      )}
    >
      <h2 className="sr-only font-headline text-sm font-bold text-pz-secondary lg:not-sr-only">2. Check the number</h2>
      <div className="flex items-start justify-between gap-3">
        {/* Only the counts are announced, not the buttons or the privacy note. */}
        <div aria-live="polite" className="min-w-0 flex-1">{body}</div>
        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={onCheck}
            disabled={fresh && count.status === "loading"}
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
      <h2 className="sr-only font-headline text-sm font-bold text-pz-secondary lg:not-sr-only">3. Download</h2>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
        {canDownload ? (
          <Button asChild className="min-h-11 whitespace-normal">
            <a href={metaHref} download>Download for Meta</a>
          </Button>
        ) : (
          <Button className="min-h-11 whitespace-normal" disabled>Download for Meta</Button>
        )}
        {canDownload ? (
          <Button asChild variant="outline" className="min-h-11 whitespace-normal">
            <a href={plainHref} download aria-describedby={noteId}>
              <Lock aria-hidden="true" />
              Download plain version
            </a>
          </Button>
        ) : (
          <Button variant="outline" className="min-h-11 whitespace-normal" disabled aria-describedby={noteId}>
            <Lock aria-hidden="true" />
            Download plain version
          </Button>
        )}
      </div>
      <p className="font-body text-xs text-pz-on-surface-variant lg:hidden">Plain file: keep it private.</p>
      <div id={detailsId} className={detailsClass}>
        <p id={noteId} className="font-body text-xs text-pz-on-surface-variant">
          The plain file has real emails and phone numbers. Keep it private and delete it after uploading.
        </p>
      </div>
      {/* Outside the collapsible details so the form stays visible when open. */}
      <div>{save}</div>
    </section>
  );
}
