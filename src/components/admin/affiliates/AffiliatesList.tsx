"use client";

import { useMemo, useState } from "react";
import { Mail, MessageCircle, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { AffiliateRow } from "@/lib/data/affiliates";
import { searchAffiliates } from "@/lib/affiliates/message-templates";
import { AffiliateMessagePicker, type AffiliateTemplates } from "./AffiliateMessagePicker";

const STATUS_LABEL: Record<AffiliateRow["status"], string> = { applied: "Applied", accepted: "Active", dropped: "Dropped", left: "Left" };

/** Same columns for the header row and every person row on a computer. */
const COLS = "md:grid md:grid-cols-[minmax(0,1.6fr)_minmax(0,1.6fr)_7rem_6rem_7rem] md:items-center md:gap-4";

function when(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
}

function initials(name: string): string {
  const parts = name.replace(/^dr\.?\s+/i, "").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

/**
 * Affiliates tab: search, then one card per person on a phone (a table-like row on a computer),
 * with WhatsApp and Email buttons that open the message picker. Tapping the card body opens the detail.
 */
export function AffiliatesList({
  rows,
  templates,
  onOpen,
  templatesFailed = false,
  emailFailedIds = [],
}: {
  rows: AffiliateRow[];
  templates: AffiliateTemplates | null;
  onOpen: (id: string) => void;
  templatesFailed?: boolean;
  emailFailedIds?: string[];
}) {
  const [q, setQ] = useState("");
  const [picker, setPicker] = useState<{ channel: "whatsapp" | "email"; id: string } | null>(null);

  const shown = useMemo(() => searchAffiliates(rows, q), [rows, q]);
  const pickerRow = picker ? rows.find((r) => r.id === picker.id) ?? null : null;
  const loaded = templatesFailed ? null : templates;

  return (
    <div className="min-w-0 space-y-3">
      <div className="space-y-2">
        <div className="relative w-full md:max-w-sm">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-pz-on-surface-variant" aria-hidden="true" />
          <input
            type="search"
            aria-label="Search affiliates"
            placeholder="Search name, code or email"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full min-w-0 rounded-xl border border-pz-outline-variant bg-pz-surface-container-lowest py-2.5 pl-10 pr-10 font-body text-sm max-md:min-h-11 max-md:text-base focus:outline-none focus:ring-2 focus:ring-pz-primary/20"
          />
          {q ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQ("")}
              className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-pz-on-surface-variant max-md:h-11 max-md:w-11"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <p role="status" className="px-1 font-body text-xs text-pz-on-surface-variant">
          Showing {shown.length} {shown.length === 1 ? "affiliate" : "affiliates"}
        </p>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No one matches your search"
          description="Check the spelling of the name, code or email address, or clear your search."
          action={{ label: "Reset search", onClick: () => setQ("") }}
        />
      ) : (
        <div className="min-w-0 md:overflow-hidden md:rounded-xl md:border md:border-pz-outline-variant md:bg-pz-surface-container-lowest">
          <div aria-hidden="true" className="hidden border-b border-pz-outline-variant bg-pz-surface-container-low px-6 py-3 font-headline text-xs font-semibold text-pz-on-surface-variant md:flex md:gap-4">
            <div className={`min-w-0 flex-1 ${COLS}`}>
              <span>Name</span>
              <span>Email</span>
              <span>Code</span>
              <span>Status</span>
              <span>Accepted</span>
            </div>
            <span className="w-[15.5rem] shrink-0 text-right">Actions</span>
          </div>
          <ul data-testid="affiliate-cards" className="w-full min-w-0 space-y-3 md:space-y-0 md:divide-y md:divide-pz-outline-variant">
            {shown.map((r) => (
              <li key={r.id} className="min-w-0">
                <div className="min-w-0 rounded-2xl border border-pz-outline-variant bg-pz-surface-container-lowest p-4 md:flex md:items-center md:gap-4 md:rounded-none md:border-0 md:px-6 md:py-3">
                  <button
                    type="button"
                    onClick={() => onOpen(r.id)}
                    className={`flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 text-left md:flex-1 ${COLS}`}
                  >
                    <span className="flex w-full min-w-0 items-center gap-3 md:w-auto">
                      <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-pz-surface-container-high font-headline text-sm font-bold text-pz-deep md:h-9 md:w-9 md:rounded-full md:text-xs">
                        {initials(r.name)}
                      </span>
                      <span className="min-w-0">
                        <span className="block break-words font-headline text-[15px] font-bold leading-snug text-pz-secondary md:text-sm">{r.name}</span>
                        {r.team ? <span className="block break-words font-body text-xs text-pz-on-surface-variant">Team {r.team}</span> : null}
                      </span>
                    </span>
                    <span className="w-full min-w-0 break-words font-body text-xs text-pz-on-surface-variant md:w-auto md:text-sm">{r.email}</span>
                    <span className="font-mono text-xs font-bold text-pz-on-surface">{r.code ?? ""}</span>
                    <span className="inline-flex flex-wrap items-center gap-x-2 font-body text-xs text-pz-on-surface-variant">
                      <span className="rounded-full bg-pz-surface-container-high px-2 py-0.5 font-medium">{STATUS_LABEL[r.status]}</span>
                      {emailFailedIds.includes(r.id) ? <span className="font-bold text-pz-danger">Email failed</span> : null}
                    </span>
                    <span className="font-body text-xs text-pz-on-surface-variant">{when(r.acceptedAt ?? r.createdAt)}</span>
                  </button>
                  <div className="mt-3.5 grid grid-cols-2 gap-2.5 border-t border-pz-outline-variant pt-3.5 md:mt-0 md:flex md:w-[15.5rem] md:shrink-0 md:justify-end md:border-0 md:pt-0">
                    <Button type="button" variant="outline" size="sm" onClick={() => setPicker({ channel: "whatsapp", id: r.id })} className="rounded-full">
                      <MessageCircle aria-hidden="true" />
                      WhatsApp
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => setPicker({ channel: "email", id: r.id })} className="rounded-full">
                      <Mail aria-hidden="true" />
                      Email
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {picker && pickerRow ? (
        <AffiliateMessagePicker key={`${picker.channel}-${picker.id}`} channel={picker.channel} row={pickerRow} templates={loaded} onClose={() => setPicker(null)} />
      ) : null}
    </div>
  );
}
