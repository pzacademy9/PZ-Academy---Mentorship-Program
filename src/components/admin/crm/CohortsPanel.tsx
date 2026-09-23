"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
  const [busyId, setBusyId] = useState<string | null>(null);

  async function remove(c: Cohort) {
    const warning = c.purchaseCount > 0
      ? `Delete "${c.sheetName} — ${c.tabName}"? ${c.purchaseCount} purchase${c.purchaseCount === 1 ? "" : "s"} will lose this cohort tag; the contacts and purchases themselves stay.`
      : `Delete "${c.sheetName} — ${c.tabName}"? This batch has no purchases attached (safe to remove).`;
    if (!window.confirm(warning)) return;

    setBusyId(c.id);
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
    } finally {
      setBusyId(null);
    }
  }

  if (cohorts.length === 0) {
    return <p className="font-body text-sm text-pz-on-surface-variant py-8 text-center">No cohorts imported yet.</p>;
  }

  return (
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
          {cohorts.map((c) => (
            <tr key={c.id} className="border-t border-pz-outline-variant">
              <td className="py-2">{c.sheetName}</td>
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
                <button
                  onClick={() => remove(c)}
                  disabled={busyId === c.id}
                  className="text-pz-danger font-body text-sm disabled:opacity-50"
                >
                  {busyId === c.id ? "Deleting…" : "delete"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
