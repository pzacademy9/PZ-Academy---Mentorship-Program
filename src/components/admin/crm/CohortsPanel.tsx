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
};

export function CohortsPanel({ initialCohorts }: { initialCohorts: Cohort[] }) {
  const router = useRouter();
  const [cohorts, setCohorts] = useState(initialCohorts);
  const confirm = useConfirm();
  const [search, setSearch] = useState("");
  const filtered =
    search.trim() === ""
      ? cohorts
      : cohorts.filter((c) => {
          const q = search.trim().toLowerCase();
          return c.sheetName.toLowerCase().includes(q) || c.tabName.toLowerCase().includes(q);
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
          mobile={{
            title: (c) => (
              <Link href={`/dashboard/admin/sales-hub/cohorts/${c.id}`} className="inline-flex min-h-11 items-center underline">
                {c.sheetName}
              </Link>
            ),
            meta: (c) => [
              c.tabName,
              <span key="course" className={c.courseTitle ? "" : "text-pz-danger"}>{c.courseTitle ?? "untagged"}</span>,
              `${c.purchaseCount} purchase${c.purchaseCount === 1 ? "" : "s"}${c.purchaseCount !== c.rowsImported ? ` (of ${c.rowsImported} imported)` : ""} · ${formatDate(c.createdAt)}`,
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
                    <th className="py-2">Sheet</th>
                    <th>Tab</th>
                    <th>Course</th>
                    <th>Purchases</th>
                    <th>Imported</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr key={c.id} className="border-t border-pz-outline-variant">
                      <td className="py-2">
                        <Link href={`/dashboard/admin/sales-hub/cohorts/${c.id}`} className="underline">
                          {c.sheetName}
                        </Link>
                      </td>
                      <td>{c.tabName}</td>
                      <td className={c.courseTitle ? "" : "text-pz-danger"}>{c.courseTitle ?? "untagged"}</td>
                      <td className="tabular-nums">
                        {c.purchaseCount}
                        {c.purchaseCount !== c.rowsImported && (
                          <span className="text-pz-on-surface-variant"> (of {c.rowsImported} imported)</span>
                        )}
                      </td>
                      <td>{formatDate(c.createdAt)}</td>
                      <td>
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
