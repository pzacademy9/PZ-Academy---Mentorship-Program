"use client";

import Link from "next/link";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { courseNameFromLabel } from "@/lib/crm/product-label";
import type { ContactRow } from "@/lib/data/admin-crm-contacts";

/** One name per course, duplicates removed; falls back to the raw label when it names no course. */
function courseNames(labels: string[]): string[] {
  return Array.from(new Set(labels.map((l) => courseNameFromLabel(l) || l)));
}

const ROW_GRID =
  "grid grid-cols-[2.75rem_minmax(0,1fr)] md:grid-cols-[2.75rem_minmax(0,2fr)_minmax(0,2fr)_9rem] gap-x-3 gap-y-1.5 md:gap-y-0 md:items-center";

export function ContactsList({
  rows, total, page, pageSize, busy, error, selected, filtered = false,
  onToggle, onToggleAllShown, onPage, onRetry,
}: {
  rows: ContactRow[];
  total: number;
  page: number;
  pageSize: number;
  busy: boolean;
  error: string | null;
  selected: Set<string>;
  /** True when a search or filter is active, so an empty list reads as "no match". */
  filtered?: boolean;
  onToggle: (id: string) => void;
  onToggleAllShown: () => void;
  onPage: (page: number) => void;
  onRetry: () => void;
}) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const from = (page - 1) * pageSize + 1;
  const to = (page - 1) * pageSize + rows.length;
  const allShownSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  return (
    <div className="space-y-3">
      {error && (
        <div role="alert" className="flex items-center justify-between flex-wrap gap-2 rounded-2xl bg-pz-surface-container-high px-4 py-3">
          <p className="font-body text-sm text-pz-danger">We could not load this list.</p>
          <Button
            variant="bare"
            size="bare"
            onClick={onRetry}
            className="px-5 py-2 rounded-full bg-pz-primary text-pz-on-primary font-headline text-sm font-semibold max-md:min-h-11"
          >
            Try again
          </Button>
        </div>
      )}

      {rows.length === 0 ? (
        filtered ? (
          <p className="font-body text-sm text-pz-on-surface-variant text-center py-10">No one matches. Try a shorter search.</p>
        ) : (
          <EmptyState
            icon={Users}
            title="No contacts yet"
            description="Use the Import tab to bring in a cohort sheet."
            action={{ label: "Import contacts", href: "/dashboard/admin/sales-hub/import" }}
          />
        )
      ) : (
        <div aria-busy={busy} className={`rounded-2xl border border-pz-outline-variant bg-pz-surface-container-lowest ${busy ? "opacity-60" : ""}`}>
          <label className="flex items-center gap-3 px-4 py-2 border-b border-pz-outline-variant font-body text-xs font-semibold text-pz-on-surface-variant cursor-pointer max-md:min-h-11">
            <input
              type="checkbox"
              checked={allShownSelected}
              onChange={onToggleAllShown}
              className="h-5 w-5 accent-pz-primary"
            />
            <span>Select all shown</span>
          </label>

          <div className={`hidden md:grid md:grid-cols-[2.75rem_minmax(0,2fr)_minmax(0,2fr)_9rem] gap-x-3 px-4 py-2 border-b border-pz-outline-variant font-body text-xs uppercase text-pz-on-surface-variant`}>
            <span />
            <span>Person</span>
            <span>Registered for</span>
            <span>Country</span>
          </div>

          <ul>
            {rows.map((c) => {
              const name = c.fullName || "Name not given";
              const label = c.fullName || c.email || "this person";
              const chips = courseNames(c.productLabels);
              return (
                <li key={c.id} className={`${ROW_GRID} px-4 py-3 border-b last:border-b-0 border-pz-outline-variant`}>
                  <input
                    type="checkbox"
                    checked={selected.has(c.id)}
                    onChange={() => onToggle(c.id)}
                    aria-label={`Select ${label}`}
                    className="h-6 w-6 accent-pz-primary mt-0.5 md:mt-0 md:row-span-1 max-md:row-span-4"
                  />
                  <div className="min-w-0 max-md:col-start-2">
                    <Link
                      href={`/dashboard/admin/sales-hub/contacts/${c.id}`}
                      className="font-headline text-sm font-bold text-pz-secondary hover:underline break-words"
                    >
                      {name}
                    </Link>
                    {c.unsubscribed && (
                      <span className="ml-2 rounded-full bg-pz-surface-container-high px-2 py-0.5 font-body text-xs text-pz-danger">Unsubscribed</span>
                    )}
                    <p className="font-body text-xs text-pz-on-surface-variant break-all">{c.email ?? "No email"}</p>
                    <p className={`font-body text-xs ${c.phoneE164 ? "text-pz-on-surface-variant" : "text-pz-danger"}`}>
                      {c.phoneE164 ?? "Phone needs review"}
                    </p>
                  </div>
                  <div
                    className="flex flex-wrap gap-1.5 min-w-0 max-md:col-start-2"
                    title={c.productLabels.length > 0 ? c.productLabels.join("\n") : undefined}
                  >
                    {chips.length === 0 ? (
                      <span className="font-body text-xs text-pz-on-surface-variant max-md:hidden">—</span>
                    ) : (
                      chips.map((n) => (
                        <span key={n} className="rounded-full bg-pz-surface-container-high px-2.5 py-1 font-body text-xs text-pz-on-surface">{n}</span>
                      ))
                    )}
                  </div>
                  <div className="max-md:col-start-2">
                    {c.country ? (
                      <span className="inline-block rounded-full bg-pz-surface-container-high px-2.5 py-1 font-body text-xs text-pz-on-surface-variant md:bg-transparent md:px-0 md:text-sm">{c.country}</span>
                    ) : (
                      <span className="font-body text-sm text-pz-on-surface-variant max-md:hidden">—</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {rows.length > 0 && (
        <div className="flex items-center justify-between flex-wrap gap-3">
          <p className="font-body text-xs text-pz-on-surface-variant">
            Showing {from.toLocaleString("en-US")} to {to.toLocaleString("en-US")} of {total.toLocaleString("en-US")} people
          </p>
          <div className="flex gap-2 max-md:w-full">
            <Button
              variant="bare"
              size="bare"
              disabled={busy || page <= 1}
              onClick={() => onPage(page - 1)}
              className="px-5 py-2 rounded-full border border-pz-outline-variant font-headline text-sm font-semibold max-md:min-h-11 max-md:flex-1 disabled:opacity-40"
            >
              Previous
            </Button>
            <Button
              variant="bare"
              size="bare"
              disabled={busy || page >= lastPage}
              onClick={() => onPage(page + 1)}
              className="px-5 py-2 rounded-full bg-pz-primary text-pz-on-primary font-headline text-sm font-semibold max-md:min-h-11 max-md:flex-1 disabled:opacity-40"
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
