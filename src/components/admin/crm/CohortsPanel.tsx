"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Layers, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { cohortExportUrl, cohortPlainUrl } from "@/lib/crm/cohort-export-url";
import type { CohortRow } from "@/lib/data/admin-crm-import";
import { CohortsList } from "./CohortsList";

type Cohort = CohortRow;

const MAX_SELECTED = 20;

export function CohortsPanel({ initialCohorts }: { initialCohorts: Cohort[] }) {
  const router = useRouter();
  const [cohorts, setCohorts] = useState(initialCohorts);
  const confirm = useConfirm();
  const [search, setSearch] = useState("");
  const [ticked, setTicked] = useState<string[]>([]);
  const filtered =
    search.trim() === ""
      ? cohorts
      : cohorts.filter((c) => {
          const q = search.trim().toLowerCase();
          return c.sheetName.toLowerCase().includes(q) || c.tabName.toLowerCase().includes(q);
        });

  // Deleted cohorts drop out of the ticks; search-hidden ones are kept but not downloaded.
  // The cap counts every live tick (hidden too) so the download can never exceed 20.
  const allIds = new Set(cohorts.map((c) => c.id));
  const visibleIds = new Set(filtered.map((c) => c.id));
  const liveCount = ticked.filter((id) => allIds.has(id)).length;
  const selected = ticked.filter((id) => visibleIds.has(id));
  const atLimit = liveCount >= MAX_SELECTED;
  const toggle = (id: string) =>
    setTicked((prev) => {
      const live = prev.filter((x) => allIds.has(x));
      if (live.includes(id)) return prev.filter((x) => x !== id);
      return live.length >= MAX_SELECTED ? prev : [...prev, id];
    });

  const { run: remove, pending: removing, pendingKey: busyId } = useAsyncAction(async (c: Cohort) => {
    const warning = c.purchaseCount > 0
      ? `"${c.sheetName} — ${c.tabName}": ${c.purchaseCount} purchase${c.purchaseCount === 1 ? "" : "s"} will lose this cohort tag; the contacts and purchases themselves stay.`
      : `"${c.sheetName} — ${c.tabName}" has no purchases attached (safe to remove).`;
    if (!(await confirm({ title: "Delete cohort?", description: warning, confirmLabel: "Delete", destructive: true }))) return;

    try {
      const res = await fetch(`/api/admin/crm/cohorts/${c.id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Could not delete this cohort.");
      }
      setCohorts((prev) => prev.filter((x) => x.id !== c.id));
      router.refresh();
      toast.success("Cohort deleted.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete this cohort.");
    }
  }, { getKey: (c) => c.id });

  return (
    <div className="space-y-3">
      <p className="font-body text-sm text-pz-on-surface-variant">
        Need a list made by a question, like recorded buyers in UAE?{" "}
        <Link href="/dashboard/admin/sales-hub/audiences" className="inline-flex min-h-11 items-center underline">Use Audiences</Link>.
      </p>
      <h2 className="font-headline text-lg text-pz-on-surface">1. Find a cohort</h2>
      {cohorts.length > 0 && (
        <input
          type="search"
          aria-label="Search by sheet or tab name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by sheet or tab name…"
          className="w-64 rounded-xl border border-pz-outline-variant bg-pz-surface-container-lowest px-3 py-1.5 font-body text-sm max-md:min-h-11 max-md:w-full max-md:text-base"
        />
      )}
      <h2 className="pt-2 font-headline text-lg text-pz-on-surface">2. Pick cohorts</h2>
      {cohorts.length > 0 && (
        <div data-testid="meta-toolbar" className="space-y-1">
          {selected.length === 0 ? (
            <Button variant="outline" size="sm" disabled>Download selected for Meta (0)</Button>
          ) : (
            <Button asChild variant="outline" size="sm">
              <a href={cohortExportUrl(selected)} download>Download selected for Meta ({selected.length})</a>
            </Button>
          )}
          {selected.length === 0 ? (
            <Button variant="outline" size="sm" disabled className="ml-2">Download selected, plain (0)</Button>
          ) : (
            <Button asChild variant="outline" size="sm" className="ml-2">
              <a href={cohortPlainUrl(selected)} download>Download selected, plain ({selected.length})</a>
            </Button>
          )}
          <p className="font-body text-xs text-pz-on-surface-variant">
            Upload the downloaded file in Meta Ads Manager: Audiences, Create audience, Custom audience, Customer list.
          </p>
          <p className="font-body text-xs text-pz-on-surface-variant">
            The plain file has real emails and phone numbers. Meta scrambles it for you when you upload. Keep it private and delete it after uploading.
          </p>
          {atLimit && (
            <p className="font-body text-xs text-pz-on-surface-variant">You can pick at most 20 cohorts at a time{liveCount > selected.length ? ", including ones hidden by your search" : ""}.</p>
          )}
        </div>
      )}
      {cohorts.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No cohorts imported yet"
          description="Each imported sheet tab becomes a cohort."
          action={{ label: "Import a sheet", href: "/dashboard/admin/sales-hub/import" }}
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon={SearchX} title="No cohorts match" description={`Nothing matches "${search}".`} />
      ) : (
        <CohortsList
          cohorts={filtered}
          selected={selected}
          atLimit={atLimit}
          busyId={busyId}
          removing={removing}
          onToggle={toggle}
          onDelete={remove}
        />
      )}
    </div>
  );
}
