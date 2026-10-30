"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, CheckSquare, Copy, Download } from "lucide-react";
import type { RegistrationStatus } from "@/lib/landing/registration/config";
import type { RegistrationListFilters, RegistrationListRow } from "@/lib/data/landing-registration-admin";
import { RegistrationFilters } from "./RegistrationFilters";
import { RegistrationsTable } from "./RegistrationsTable";
import type { RegistrationQuery } from "./query";
import { MessageBuilder } from "./MessageBuilder";
import { RowActions } from "./RowActions";
import { getSelectionIdList } from "@/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/id-actions";

/** Either the ticked rows on this page, or everyone matching the current filters. Never both. */
export type CampaignSelection =
  | { mode: "ids"; ids: string[] }
  | { mode: "filter"; filters: RegistrationListFilters };

export type BuilderChannel = "email" | "whatsapp";

/** What the email and WhatsApp builders (Tasks 10 and 11) receive. */
export interface CampaignBuilderRequest {
  pageId: string;
  pageTitle: string;
  selection: CampaignSelection;
  count: number;
  /** A ready-made subject and message the builder starts with (still editable). */
  starter?: { subject: string; body: string };
}

/** The "Email their IDs" starting message. No link: there is no page for it yet. */
export const ID_EMAIL_STARTER = {
  subject: "Your PZ ID",
  body: "Hello {{first_name}},\n\nYour PZ ID is {{pz_id}}.\n\nPlease keep it. You will use it to mark your attendance and to see your quiz results.\n\nPZ Academy",
};

export type OpenBuilder = (channel: BuilderChannel, request: CampaignBuilderRequest) => void;

export interface CampaignRegistrationsProps {
  pageId: string;
  pageTitle: string;
  /** The public URL slug of this batch, for the public ID page link. */
  publicSlug?: string | null;
  rows: RegistrationListRow[];
  total: number;
  pageSize: number;
  counts: Record<RegistrationStatus | "all", number>;
  basePath: string;
  detailHrefBase: string;
  /** The filters the list was fetched with (page number left out). */
  filters: RegistrationListFilters;
  query: RegistrationQuery;
  filterOptions: { regions: string[]; optionLabels: string[] };
  /** Until the builders exist the buttons do nothing. */
  onOpenBuilder?: OpenBuilder;
  /** The "Messages sent" list for this campaign goes here. */
  messagesSlot?: ReactNode;
}

const noBuilder: OpenBuilder = () => {};

export function CampaignRegistrations({
  pageId,
  pageTitle,
  publicSlug = null,
  rows,
  total,
  pageSize,
  counts,
  basePath,
  detailHrefBase,
  filters,
  query,
  filterOptions,
  onOpenBuilder = noBuilder,
  messagesSlot,
}: CampaignRegistrationsProps) {
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [allInFilter, setAllInFilter] = useState(false);
  const [idNote, setIdNote] = useState<string | null>(null);
  const [idBusy, setIdBusy] = useState(false);
  const [builder, setBuilder] = useState<{ channel: BuilderChannel; request: CampaignBuilderRequest } | null>(null);

  const pageIds = rows.map((r) => r.id);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => ids.has(id));
  const count = allInFilter ? total : ids.size;
  const isSelected = (id: string) => allInFilter || ids.has(id);

  function toggleRow(id: string) {
    if (allInFilter) {
      // Unticking one row leaves "everyone in this filter": keep the rest of this page ticked.
      setAllInFilter(false);
      setIds(new Set(pageIds.filter((x) => x !== id)));
      return;
    }
    setIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePage() {
    const untick = allInFilter || allOnPage;
    setAllInFilter(false);
    setIds(untick ? new Set() : new Set(pageIds));
  }

  function clear() {
    setAllInFilter(false);
    setIds(new Set());
  }

  function open(channel: BuilderChannel, starter?: CampaignBuilderRequest["starter"]) {
    const selection: CampaignSelection = allInFilter
      ? { mode: "filter", filters }
      : { mode: "ids", ids: Array.from(ids) };
    const request: CampaignBuilderRequest = { pageId, pageTitle, selection, count, ...(starter ? { starter } : {}) };
    // Both builders live here; onOpenBuilder is only a hook for the page to observe the click.
    setBuilder({ channel, request });
    onOpenBuilder(channel, request);
  }

  function openForRow(channel: BuilderChannel, request: CampaignBuilderRequest) {
    setBuilder({ channel, request });
    onOpenBuilder(channel, request);
  }

  // What the ID PDF will cover: the ticked people, else the active filter, else the whole batch.
  const filterActive = Boolean(
    filters.q || filters.mode || filters.region || filters.optionLabel || (filters.optionScopes && filters.optionScopes.length > 0) ||
    (filters.status && filters.status !== "all"),
  );
  const idSelection: CampaignSelection | null = allInFilter
    ? { mode: "filter", filters }
    : ids.size > 0
      ? { mode: "ids", ids: Array.from(ids) }
      : filterActive
        ? { mode: "filter", filters }
        : null;
  const idLabel = count > 0 ? `Download IDs (${count} selected)` : filterActive ? "Download IDs (filtered)" : "Download IDs (whole batch)";

  async function downloadIds() {
    setIdBusy(true);
    setIdNote(null);
    try {
      const list = await getSelectionIdList(pageId, idSelection);
      if (list.length === 0) {
        setIdNote("No one in this selection has a PZ ID yet.");
        return;
      }
      const { buildBatchPdf } = await import("@/lib/pzid/batch-pdf");
      const url = URL.createObjectURL(buildBatchPdf(pageTitle, list));
      const link = document.createElement("a");
      link.href = url;
      link.download = `${pageTitle} - PZ IDs.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      setIdNote("Could not download the ID list. Please try again.");
    } finally {
      setIdBusy(false);
    }
  }

  async function copyIdLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/ids/${publicSlug}`);
      setIdNote("Link copied.");
    } catch {
      setIdNote("Could not copy the link. Please copy it from the address of the public page.");
    }
  }

  const showBanner = allInFilter || (allOnPage && total > rows.length);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/admin/enrollments/registrations"
          className="inline-flex items-center gap-1.5 max-md:min-h-11 text-xs font-headline font-bold text-pz-primary hover:text-pz-on-primary-container dark:hover:text-pz-primary-fixed transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" aria-hidden="true" />
          All campaigns
        </Link>
        <div className="mt-3 space-y-1">
          <h1 className="font-headline font-black text-2xl lg:text-3xl text-pz-on-surface tracking-tight">{pageTitle}</h1>
          <p className="text-xs lg:text-sm font-body text-pz-on-surface-variant">
            <span className="font-headline font-bold text-pz-on-surface tabular-nums">{counts.all} registrations total</span>
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={downloadIds}
          disabled={idBusy}
          className="inline-flex items-center gap-1.5 max-md:min-h-11 px-3 py-1.5 rounded-lg bg-pz-surface-container-lowest border border-pz-outline-variant/40 hover:bg-pz-surface-container text-xs font-headline font-semibold disabled:opacity-60 transition-colors"
        >
          <Download className="w-4 h-4" aria-hidden="true" />
          {idLabel}
        </button>
        <span className="text-xs font-body text-pz-on-surface-variant">People without an ID yet are left out.</span>
        {publicSlug && (
          <button
            type="button"
            onClick={copyIdLink}
            className="inline-flex items-center gap-1.5 max-md:min-h-11 px-3 py-1.5 rounded-lg bg-pz-surface-container-lowest border border-pz-outline-variant/40 hover:bg-pz-surface-container text-xs font-headline font-semibold transition-colors"
          >
            <Copy className="w-4 h-4" aria-hidden="true" />
            Copy public ID page link
          </button>
        )}
        {idNote && <span role="status" className="text-xs font-body text-pz-on-surface-variant">{idNote}</span>}
      </div>

      <RegistrationFilters
        basePath={basePath}
        filters={query}
        counts={counts}
        pageOptions={[]}
        campaignOptions={filterOptions}
      />

      {showBanner && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-pz-primary-fixed/30 rounded-xl">
          <div className="flex flex-wrap items-center gap-2 text-xs font-body text-pz-on-surface">
            <CheckSquare className="w-4 h-4 text-pz-primary" aria-hidden="true" />
            {allInFilter ? (
              <span>All {total} in this filter are selected.</span>
            ) : (
              <>
                <span>All {rows.length} on this page are selected.</span>
                <button
                  type="button"
                  onClick={() => setAllInFilter(true)}
                  className="font-headline font-bold text-pz-primary underline hover:text-pz-on-primary-container dark:hover:text-pz-primary-fixed transition-colors"
                >
                  Select all {total} in this filter
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <RegistrationsTable
        rows={rows}
        total={total}
        pageSize={pageSize}
        basePath={basePath}
        filters={query}
        detailHrefBase={detailHrefBase}
        showAgentColumn={false}
        showPzId
        rowActions={(r) => <RowActions row={r} onOpenBuilder={openForRow} />}
        selectable={{ isSelected, onToggle: toggleRow, allOnPageSelected: allOnPage || allInFilter, onTogglePage: togglePage }}
      />

      {messagesSlot}

      {builder && (
        <MessageBuilder
          channel={builder.channel}
          request={builder.request}
          onClose={(sent) => {
            setBuilder(null);
            // A send was started: reload so the "Messages sent" list and the selection are fresh.
            if (sent) window.location.reload();
          }}
        />
      )}

      {count > 0 && (
        <aside aria-label="Selected registrations" className="fixed bottom-4 inset-x-4 md:left-72 md:right-8 z-40 pointer-events-none">
          <div className="pointer-events-auto max-w-4xl mx-auto bg-pz-inverse-surface/95 text-pz-inverse-on-surface backdrop-blur-md rounded-2xl p-3 px-5 shadow-2xl flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="min-w-7 h-7 px-1.5 rounded-lg bg-pz-primary-container text-pz-on-primary-container flex items-center justify-center font-headline font-black text-xs tabular-nums" aria-hidden="true">
                {count}
              </div>
              <span className="text-xs font-headline font-bold leading-tight">{count} selected</span>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => open("email")}
                className="inline-flex items-center gap-1.5 max-md:min-h-11 px-3 py-1.5 rounded-lg bg-pz-inverse-on-surface/15 hover:bg-pz-inverse-on-surface/25 text-pz-inverse-on-surface text-xs font-headline font-semibold transition-all"
              >
                Send email
              </button>
              <button
                type="button"
                onClick={() => open("email", ID_EMAIL_STARTER)}
                className="inline-flex items-center gap-1.5 max-md:min-h-11 px-3 py-1.5 rounded-lg bg-pz-inverse-on-surface/15 hover:bg-pz-inverse-on-surface/25 text-pz-inverse-on-surface text-xs font-headline font-semibold transition-all"
              >
                Email their IDs
              </button>
              <button
                type="button"
                onClick={() => open("whatsapp")}
                className="inline-flex items-center gap-1.5 max-md:min-h-11 px-3.5 py-1.5 rounded-lg bg-pz-primary-container text-pz-on-primary-container hover:bg-pz-primary-fixed text-xs font-headline font-bold shadow-md transition-all"
              >
                Send WhatsApp
              </button>
              <div className="h-4 w-px bg-pz-inverse-on-surface/30 mx-1" aria-hidden="true" />
              <button
                type="button"
                onClick={clear}
                className="max-md:min-h-11 text-xs font-headline font-semibold text-pz-inverse-on-surface/70 hover:text-pz-inverse-on-surface transition-colors px-2 py-1"
              >
                Clear
              </button>
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}
