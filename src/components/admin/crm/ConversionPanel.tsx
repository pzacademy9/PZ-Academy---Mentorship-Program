"use client";

import { useRef, useState } from "react";
import type { ConversionTag } from "@/lib/crm/conversion";

export type ConversionTrackedItem = {
  kind: "whatsapp" | "campaign";
  id: string;
  name: string;
  conversionTag: ConversionTag;
  conversionCourseTitle: string | null;
  conversion: { converted: number; total: number };
};

type ExpandedRow = { id: string; fullName: string; convertedAt: string | null };

/**
 * The only per-recipient drill-down for email conversion — CampaignsPanel
 * has no other recipient-level view (see design doc). WhatsApp rows expand
 * the same way here for consistency, even though their batch detail view
 * (WhatsAppPanel) already has its own Converted column.
 */
export function ConversionPanel({ items }: { items: ConversionTrackedItem[] }) {
  const sorted = [...items].sort((a, b) => {
    const pctA = a.conversion.total > 0 ? a.conversion.converted / a.conversion.total : 0;
    const pctB = b.conversion.total > 0 ? b.conversion.converted / b.conversion.total : 0;
    return pctB - pctA;
  });

  const [openKey, setOpenKey] = useState<string | null>(null);
  const [rows, setRows] = useState<ExpandedRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  // Tracks the currently-open item independent of React's state batching, so a
  // slow fetch for a previously-open item can detect it's stale once the user
  // has since closed it or opened a different item, and skip overwriting `rows`.
  const openKeyRef = useRef<string | null>(null);

  async function toggle(item: ConversionTrackedItem) {
    const key = `${item.kind}:${item.id}`;
    if (openKey === key) {
      setOpenKey(null);
      openKeyRef.current = null;
      setRows(null);
      return;
    }
    setOpenKey(key);
    openKeyRef.current = key;
    setRows(null);
    setLoading(true);
    try {
      if (item.kind === "whatsapp") {
        const res = await fetch(`/api/admin/crm/whatsapp/batches/${item.id}`);
        const json = await res.json();
        const recipients = (json.recipients ?? []) as { id: string; fullName: string; status: string; convertedAt: string | null }[];
        if (openKeyRef.current !== key) return; // a different item was opened while this fetch was in flight
        setRows(
          recipients
            .filter((r) => r.status === "sent")
            .map((r) => ({ id: r.id, fullName: r.fullName, convertedAt: r.convertedAt })),
        );
      } else {
        const res = await fetch(`/api/admin/crm/campaigns/${item.id}/conversions`);
        const json = await res.json();
        const recipients = (json.recipients ?? []) as { contactId: string; fullName: string; convertedAt: string | null }[];
        if (openKeyRef.current !== key) return; // a different item was opened while this fetch was in flight
        setRows(recipients.map((r) => ({ id: r.contactId, fullName: r.fullName, convertedAt: r.convertedAt })));
      }
    } finally {
      if (openKeyRef.current === key) setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <h2 className="font-headline font-bold text-lg">Conversion</h2>
        <p className="font-body text-xs text-pz-on-surface-variant mt-1 max-w-2xl">
          A recipient counts as converted if they bought the tagged course within 30 days of being sent this
          batch or campaign. Everyone else is &quot;Not converted (yet)&quot; — an absence, not a claim that
          they lost interest.
        </p>
      </div>
      {sorted.length === 0 ? (
        <p className="font-body text-sm text-pz-on-surface-variant py-8 text-center">
          No tracked batches or campaigns yet. Tag one with a course when you create it.
        </p>
      ) : (
        <div className="space-y-2">
          {sorted.map((item) => {
            const key = `${item.kind}:${item.id}`;
            const pct = item.conversion.total > 0 ? Math.round((item.conversion.converted / item.conversion.total) * 100) : 0;
            const courseLabel =
              item.conversionTag.kind === "course"
                ? item.conversionCourseTitle ?? "—"
                : item.conversionTag.kind === "label"
                  ? `"${item.conversionTag.pattern}"`
                  : "";
            return (
              <div key={key} className="bg-pz-surface-container-high rounded-2xl p-4">
                <button onClick={() => toggle(item)} className="w-full flex items-center justify-between text-left gap-3">
                  <span className="font-body font-semibold text-sm flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded-full bg-pz-surface-variant text-pz-on-surface-variant text-[10px] font-bold uppercase shrink-0">
                      {item.kind === "whatsapp" ? "WhatsApp" : "Email"}
                    </span>
                    {item.name}
                    <span className="font-normal text-pz-on-surface-variant text-xs">{courseLabel}</span>
                  </span>
                  <span className="font-body text-xs text-pz-on-surface-variant tabular-nums shrink-0">
                    {pct}% converted ({item.conversion.converted}/{item.conversion.total})
                  </span>
                </button>
                {openKey === key && (
                  <div className="mt-3 overflow-x-auto">
                    {loading ? (
                      <p className="font-body text-xs text-pz-on-surface-variant">Loading…</p>
                    ) : (
                      <table className="w-full text-left font-body text-sm">
                        <thead className="text-pz-on-surface-variant text-xs uppercase">
                          <tr><th className="py-1">Name</th><th>Converted</th></tr>
                        </thead>
                        <tbody>
                          {(rows ?? []).map((r) => (
                            <tr key={r.id} className="border-t border-pz-outline-variant">
                              <td className="py-1">{r.fullName || "—"}</td>
                              <td>{r.convertedAt ? new Date(r.convertedAt).toLocaleDateString() : "Not converted (yet)"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
