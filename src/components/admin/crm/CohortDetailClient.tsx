"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Users } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { ResponsiveList } from "@/components/ui/responsive-list";
import { formatDate } from "@/lib/format";
import type { CohortDetail } from "@/lib/data/admin-crm-import";

export function CohortDetailClient({ cohort }: { cohort: CohortDetail }) {
  const [search, setSearch] = useState("");
  const filtered =
    search.trim() === ""
      ? cohort.contacts
      : cohort.contacts.filter((c) => c.fullName.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/admin/crm?tab=cohorts"
          className="inline-flex items-center gap-2 font-body text-sm text-pz-on-surface-variant hover:text-pz-primary transition-colors max-md:min-h-11"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Cohorts
        </Link>
        <h1 className="font-headline font-bold text-2xl text-pz-secondary mt-3">
          {cohort.sheetName} — {cohort.tabName}
        </h1>
        <p className="font-body text-sm text-pz-on-surface-variant mt-1">
          {cohort.courseTitle ? <span>{cohort.courseTitle}</span> : <span className="text-pz-danger">untagged</span>}
          {" · "}Imported {formatDate(cohort.createdAt)} · {cohort.purchaseCount} of {cohort.rowsImported} rows still attached
        </p>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-headline font-bold text-lg">Contacts</h2>
        {cohort.contacts.length > 0 && (
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search contacts…"
            className="rounded-xl border border-pz-outline-variant px-3 py-1.5 font-body text-sm w-64 max-md:w-full max-md:min-h-11 max-md:text-base"
          />
        )}
      </div>
      <ResponsiveList
        rows={filtered}
        getKey={(c) => `${c.contactId}-${c.productLabel}`}
        empty={
          <EmptyState
            icon={Users}
            title={search ? "No contacts match" : "No contacts in this cohort"}
            description={search ? `Nothing matches "${search}".` : undefined}
          />
        }
        mobile={{
          title: (c) => c.fullName || "—",
          meta: (c) => [c.email, c.phoneE164, c.productLabel].filter(Boolean),
          href: (c) => `/dashboard/admin/crm/contacts/${c.contactId}`,
        }}
        table={
            <table className="w-full text-left font-body text-sm">
              <thead className="text-pz-on-surface-variant text-xs uppercase">
                <tr><th className="py-1">Name</th><th>Email</th><th>Phone</th><th>Product</th></tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={`${c.contactId}-${c.productLabel}`} className="border-t border-pz-outline-variant">
                    <td className="py-1">
                      <Link href={`/dashboard/admin/crm/contacts/${c.contactId}`} className="underline">
                        {c.fullName || "—"}
                      </Link>
                    </td>
                    <td>{c.email ?? "—"}</td>
                    <td>{c.phoneE164 ?? "—"}</td>
                    <td>{c.productLabel || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
        }
      />
    </div>
  );
}
