"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Users } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { ResponsiveList } from "@/components/ui/responsive-list";
import type { CampaignRow, CampaignConversionDetail } from "@/lib/data/admin-crm-campaigns";

export function CampaignDetailClient({
  campaign,
  conversionDetail,
  manualConvertedContactIds,
}: {
  campaign: CampaignRow;
  conversionDetail: CampaignConversionDetail;
  manualConvertedContactIds: string[];
}) {
  const manualSet = new Set(manualConvertedContactIds);
  const [recipientSearch, setRecipientSearch] = useState("");
  const recipients = conversionDetail?.recipients ?? [];
  const filteredRecipients =
    recipientSearch.trim() === ""
      ? recipients
      : recipients.filter((r) => r.fullName.toLowerCase().includes(recipientSearch.trim().toLowerCase()));

  const stats: { label: string; value: number | string }[] = [
    { label: "Recipients", value: campaign.recipients },
    { label: "Sent", value: campaign.sent },
    { label: "Delivered", value: campaign.delivered },
    { label: "Opened", value: campaign.opened },
    { label: "Clicked", value: campaign.clicked },
    { label: "Bounced", value: campaign.bounced },
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/admin/sales-hub/campaigns"
          className="inline-flex items-center gap-2 font-body text-sm text-pz-on-surface-variant hover:text-pz-primary transition-colors max-md:min-h-11"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Campaigns
        </Link>
        <div className="flex flex-wrap items-center gap-3 mt-3">
          <h1 className="font-headline font-bold text-2xl text-pz-secondary">{campaign.name}</h1>
          <span className="font-body text-xs text-pz-on-surface-variant">{campaign.status}</span>
        </div>
        <p className="font-body text-sm text-pz-on-surface-variant mt-1">{campaign.subject}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-6 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-pz-surface-container-lowest p-4 rounded-lg border border-pz-outline-variant">
            <p className="text-[10px] font-bold uppercase tracking-widest text-pz-on-surface-variant">{s.label}</p>
            <p className="font-headline text-xl font-bold mt-1 tabular-nums">{s.value}</p>
          </div>
        ))}
      </div>

      <div>
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <h2 className="font-headline font-bold text-lg">
            Conversion{" "}
            {conversionDetail && (
              <span className="font-body text-sm font-normal text-pz-on-surface-variant">
                {conversionDetail.total > 0 ? Math.round((conversionDetail.converted / conversionDetail.total) * 100) : 0}%
                ({conversionDetail.converted}/{conversionDetail.total})
              </span>
            )}
          </h2>
          {recipients.length > 0 && (
            <input
              value={recipientSearch}
              onChange={(e) => setRecipientSearch(e.target.value)}
              placeholder="Search recipients…"
              className="rounded-xl border border-pz-outline-variant px-3 py-1.5 font-body text-sm w-64 max-md:w-full max-md:min-h-11 max-md:text-base"
            />
          )}
        </div>
        {!conversionDetail ? (
          <p className="font-body text-sm text-pz-on-surface-variant py-4">This campaign isn&apos;t tagged with a conversion program.</p>
        ) : (
          <ResponsiveList
            rows={filteredRecipients}
            getKey={(r) => r.contactId}
            empty={
              <EmptyState
                icon={Users}
                title={recipientSearch ? "No recipients match" : "No recipients yet"}
                description={recipientSearch ? `Nothing matches "${recipientSearch}".` : undefined}
              />
            }
            mobile={{
              title: (r) => (
                <Link href={`/dashboard/admin/sales-hub/contacts/${r.contactId}`} className="inline-flex min-h-11 items-center underline">
                  {r.fullName || "—"}
                </Link>
              ),
              meta: (r) => [
                manualSet.has(r.contactId) ? "Manually converted" : null,
                r.convertedAt ? `Converted ${new Date(r.convertedAt).toLocaleDateString()}` : "Not converted (yet)",
              ].filter(Boolean),
            }}
            table={
              <table className="w-full text-left font-body text-sm">
                <thead className="text-pz-on-surface-variant text-xs uppercase">
                  <tr><th className="py-1">Name</th><th>Converted</th></tr>
                </thead>
                <tbody>
                  {filteredRecipients.map((r) => (
                    <tr key={r.contactId} className="border-t border-pz-outline-variant">
                      <td className="py-1">
                        <Link href={`/dashboard/admin/sales-hub/contacts/${r.contactId}`} className="underline">
                          {r.fullName || "—"}
                        </Link>
                        {manualSet.has(r.contactId) && (
                          <span className="ml-2 px-1.5 py-0.5 rounded-full bg-pz-primary-container text-pz-on-primary-container text-[10px] font-bold uppercase">
                            manually converted
                          </span>
                        )}
                      </td>
                      <td>{r.convertedAt ? new Date(r.convertedAt).toLocaleDateString() : "Not converted (yet)"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            }
          />
        )}
      </div>
    </div>
  );
}
