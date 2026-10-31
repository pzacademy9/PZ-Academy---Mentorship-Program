import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Inbox, Users, Radio, PlayCircle, RefreshCw } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { ResponsiveList } from "@/components/ui/responsive-list";
import { formatDatePkt, initials } from "@/lib/format";
import { formatMoney } from "@/lib/format-money";
import type { RegistrationListRow } from "@/lib/data/landing-registration-admin";
import { RegistrationStatusBadge } from "./RegistrationStatusBadge";
import { registrationHref, type RegistrationQuery } from "./query";
import { VoucherThumb } from "./VoucherThumb";

const TH = "py-3.5 px-3 font-headline font-bold text-[11px] tracking-wide uppercase";

function ModeChip({ mode }: { mode: "live" | "recorded" }) {
  const Icon = mode === "live" ? Radio : PlayCircle;
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-headline font-semibold bg-pz-tertiary-fixed text-pz-on-tertiary-fixed-variant">
      <Icon className="w-3.5 h-3.5" aria-hidden="true" />
      {mode === "live" ? "Live" : "Recorded"}
    </span>
  );
}

function TestChip() {
  return (
    <span className="px-1.5 py-0.5 rounded text-[10px] font-headline font-extrabold bg-pz-surface-container-highest text-pz-on-surface-variant tracking-wider uppercase">
      Test
    </span>
  );
}

function MembersChip({ groupSize }: { groupSize: number }) {
  if (groupSize <= 1) return null;
  return (
    <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-headline font-bold bg-pz-secondary-container text-pz-on-secondary-container">
      <Users className="w-3 h-3" aria-hidden="true" />+{groupSize - 1} members
    </span>
  );
}

function MemberOfLine({ row }: { row: RegistrationListRow }) {
  if (row.rowType !== "member") return null;
  return <span className="text-[10px] text-pz-tertiary font-semibold mt-0.5">Group member of {row.leadName}</span>;
}

function WaitingTag({ row }: { row: RegistrationListRow }) {
  if (!row.sheetUpdateWaiting) return null;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-headline font-bold bg-pz-tertiary-fixed text-pz-on-tertiary-fixed">
      <RefreshCw className="w-3 h-3" aria-hidden="true" />
      Sheet update waiting
    </span>
  );
}

function Amount({ row }: { row: RegistrationListRow }) {
  return (
    <>
      <span className="font-headline font-bold text-pz-on-surface tabular-nums">{formatMoney(row.expectedAmount, row.currency)}</span>
      {row.amountReceived !== null && row.amountReceived !== row.expectedAmount && (
        <p className="text-[10px] text-pz-on-surface-variant tabular-nums">Received {formatMoney(row.amountReceived, row.currency)}</p>
      )}
    </>
  );
}

const PAGER_LINK =
  "inline-flex items-center gap-1 h-9 px-3 rounded-lg bg-pz-surface-container-lowest border border-pz-outline-variant/40 text-xs font-headline font-semibold hover:bg-pz-surface-container";

/**
 * The list of page registrations, with its empty state and pager. Role-agnostic: the agent
 * page passes showAgentColumn={false} and its own detailHrefBase.
 */
export function RegistrationsTable({
  rows,
  total,
  pageSize,
  basePath,
  filters,
  detailHrefBase,
  showAgentColumn,
  showPzId = false,
  selectable,
  rowActions,
}: {
  rows: RegistrationListRow[];
  total: number;
  pageSize: number;
  basePath: string;
  filters: RegistrationQuery;
  detailHrefBase: string;
  showAgentColumn: boolean;
  /** Campaign page only: adds a PZ ID column. */
  showPzId?: boolean;
  /** Campaign page only: adds a tick box to every row and one in the header. */
  selectable?: {
    isSelected: (id: string) => boolean;
    onToggle: (id: string) => void;
    allOnPageSelected: boolean;
    onTogglePage: () => void;
  };
  /** Admin lists only: renders the row menu, and turns on the voucher picture. */
  rowActions?: (row: RegistrationListRow) => ReactNode;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="No registrations match these filters"
        description="Try a different search or status, or reset the filters to see everything."
        action={{ label: "Reset filters", href: basePath }}
      />
    );
  }

  const page = Math.max(1, filters.p ?? 1);
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(total, first + rows.length - 1);
  const hasPrev = page > 1;
  const hasNext = page * pageSize < total;
  // A member has no detail page of its own (its id would 404), so it opens its lead's.
  const href = (r: RegistrationListRow) => `${detailHrefBase}/${r.leadId ?? r.id}`;

  return (
    <div className="space-y-4">
      <ResponsiveList
        rows={rows}
        getKey={(r) => r.id}
        mobile={{
          href,
          actions: rowActions,
          footer: rowActions
            ? (r) => (
                <div className="px-3 pb-3 flex items-center gap-2">
                  <VoucherThumb url={r.voucherUrl} variant="card" />
                </div>
              )
            : undefined,
          title: (r) => (
            <span className="inline-flex flex-wrap items-center gap-1.5">
              {r.name}
              {r.isTest && <TestChip />}
              {r.rowType !== "member" && <MembersChip groupSize={r.groupSize} />}
            </span>
          ),
          meta: (r) => [
            ...(r.rowType === "member" ? [<MemberOfLine key="member-of" row={r} />] : []),
            `${r.pageTitle} · ${r.optionLabel}`,
            ...(showPzId && r.pzId ? [`PZ ID: ${r.pzId}`] : []),
            `${r.region} · ${r.mode === "live" ? "Live" : "Recorded"} · ${formatMoney(r.expectedAmount, r.currency)}`,
            ...(r.sheetUpdateWaiting ? [<WaitingTag key="waiting" row={r} />] : []),
            <span key="status" className="inline-flex items-center gap-2">
              <RegistrationStatusBadge status={r.status} />
              <span>{formatDatePkt(r.createdAt)}</span>
            </span>,
            ...(showAgentColumn ? [`Agent: ${r.agentName ?? "None"}`] : []),
          ],
        }}
        selection={
          selectable
            ? { isSelected: (r) => selectable.isSelected(r.id), onToggle: (r) => selectable.onToggle(r.id), label: (r) => `Select ${r.name}` }
            : undefined
        }
        table={
          <div className="bg-pz-surface-container-lowest rounded-2xl border border-pz-outline-variant/40 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[72rem]">
                <thead>
                  <tr className="border-b border-pz-outline-variant/40 text-pz-on-surface-variant text-left bg-pz-surface-container-low">
                    {selectable && (
                      <th className="py-3.5 pl-6 pr-0 w-10">
                        <input
                          type="checkbox"
                          aria-label="Select all on this page"
                          checked={selectable.allOnPageSelected}
                          onChange={selectable.onTogglePage}
                          className="rounded border-pz-outline-variant w-4 h-4 cursor-pointer accent-pz-primary"
                        />
                      </th>
                    )}
                    <th className={`${TH} ${selectable ? "pl-3" : "pl-6"}`}>Name</th>
                    {showPzId && <th className={TH}>PZ ID</th>}
                    <th className={TH}>Page</th>
                    <th className={TH}>Country</th>
                    <th className={TH}>Option</th>
                    <th className={TH}>Live or Recorded</th>
                    <th className={`${TH} text-right`}>Amount</th>
                    <th className={TH}>Status</th>
                    {rowActions && <th className={TH}>Voucher</th>}
                    {showAgentColumn && <th className={TH}>Agent</th>}
                    <th className={`${TH} ${rowActions ? "" : "pr-6"}`}>Date</th>
                    {rowActions && <th className={`${TH} pr-4 w-12`}><span className="sr-only">Actions</span></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-pz-outline-variant/30 text-pz-on-surface">
                  {rows.map((r) => (
                    <tr
                      key={r.id}
                      className={`hover:bg-pz-surface-container/40 transition-colors${r.isTest ? " opacity-80 hover:opacity-100" : ""}${selectable?.isSelected(r.id) ? " bg-pz-primary-fixed/20" : ""}`}
                    >
                      {selectable && (
                        <td className="py-4 pl-6 pr-0 w-10">
                          <input
                            type="checkbox"
                            aria-label={`Select ${r.name}`}
                            checked={selectable.isSelected(r.id)}
                            onChange={() => selectable.onToggle(r.id)}
                            className="rounded border-pz-outline-variant w-4 h-4 cursor-pointer accent-pz-primary"
                          />
                        </td>
                      )}
                      <td className={`py-4 ${selectable ? "pl-3" : "pl-6"} pr-3 min-w-[13rem]`}>
                        <Link href={href(r)} className="flex items-start gap-2.5 group">
                          <span className="w-8 h-8 shrink-0 rounded-full bg-pz-primary-container text-pz-on-primary-container grid place-items-center font-headline font-bold text-xs mt-0.5">
                            {initials(r.name)}
                          </span>
                          <span className="min-w-0 flex flex-col">
                            <span className="flex flex-wrap items-center gap-1.5">
                              <span className="font-headline font-bold truncate group-hover:text-pz-primary transition-colors">{r.name}</span>
                              {r.isTest && <TestChip />}
                              {r.rowType !== "member" && <MembersChip groupSize={r.groupSize} />}
                              <WaitingTag row={r} />
                            </span>
                            <span className="text-[11px] text-pz-on-surface-variant truncate">{r.email}</span>
                            <MemberOfLine row={r} />
                            {r.refId && <span className="text-[10px] text-pz-tertiary font-semibold mt-0.5">Ref: {r.refId}</span>}
                          </span>
                        </Link>
                      </td>
                      {showPzId && (
                        <td className="py-4 px-3 whitespace-nowrap font-headline font-semibold">
                          {r.pzId ? r.pzId : <span aria-label="No PZ ID yet" className="text-pz-on-surface-variant/70">&ndash;</span>}
                        </td>
                      )}
                      <td className="py-4 px-3 min-w-[10rem] font-headline font-medium">{r.pageTitle}</td>
                      <td className="py-4 px-3 whitespace-nowrap">
                        <span className="inline-block px-2 py-1 rounded bg-pz-surface-container-low font-headline font-semibold">{r.region}</span>
                      </td>
                      <td className="py-4 px-3 min-w-[9rem] font-headline font-medium">{r.optionLabel}</td>
                      <td className="py-4 px-3 whitespace-nowrap"><ModeChip mode={r.mode} /></td>
                      <td className="py-4 px-3 text-right whitespace-nowrap"><Amount row={r} /></td>
                      <td className="py-4 px-3 whitespace-nowrap"><RegistrationStatusBadge status={r.status} /></td>
                      {rowActions && <td className="py-4 px-3 whitespace-nowrap"><VoucherThumb url={r.voucherUrl} /></td>}
                      {showAgentColumn && (
                        <td className="py-4 px-3 whitespace-nowrap">
                          {r.agentName ? (
                            <span className="inline-flex items-center gap-1.5">
                              <span className="w-5 h-5 rounded-full bg-pz-secondary-container text-pz-on-secondary-container grid place-items-center text-[10px] font-headline font-bold">
                                {initials(r.agentName)}
                              </span>
                              <span className="font-headline font-medium">{r.agentName}</span>
                            </span>
                          ) : (
                            <span className="italic text-pz-on-surface-variant/70">None</span>
                          )}
                        </td>
                      )}
                      <td className={`py-4 px-3 ${rowActions ? "" : "pr-6 "}whitespace-nowrap font-headline font-semibold`}>{formatDatePkt(r.createdAt)}</td>
                      {rowActions && <td className="py-4 pl-1 pr-4 text-right">{rowActions(r)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs font-body text-pz-on-surface-variant">
          Showing {first}-{last} of {total}
        </span>
        <div className="flex items-center gap-1.5">
          {hasPrev && (
            <Link href={registrationHref(basePath, filters, { p: page - 1 })} rel="prev" className={PAGER_LINK}>
              <ChevronLeft className="w-4 h-4" aria-hidden="true" /> Previous
            </Link>
          )}
          {hasNext && (
            <Link href={registrationHref(basePath, filters, { p: page + 1 })} rel="next" className={PAGER_LINK}>
              Next <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
