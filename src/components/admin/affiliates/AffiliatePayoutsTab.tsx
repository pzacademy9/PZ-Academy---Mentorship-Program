"use client";

import { useState } from "react";
import { Copy, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { formatPayoutPkr, type PayoutMethod, type PayoutStatus } from "@/lib/affiliates/payouts";
import type { PayoutRow } from "@/lib/data/affiliate-payouts";

const INPUT =
  "w-full min-w-0 rounded-lg border border-pz-outline-variant bg-pz-surface-container-lowest px-3 py-2.5 font-body text-sm max-md:min-h-11 max-md:text-base focus:outline-none focus:ring-2 focus:ring-pz-primary/20";
const LABEL = "mb-1.5 block font-headline text-xs font-bold uppercase tracking-wide text-pz-on-surface-variant";

const METHOD_LABEL: Record<PayoutMethod, string> = { jazzcash: "JazzCash", easypaisa: "Easypaisa", bank: "Bank" };
const FILTERS: { key: PayoutStatus; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "paid", label: "Paid" },
  { key: "rejected", label: "Rejected" },
];
const QUICK_REASONS = ["Account title does not match the name", "Wrong account number", "Other"];
const BADGE: Record<PayoutStatus, string> = {
  pending: "border border-pz-solid-mid bg-pz-surface-container-low text-pz-deep",
  paid: "bg-pz-solid-forest text-white",
  rejected: "border border-pz-solid-danger bg-pz-surface-container-low text-pz-danger",
};
const BADGE_LABEL: Record<PayoutStatus, string> = { pending: "Pending", paid: "Paid", rejected: "Rejected" };

function day(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Karachi" }) : "";
}

type Decision = { action: "paid" } | { action: "reject"; reason: string };

/** Admin: payout requests. Cards on a phone, a table on a wide screen. */
export function AffiliatePayoutsTab({ initial, failed }: { initial: PayoutRow[]; failed: boolean }) {
  const [rows, setRows] = useState<PayoutRow[]>(initial);
  const [filter, setFilter] = useState<PayoutStatus>("pending");
  const [query, setQuery] = useState("");
  const [rejecting, setRejecting] = useState<PayoutRow | null>(null);
  const [reason, setReason] = useState("");
  // Cards another admin already decided (the server said 409): their buttons are hidden until a refresh.
  const [stale, setStale] = useState<Set<string>>(new Set());

  const count = (s: PayoutStatus) => rows.filter((r) => r.status === s).length;
  const pending = rows.filter((r) => r.status === "pending");
  const pendingTotal = Math.round(pending.reduce((n, r) => n + r.amountPkr, 0) * 100) / 100;
  const q = query.trim().toLowerCase();
  const shown = rows.filter(
    (r) => r.status === filter && (!q || r.affiliateName.toLowerCase().includes(q) || (r.affiliateCode ?? "").toLowerCase().includes(q)),
  );

  const decide = useAsyncAction(
    async (row: PayoutRow, d: Decision): Promise<boolean> => {
      try {
        const res = await fetch(`/api/admin/affiliates/payouts/${row.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(d),
        });
        const data = (await res.json().catch(() => null)) as { error?: string; emailSent?: boolean } | null;
        if (!res.ok) {
          toast.error(data?.error ?? "Something went wrong. Please try again.");
          if (res.status === 409) {
            setStale((s) => new Set(s).add(row.id));
            return true; // nothing left to retry, so the reject box can close
          }
          return false;
        }
        const now = new Date().toISOString();
        setRows((all) =>
          all.map((r) =>
            r.id === row.id
              ? d.action === "paid"
                ? { ...r, status: "paid", decidedAt: now }
                : { ...r, status: "rejected", rejectReason: d.reason, decidedAt: now }
              : r,
          ),
        );
        if (data?.emailSent === false) toast.success("Saved. The email could not be sent.");
        else toast.success(d.action === "paid" ? "Marked as paid. The affiliate has been emailed." : "Rejected. The affiliate has been emailed.");
        return true;
      } catch {
        toast.error("Could not reach the server. Please check your connection and try again.");
        return false;
      }
    },
    { getKey: (row: PayoutRow) => row.id },
  );

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied.");
    } catch {
      toast.error("Could not copy. Select the number and copy it by hand.");
    }
  };

  const openReject = (row: PayoutRow) => {
    setReason("");
    setRejecting(row);
  };

  const confirmReject = async () => {
    if (!rejecting) return;
    const text = reason.trim();
    if (text.length < 3) return;
    const ok = await decide.run(rejecting, { action: "reject", reason: text });
    if (ok) setRejecting(null);
  };

  return (
    <div className="min-w-0 space-y-4">
      {failed ? (
        <div role="alert" className="rounded-lg border border-pz-solid-danger bg-pz-surface-container-low p-3 font-body text-sm text-pz-danger">
          Could not load the payout requests. Refresh the page to try again.
        </div>
      ) : null}

      <div>
        <h2 className="font-headline text-lg font-bold text-pz-secondary">Payout requests</h2>
        <p className="mt-1 font-body text-sm text-pz-on-surface-variant">
          {pending.length === 0 ? "No requests waiting." : `${pending.length} ${pending.length === 1 ? "request" : "requests"} waiting · ${formatPayoutPkr(pendingTotal)}`}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={`min-h-11 rounded-full border px-4 font-body text-sm font-semibold ${
              filter === f.key ? "border-pz-solid-forest bg-pz-solid-forest text-white" : "border-pz-outline-variant bg-pz-surface-container-lowest text-pz-on-surface"
            }`}
          >
            {`${f.label} (${count(f.key)})`}
          </button>
        ))}
      </div>

      <div>
        <label htmlFor="payout-search" className={LABEL}>Search</label>
        <input id="payout-search" className={INPUT} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name or code" />
      </div>

      {shown.length === 0 ? (
        <EmptyState icon={Wallet} title="Nothing here" description={q ? "No request matches your search." : "Requests with this status show up here."} />
      ) : (
        <ul data-testid="payout-rows" className="w-full min-w-0 space-y-3">
          {shown.map((r) => (
            <li
              key={r.id}
              className="min-w-0 space-y-3 rounded-xl border border-pz-outline-variant bg-pz-surface-container-lowest p-4 md:grid md:grid-cols-[1.3fr_0.9fr_1.8fr_1.1fr_auto] md:items-center md:gap-4 md:space-y-0"
            >
              <div className="flex min-w-0 items-start justify-between gap-2 md:block">
                <div className="min-w-0">
                  <p className="break-words font-headline text-sm font-bold text-pz-secondary">{r.affiliateName || "Unknown affiliate"}</p>
                  {r.affiliateCode ? <p className="font-mono text-xs font-bold text-pz-on-surface-variant">{r.affiliateCode}</p> : null}
                </div>
                <span className={`inline-flex shrink-0 rounded-full px-2.5 py-1 font-headline text-[11px] font-bold uppercase tracking-wide md:hidden ${BADGE[r.status]}`}>
                  {BADGE_LABEL[r.status]}
                </span>
              </div>

              <div className="min-w-0">
                <p className="font-headline text-xl font-black text-pz-on-surface md:text-base">{formatPayoutPkr(r.amountPkr)}</p>
                <p className="font-body text-xs text-pz-on-surface-variant">{`Asked on ${day(r.requestedAt)}`}</p>
              </div>

              <div className="min-w-0 space-y-2 rounded-lg bg-pz-surface-container-low p-3">
                <p className="font-body text-xs text-pz-on-surface-variant">
                  {METHOD_LABEL[r.method]} · <span>Account title: <strong className="text-pz-on-surface">{r.accountTitle}</strong></span>
                </p>
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <span className="min-w-0 break-all font-mono text-sm font-bold text-pz-on-surface">{r.accountNumber}</span>
                  <button
                    type="button"
                    aria-label="Copy account number"
                    onClick={() => void copy(r.accountNumber)}
                    className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-md border border-pz-outline-variant bg-pz-surface-container-lowest px-2 font-body text-xs font-semibold text-pz-on-surface"
                  >
                    <Copy className="h-4 w-4" aria-hidden="true" />
                    Copy
                  </button>
                </div>
              </div>

              <div className="min-w-0">
                {r.status === "pending" && stale.has(r.id) ? (
                  <p className="font-body text-sm font-semibold text-pz-on-surface">Already decided. Refresh to see the result.</p>
                ) : r.status === "pending" ? (
                  <div className="grid grid-cols-2 gap-2 md:flex">
                    <Button type="button" variant="outline" className="min-h-11" onClick={() => openReject(r)} disabled={decide.pending}>Reject</Button>
                    <Button type="button" className="min-h-11" onClick={() => void decide.run(r, { action: "paid" })} disabled={decide.pending}>
                      {decide.pendingKey === r.id ? "Saving..." : "Mark paid"}
                    </Button>
                  </div>
                ) : r.status === "paid" ? (
                  <p className="font-body text-sm font-semibold text-pz-on-surface">{`Paid on ${day(r.decidedAt)}`}</p>
                ) : (
                  <div className="space-y-1">
                    <p className="font-body text-sm font-semibold text-pz-on-surface">{`Rejected on ${day(r.decidedAt)}`}</p>
                    <p className="break-words font-body text-sm text-pz-danger">{r.rejectReason}</p>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={rejecting !== null} onOpenChange={(o) => !o && !decide.pending && setRejecting(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
          <div className="min-w-0 space-y-4">
            <div>
              <DialogTitle className="font-headline text-lg font-bold text-pz-secondary">Reject this payout</DialogTitle>
              <DialogDescription className="mt-1 break-words font-body text-sm text-pz-on-surface-variant">
                {rejecting ? `${rejecting.affiliateName} · ${formatPayoutPkr(rejecting.amountPkr)}. The affiliate will see your reason.` : ""}
              </DialogDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              {QUICK_REASONS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setReason(t === "Other" ? "" : t)}
                  className="min-h-11 rounded-full border border-pz-outline-variant bg-pz-surface-container-low px-3 font-body text-sm text-pz-on-surface"
                >
                  {t}
                </button>
              ))}
            </div>
            <div>
              <label htmlFor="payout-reason" className={LABEL}>Reason for the affiliate</label>
              <textarea id="payout-reason" rows={3} maxLength={300} className={INPUT} value={reason} onChange={(e) => setReason(e.target.value)} />
              <p className="mt-1 font-body text-xs text-pz-on-surface-variant">Write a short reason. This is required.</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" className="min-h-11" onClick={() => setRejecting(null)} disabled={decide.pending}>Cancel</Button>
              <Button type="button" className="min-h-11 bg-pz-solid-danger text-white hover:bg-pz-solid-danger/90" onClick={() => void confirmReject()} disabled={decide.pending || reason.trim().length < 3}>
                Confirm reject
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
