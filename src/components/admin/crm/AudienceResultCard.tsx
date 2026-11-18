"use client";

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
};

export type CountState =
  | { status: "idle"; key: string }
  | { status: "loading"; key: string }
  | { status: "error"; key: string; error: string }
  | { status: "done"; key: string; data: CountData };

const EXPORT_URL = "/api/admin/crm/audiences/export";
const n = (v: number) => v.toLocaleString("en-US");
const people = (v: number) => `${n(v)} ${v === 1 ? "person" : "people"}`;

function leftOutLine(d: CountData): string {
  const left = d.leftOut.noContact + d.leftOut.doNotContact;
  if (left === 0) return "Nobody left out";
  const reasons: string[] = [];
  if (d.leftOut.noContact > 0) reasons.push(`${n(d.leftOut.noContact)} have no email or phone`);
  if (d.leftOut.doNotContact > 0) reasons.push(`${n(d.leftOut.doNotContact)} asked not to be contacted`);
  return `${n(left)} left out: ${reasons.join(", ")}`;
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
  const fresh = count.key === currentKey;
  const data = fresh && count.status === "done" ? count.data : null;
  const canDownload = !!data && !data.tooLarge && !data.needsUpdate && data.inFile > 0;
  const metaHref = `${EXPORT_URL}?f=${currentKey}`;
  const plainHref = `${metaHref}&format=plain`;

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
      <div className="space-y-1 font-body">
        <p className="font-headline text-xl font-bold text-pz-secondary tabular-nums">{`${people(data.total)} match`}</p>
        <p className="text-sm tabular-nums">{`${n(data.inFile)} will go in the file`}</p>
        <p className="text-xs text-pz-on-surface-variant tabular-nums">{leftOutLine(data)}</p>
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
        "space-y-3 rounded-2xl border border-pz-outline-variant bg-pz-surface-container-lowest p-4 shadow-xl lg:shadow-none",
        className,
      )}
    >
      {/* Only the counts are announced, not the buttons or the privacy note. */}
      <div aria-live="polite">{body}</div>
      {ignored}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
        {canDownload ? (
          <Button asChild className="min-h-11">
            <a href={metaHref} download>Download for Meta</a>
          </Button>
        ) : (
          <Button className="min-h-11" disabled>Download for Meta</Button>
        )}
        {canDownload ? (
          <Button asChild variant="outline" className="min-h-11">
            <a href={plainHref} download>
              <Lock aria-hidden="true" />
              Download plain version
            </a>
          </Button>
        ) : (
          <Button variant="outline" className="min-h-11" disabled>
            <Lock aria-hidden="true" />
            Download plain version
          </Button>
        )}
      </div>
      <p className="font-body text-xs text-pz-on-surface-variant">
        The plain file has real emails and phone numbers. Keep it private and delete it after uploading.
      </p>
      <div className="flex flex-wrap items-start gap-x-4">
        <button
          type="button"
          onClick={onCheck}
          disabled={fresh && count.status === "loading"}
          className="min-h-11 font-body text-sm text-pz-primary underline disabled:opacity-50"
        >
          Check count
        </button>
        <div className="flex-1">{save}</div>
      </div>
    </section>
  );
}
