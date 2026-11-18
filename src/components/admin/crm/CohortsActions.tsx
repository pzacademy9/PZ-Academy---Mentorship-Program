"use client";

import { Button } from "@/components/ui/button";
import { cohortExportUrl, cohortPlainUrl } from "@/lib/crm/cohort-export-url";
import type { CohortRow } from "@/lib/data/admin-crm-import";

const MAX_SELECTED = 20;

// Step 3 of the Cohorts page. Below xl it is a bar stuck above the bottom nav
// (capped so it can never cover the page); from xl it is a card beside the list.
export function CohortsActions({
  cohorts,
  atLimit,
  hiddenTicks,
}: {
  cohorts: CohortRow[]; // the visible ticked ones
  atLimit: boolean;
  hiddenTicks: number;
}) {
  const ids = cohorts.map((c) => c.id);
  const people = cohorts.reduce((sum, c) => sum + c.contactCount, 0);
  const has = cohorts.length > 0;

  return (
    <section
      data-testid="cohorts-actions"
      aria-labelledby="cohorts-actions-heading"
      className="z-30 space-y-2 rounded-2xl border border-pz-outline-variant bg-pz-surface-container-lowest p-3 max-xl:sticky max-xl:bottom-[calc(4.5rem+env(safe-area-inset-bottom))] max-xl:max-h-[50dvh] max-xl:overflow-y-auto lg:bottom-4 xl:sticky xl:bottom-auto xl:top-20 xl:p-4"
    >
      <h2 id="cohorts-actions-heading" className="font-headline text-lg text-pz-on-surface">
        3. What do you want to do?
      </h2>
      {has ? (
        <>
          <p className="font-body text-sm text-pz-on-surface">
            <span className="font-medium">
              {cohorts.length} {cohorts.length === 1 ? "cohort" : "cohorts"} selected
            </span>
            <span aria-hidden="true"> · </span>
            <span className="text-pz-on-surface-variant">Up to {people} {people === 1 ? "person" : "people"}</span>
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap xl:flex-col">
            <Button asChild className="min-h-11 whitespace-normal">
              <a href={cohortExportUrl(ids)} download>Download for Meta</a>
            </Button>
            <Button asChild variant="outline" className="min-h-11 whitespace-normal">
              <a href={cohortPlainUrl(ids)} download>Download plain version</a>
            </Button>
          </div>
          <p className="font-body text-xs text-pz-on-surface-variant">
            Upload the downloaded file in Meta Ads Manager: Audiences, Create audience, Custom audience, Customer list.
          </p>
          <p className="font-body text-xs text-pz-on-surface-variant">
            The plain file has real emails and phone numbers. Meta scrambles it for you when you upload. Keep it private and delete it after uploading.
          </p>
        </>
      ) : (
        <p className="font-body text-sm text-pz-on-surface-variant">
          {hiddenTicks > 0 ? `${hiddenTicks} ticked, hidden by your search` : "Tick cohorts to download them"}
        </p>
      )}
      {atLimit ? (
        <p className="font-body text-xs text-pz-on-surface-variant">
          You can pick at most {MAX_SELECTED} cohorts at a time{hiddenTicks > 0 ? ", including ones hidden by your search" : ""}.
        </p>
      ) : (
        !has && <p className="font-body text-xs text-pz-on-surface-variant">You can pick up to {MAX_SELECTED} at a time.</p>
      )}
    </section>
  );
}
