"use client";

import Link from "next/link";
import type { ConversionTag } from "@/lib/crm/conversion";

export type ConversionTrackedItem = {
  kind: "whatsapp" | "campaign";
  id: string;
  name: string;
  conversionTag: ConversionTag;
  conversionCourseTitle: string | null;
  conversion: { converted: number; total: number };
};

export function ConversionPanel({ items }: { items: ConversionTrackedItem[] }) {
  const sorted = [...items].sort((a, b) => {
    const pctA = a.conversion.total > 0 ? a.conversion.converted / a.conversion.total : 0;
    const pctB = b.conversion.total > 0 ? b.conversion.converted / b.conversion.total : 0;
    return pctB - pctA;
  });

  return (
    <div className="space-y-3">
      <div>
        <h2 className="font-headline font-bold text-lg">Conversion</h2>
        <p className="font-body text-xs text-pz-on-surface-variant mt-1 max-w-2xl">
          A recipient counts as converted if they bought the tagged course within 30 days of being sent this
          batch or campaign. Everyone else is &quot;Not converted (yet)&quot; — an absence, not a claim that
          they lost interest. Click through to a batch or campaign for the full recipient list.
        </p>
      </div>
      {sorted.length === 0 ? (
        <p className="font-body text-sm text-pz-on-surface-variant py-8 text-center">
          No tracked batches or campaigns yet. Tag one with a course when you create it.
        </p>
      ) : (
        <div className="space-y-2">
          {sorted.map((item) => {
            const pct = item.conversion.total > 0 ? Math.round((item.conversion.converted / item.conversion.total) * 100) : 0;
            const courseLabel =
              item.conversionTag.kind === "course"
                ? item.conversionCourseTitle ?? "—"
                : item.conversionTag.kind === "label"
                  ? `"${item.conversionTag.pattern}"`
                  : "";
            const href = item.kind === "whatsapp" ? `/dashboard/admin/sales-hub/whatsapp/${item.id}` : `/dashboard/admin/sales-hub/campaigns/${item.id}`;
            return (
              <Link key={`${item.kind}:${item.id}`} href={href} className="block bg-pz-surface-container-high rounded-2xl p-4 hover:bg-pz-surface-container-highest transition-colors">
                <div className="w-full flex items-center justify-between text-left gap-3">
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
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
