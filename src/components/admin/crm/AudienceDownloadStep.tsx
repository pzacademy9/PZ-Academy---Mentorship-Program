"use client";

import { useId } from "react";
import { audienceExportUrls } from "@/lib/crm/audience-export-url";
import type { AudienceFilter } from "@/lib/crm/audience-filter";
import type { AudiencePreview } from "@/lib/crm/audience-preview";
import { LeftOutLines } from "@/components/admin/crm/AudienceCheckStep";
import { stepCard, stepOutline, stepPrimary, stepText } from "@/components/admin/crm/audience-step-styles";

const n = (v: number) => v.toLocaleString("en-US");

// Step 3: what is in the file, and the two download buttons.
export function AudienceDownloadStep({
  filterKey,
  preview,
  onBack,
}: {
  filter: AudienceFilter;
  filterKey: string;
  preview: AudiencePreview;
  onBack: () => void;
}) {
  const noteId = useId();
  const urls = audienceExportUrls(filterKey);
  const off = preview.inFile === 0;

  return (
    <section aria-label="Download" className={stepCard}>
      <h2 className="font-headline text-lg font-bold text-pz-secondary">Download</h2>
      {off ? (
        <p className="font-body text-sm text-pz-on-surface-variant">Nobody to download for these choices.</p>
      ) : (
        <div className="space-y-2 font-body text-sm">
          <p className="break-all font-semibold">{preview.fileName}</p>
          <p className="text-pz-on-surface-variant">{`${n(preview.inFile)} ${preview.inFile === 1 ? "person" : "people"}`}</p>
          <p className="text-pz-on-surface-variant">Columns: {preview.columns.join(", ")}</p>
        </div>
      )}
      <LeftOutLines preview={preview} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        {off ? (
          <>
            <button type="button" disabled className={stepPrimary}>Download for Meta</button>
            <button type="button" disabled aria-describedby={noteId} className={stepOutline}>Download plain version</button>
          </>
        ) : (
          <>
            <a href={urls.meta} download className={stepPrimary}>Download for Meta</a>
            <a href={urls.plain} download aria-describedby={noteId} className={stepOutline}>Download plain version</a>
          </>
        )}
      </div>
      <p id={noteId} className="font-body text-xs text-pz-on-surface-variant">
        Plain file: keep it private. It has real emails and phone numbers, so do not share it.
      </p>
      <button type="button" onClick={onBack} className={stepText}>Back</button>
    </section>
  );
}
