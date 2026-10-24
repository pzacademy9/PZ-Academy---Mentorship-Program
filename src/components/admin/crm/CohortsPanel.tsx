"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Layers, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { ResponsiveList } from "@/components/ui/responsive-list";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { formatDate } from "@/lib/format";

type Cohort = {
  id: string;
  sheetName: string;
  tabName: string;
  rowsImported: number;
  createdAt: string;
  courseId: string | null;
  courseTitle: string | null;
  purchaseCount: number;
  kind: "imported" | "closed_paid" | "closed_interested";
  contactCount: number;
};

const MAX_SELECTED = 20;
const exportHref = (ids: string[]) => `/api/admin/crm/cohorts/export?ids=${ids.join(",")}`;
const KIND_BADGE: Record<Cohort["kind"], string | null> = {
  imported: null,
  closed_paid: "Closed batch: paid",
  closed_interested: "Interested, not paid",
};

function KindBadge({ kind }: { kind: Cohort["kind"] }) {
  const text = KIND_BADGE[kind];
  if (!text) return null;
  return (
    <span className="ml-2 px-1.5 py-0.5 rounded-full bg-pz-primary-container text-pz-on-primary-container text-[10px] font-bold uppercase">
      {text}
    </span>
  );
}

function peopleText(c: Cohort) {
  return `${c.contactCount} ${c.contactCount === 1 ? "person" : "people"}`;
}
const showImportedNote = (c: Cohort) => c.kind !== "closed_interested" && c.contactCount !== c.rowsImported;

export function CohortsPanel({ initialCohorts }: { initialCohorts: Cohort[] }) {
  const router = useRouter();
  const [cohorts, setCohorts] = useState(initialCohorts);
  const confirm = useConfirm();
  const [search, setSearch] = useState("");
  const [ticked, setTicked] = useState<string[]>([]);
  const checkLabel = (c: Cohort) => `Select ${c.sheetName}, ${c.tabName}`;
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
      {cohorts.length > 0 && (
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by sheet or tab name…"
          className="rounded-xl border border-pz-outline-variant px-3 py-1.5 font-body text-sm w-64 max-md:w-full max-md:min-h-11 max-md:text-base"
        />
      )}
      {cohorts.length > 0 && (
        <div data-testid="meta-toolbar" className="space-y-1">
          {selected.length === 0 ? (
            <Button variant="outline" size="sm" disabled>Download selected for Meta (0)</Button>
          ) : (
            <Button asChild variant="outline" size="sm">
              <a href={exportHref(selected)} download>Download selected for Meta ({selected.length})</a>
            </Button>
          )}
          <p className="font-body text-xs text-pz-on-surface-variant">
            Upload the downloaded file in Meta Ads Manager: Audiences, Create audience, Custom audience, Customer list.
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
          action={{ label: "Import contacts", href: "/dashboard/admin/sales-hub/import" }}
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon={SearchX} title="No cohorts match" description={`Nothing matches "${search}".`} />
      ) : (
        <ResponsiveList
          rows={filtered}
          getKey={(c) => c.id}
          selection={{ isSelected: (c) => selected.includes(c.id), onToggle: (c) => toggle(c.id), label: checkLabel }}
          mobile={{
            title: (c) => (
              <>
                <Link href={`/dashboard/admin/sales-hub/cohorts/${c.id}`} className="inline-flex min-h-11 items-center underline">
                  {c.sheetName}
                </Link>
                <KindBadge kind={c.kind} />
              </>
            ),
            meta: (c) => [
              c.tabName,
              <span key="course" className={c.courseTitle ? "" : "text-pz-danger"}>{c.courseTitle ?? "untagged"}</span>,
              `${peopleText(c)}${showImportedNote(c) ? ` (of ${c.rowsImported} imported)` : ""} · ${formatDate(c.createdAt)}`,
              <a key="download" href={exportHref([c.id])} download className="inline-flex min-h-11 items-center underline">
                Download for Meta
              </a>,
              <Button
                key="delete"
                variant="bare"
                size="bare"
                loading={busyId === c.id}
                disabled={removing}
                onClick={() => remove(c)}
                className="min-h-11 min-w-11 text-pz-danger font-body text-sm"
              >
                {busyId === c.id ? "Deleting…" : "delete"}
              </Button>,
            ],
          }}
          table={
            <div className="overflow-x-auto">
              <table className="w-full text-left font-body text-sm">
                <thead className="text-pz-on-surface-variant text-xs uppercase">
                  <tr>
                    <th className="py-2"><span className="sr-only">Select</span></th>
                    <th>Sheet</th>
                    <th>Tab</th>
                    <th>Course</th>
                    <th>People</th>
                    <th>Imported</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr key={c.id} className="border-t border-pz-outline-variant">
                      <td className="py-2">
                        <input
                          type="checkbox"
                          aria-label={checkLabel(c)}
                          checked={selected.includes(c.id)}
                          disabled={atLimit && !selected.includes(c.id)}
                          onChange={() => toggle(c.id)}
                        />
                      </td>
                      <td>
                        <Link href={`/dashboard/admin/sales-hub/cohorts/${c.id}`} className="underline">
                          {c.sheetName}
                        </Link>
                        <KindBadge kind={c.kind} />
                      </td>
                      <td>{c.tabName}</td>
                      <td className={c.courseTitle ? "" : "text-pz-danger"}>{c.courseTitle ?? "untagged"}</td>
                      <td className="tabular-nums">
                        <span>{peopleText(c)}</span>
                        {showImportedNote(c) && (
                          <span className="text-pz-on-surface-variant"> (of {c.rowsImported} imported)</span>
                        )}
                      </td>
                      <td>{formatDate(c.createdAt)}</td>
                      <td>
                        <a href={exportHref([c.id])} download className="mr-3 underline">Download for Meta</a>
                        <Button
                          variant="bare"
                          size="bare"
                          loading={busyId === c.id}
                          disabled={removing}
                          onClick={() => remove(c)}
                          className="text-pz-danger font-body text-sm"
                        >
                          {busyId === c.id ? "Deleting…" : "delete"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          }
        />
      )}
    </div>
  );
}
