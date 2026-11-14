"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { TEAMS, type CommissionMode, type Team } from "@/lib/affiliates/service";
import type { AffiliateRow } from "@/lib/data/affiliates";
import type { AffiliateEmailRow } from "@/lib/data/affiliate-emails";
import { AffiliateLeaderboardTab, type AdminBoards } from "./AffiliateLeaderboardTab";
import { AffiliateEmailsTab } from "./AffiliateEmailsTab";
import { AffiliatesList } from "./AffiliatesList";
import { AffiliateApplicationsTab } from "./AffiliateApplicationsTab";
import { DropReasonDialog } from "./DropReasonDialog";
import type { AffiliateTemplates } from "./AffiliateMessagePicker";
import type { MotivationSendRow } from "@/lib/data/affiliate-motivation-sends";
import { AffiliatePayoutsTab } from "./AffiliatePayoutsTab";
import type { PayoutRow } from "@/lib/data/affiliate-payouts";
import type { AffiliatesTab } from "@/lib/affiliates/hub-routes";

const INPUT =
  "w-full min-w-0 rounded-lg border border-pz-outline-variant bg-pz-surface-container-lowest px-3 py-2.5 font-body text-sm max-md:min-h-11 max-md:text-base focus:outline-none focus:ring-2 focus:ring-pz-primary/20";
const LABEL = "mb-1.5 block font-headline text-xs font-bold uppercase tracking-wide text-pz-on-surface-variant";

const STATUS_LABEL: Record<AffiliateRow["status"], string> = { applied: "Applied", accepted: "Accepted", dropped: "Dropped", left: "Left" };

const KIND_LABEL: Record<AffiliateEmailRow["kind"], string> = { accepted: "Welcome email", dropped: "Dropped email", left: "Left email", progress: "Progress email", motivation: "Motivation email", payout_paid: "Payout sent email", payout_rejected: "Payout update email" };

function stamp(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function when(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
}

type YesNo = { yes?: boolean; details?: string } | undefined;
const yesNo = (v: unknown): string => {
  const a = v as YesNo;
  if (!a || typeof a.yes !== "boolean") return "";
  return a.yes ? `Yes${a.details ? `: ${a.details}` : ""}` : "No";
};
const str = (v: unknown): string => (typeof v === "string" ? v : "");

function Answer({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="min-w-0">
      <dt className="font-headline text-xs font-bold uppercase tracking-wide text-pz-on-surface-variant">{label}</dt>
      <dd className="mt-0.5 break-words font-body text-sm text-pz-on-surface">{value}</dd>
    </div>
  );
}

function Answers({ a }: { a: Record<string, unknown> }) {
  const r = (a.ratings ?? {}) as Record<string, number>;
  const ratings = ["marketing", "eventPromotion", "onlineEngagement", "communication"].every((k) => typeof r[k] === "number")
    ? `Marketing ${r.marketing}, events ${r.eventPromotion}, online ${r.onlineEngagement}, communication ${r.communication} (out of 5)`
    : "";
  return (
    <dl className="space-y-3">
      <Answer label="I am a" value={str(a.status)} />
      <Answer label="School, university or workplace" value={str(a.organization)} />
      <Answer label="Field" value={str(a.field)} />
      <Answer label="Earned commission before" value={yesNo(a.commissionExperience)} />
      <Answer label="Managed or promoted events" value={yesNo(a.eventsManaged)} />
      <Answer label="Promoted programs" value={typeof a.promotingPrograms === "boolean" ? (a.promotingPrograms ? "Yes" : "No") : ""} />
      <Answer label="Sold online" value={typeof a.onlineSales === "boolean" ? (a.onlineSales ? "Yes" : "No") : ""} />
      <Answer label="Self rating" value={ratings} />
      <Answer label="Hours per week" value={str(a.hoursPerWeek)} />
      <Answer label="LinkedIn" value={str(a.linkedin)} />
      <Answer label="Why they want to join" value={str(a.why)} />
    </dl>
  );
}

async function call(id: string, body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> | null }> {
  try {
    const res = await fetch(`/api/admin/affiliates/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok) toast.error(typeof data?.error === "string" ? data.error : "Something went wrong. Please try again.");
    return { ok: res.ok, data };
  } catch {
    toast.error("Could not reach the server. Please check your connection and try again.");
    return { ok: false, data: null };
  }
}

function Detail({ row, onClose }: { row: AffiliateRow; onClose: () => void }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [code, setCode] = useState("");
  const [team, setTeam] = useState<string>(row.team ?? "");
  const [mode, setMode] = useState<CommissionMode>(row.commissionMode);
  const [percent, setPercent] = useState<string>(row.manualPercent === null ? "" : String(row.manualPercent));
  const [link, setLink] = useState<string | null>(null);
  const [emailNotSent, setEmailNotSent] = useState(false);
  const [emails, setEmails] = useState<AffiliateEmailRow[]>([]);
  const [dropOpen, setDropOpen] = useState(false);

  useEffect(() => {
    if (row.status === "applied") return;
    let live = true;
    void fetch(`/api/admin/affiliates/${row.id}`)
      .then((r) => r.json())
      .then((j: { link?: string | null; emails?: AffiliateEmailRow[] }) => {
        if (!live) return;
        setLink(j.link ?? null);
        setEmails(j.emails ?? []);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [row.id, row.status]);

  const teamValue = (team || null) as Team | null;

  const accept = useAsyncAction(async () => {
    const typed = code.trim();
    const { ok, data } = await call(row.id, typed ? { action: "accept", code: typed, team: teamValue } : { action: "accept", team: teamValue });
    if (!ok) return;
    if (data?.promoFailed === true) {
      // Accepted and saved, but the discount code did not switch on: Resend tries again.
      setEmailNotSent(true);
      toast.error("Accepted, but the discount code did not switch on. Press Resend to try again.");
    } else if (data?.emailSent === false) {
      setEmailNotSent(true);
      toast.success("Accepted. Email not sent, press Resend.");
    } else toast.success(`Accepted. Their code is ${String(data?.code ?? "")}.`);
    router.refresh();
  });

  const drop = useAsyncAction(async (reason: string) => {
    const { ok, data } = await call(row.id, { action: "drop", reason });
    if (!ok) return;
    setDropOpen(false);
    toast.success(data?.emailSent === false ? "Dropped. Email not sent." : "Dropped.");
    router.refresh();
    onClose();
  });

  const leave = useAsyncAction(async () => {
    const yes = await confirm({
      title: `Mark ${row.name} as left?`,
      description: "They will get a thank-you email. Their code stops working for new sales. Commission already earned stays.",
      confirmLabel: "Mark as left",
      destructive: true,
    });
    if (!yes) return;
    const { ok, data } = await call(row.id, { action: "leave" });
    if (!ok) return;
    toast.success(data?.emailSent === false ? "Marked as left. Email not sent." : "Marked as left.");
    router.refresh();
    onClose();
  });

  const resend = useAsyncAction(async () => {
    const { ok, data } = await call(row.id, { action: "resend" });
    if (!ok) return;
    if (data?.promoFailed === true) toast.error("The discount code is still not on. Press Resend again, or check the Promo codes screen.");
    else if (data?.emailSent === false) toast.error("Email still not sent. Check the email settings.");
    else {
      setEmailNotSent(false);
      toast.success("Email sent.");
    }
  });

  const save = useAsyncAction(async () => {
    const body: Record<string, unknown> = { action: "update", team: teamValue, commissionMode: mode };
    if (mode === "manual") body.manualPercent = percent.trim() === "" ? null : Number(percent);
    const { ok } = await call(row.id, body);
    if (!ok) return;
    toast.success("Saved.");
    router.refresh();
  });

  const clearHistory = useAsyncAction(async () => {
    const yes = await confirm({
      title: `Clear email history for ${row.name}?`,
      description: "The list of emails sent to this person is deleted. The emails themselves are not affected.",
      confirmLabel: "Clear history",
      destructive: true,
    });
    if (!yes) return;
    try {
      const res = await fetch(`/api/admin/affiliates/emails?affiliateId=${row.id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        toast.error(data?.error ?? "Could not clear the history. Please try again.");
        return;
      }
      setEmails([]);
      toast.success("History cleared.");
      router.refresh();
    } catch {
      toast.error("Could not reach the server. Please check your connection and try again.");
    }
  });

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Private link copied. Keep it private.");
    } catch {
      toast.error("Could not copy. Select the link and copy it by hand.");
    }
  };

  return (
    <div className="min-w-0 space-y-5">
      <div className="min-w-0">
        <DialogTitle className="break-words font-headline text-lg font-bold text-pz-secondary">{row.name}</DialogTitle>
        <DialogDescription className="mt-1 break-words font-body text-sm text-pz-on-surface-variant">
          {STATUS_LABEL[row.status]} · {row.email} · {row.whatsapp} · {row.cityCountry}
        </DialogDescription>
      </div>

      {emailNotSent ? (
        <div role="status" className="rounded-lg border border-pz-solid-mid bg-pz-surface-container-low p-3 font-body text-sm text-pz-on-surface">
          <p>Accepted. Email not sent, press Resend.</p>
          <Button type="button" className="mt-2" onClick={() => void resend.run()} disabled={resend.pending}>Resend email</Button>
        </div>
      ) : null}

      <Answers a={row.answers} />

      {row.status === "applied" ? (
        <div className="space-y-4 border-t border-pz-outline-variant pt-4">
          <div>
            <label htmlFor="aff-code" className={LABEL}>Affiliate code (optional)</label>
            <input id="aff-code" className={`${INPUT} uppercase`} value={code} onChange={(e) => setCode(e.target.value)} maxLength={7} placeholder="Leave empty to make the next one" />
            <p className="mt-1 font-body text-xs text-pz-on-surface-variant">Empty means the next code is made from their name and the running number.</p>
          </div>
          <div>
            <label htmlFor="aff-team" className={LABEL}>Team</label>
            <select id="aff-team" className={INPUT} value={team} onChange={(e) => setTeam(e.target.value)}>
              <option value="">No team yet</option>
              {TEAMS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void accept.run()} disabled={accept.pending}>Accept</Button>
            <Button type="button" variant="outline" onClick={() => setDropOpen(true)} disabled={drop.pending}>Drop</Button>
          </div>
        </div>
      ) : null}

      {row.status !== "applied" ? (
        <div className="space-y-2 border-t border-pz-outline-variant pt-4">
          <p className={LABEL}>Email history</p>
          {emails.length === 0 ? (
            <p className="font-body text-xs text-pz-on-surface-variant">No emails recorded.</p>
          ) : (
            <ul className="space-y-2">
              {emails.map((m) => (
                <li key={m.id} className="min-w-0 break-words rounded-lg border border-pz-outline-variant p-2 font-body text-xs text-pz-on-surface">
                  <span className="font-semibold">{KIND_LABEL[m.kind]}</span> · {stamp(m.createdAt)} ·{" "}
                  <span className={m.status === "failed" ? "font-bold text-pz-danger" : "font-bold"}>{m.status === "failed" ? "Failed" : "Sent"}</span>
                  {m.error ? <span className="block text-pz-danger">{m.error}</span> : null}
                </li>
              ))}
            </ul>
          )}
          {emails.length > 0 ? (
            <Button type="button" variant="outline" onClick={() => void clearHistory.run()} disabled={clearHistory.pending}>Clear history</Button>
          ) : null}
        </div>
      ) : null}

      {row.status === "dropped" || row.status === "left" ? (
        <div className="border-t border-pz-outline-variant pt-4">
          <Button type="button" variant="outline" onClick={() => void resend.run()} disabled={resend.pending}>Resend status email</Button>
        </div>
      ) : null}

      {row.status === "accepted" ? (
        <div className="space-y-4 border-t border-pz-outline-variant pt-4">
          <p className="font-body text-sm text-pz-on-surface">
            Code <strong className="font-mono">{row.code}</strong>
          </p>
          {link ? (
            <Button type="button" variant="outline" onClick={() => void copy()}>Copy private link</Button>
          ) : (
            <p className="font-body text-xs text-pz-on-surface-variant">Loading the private link...</p>
          )}
          <div>
            <label htmlFor="aff-team-edit" className={LABEL}>Team</label>
            <select id="aff-team-edit" className={INPUT} value={team} onChange={(e) => setTeam(e.target.value)}>
              <option value="">No team yet</option>
              {TEAMS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="aff-mode" className={LABEL}>Commission</label>
            <select id="aff-mode" className={INPUT} value={mode} onChange={(e) => setMode(e.target.value as CommissionMode)}>
              <option value="automatic">Automatic (8%, or 10% after a month with 10 paid participants)</option>
              <option value="manual">Manual (I type the percent)</option>
            </select>
          </div>
          {mode === "manual" ? (
            <div>
              <label htmlFor="aff-percent" className={LABEL}>Percent (8 to 10)</label>
              <input id="aff-percent" type="number" inputMode="decimal" min={8} max={10} step="0.5" className={INPUT} value={percent} onChange={(e) => setPercent(e.target.value)} />
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void save.run()} disabled={save.pending}>Save changes</Button>
            {!emailNotSent ? <Button type="button" variant="outline" onClick={() => void resend.run()} disabled={resend.pending}>Resend welcome email</Button> : null}
          </div>
          <div className="flex flex-wrap gap-2 border-t border-pz-outline-variant pt-4">
            <Button type="button" variant="outline" onClick={() => void leave.run()} disabled={leave.pending}>Mark as left</Button>
            <Button type="button" variant="outline" onClick={() => setDropOpen(true)} disabled={drop.pending}>Drop</Button>
          </div>
        </div>
      ) : null}

      <DropReasonDialog name={row.name} open={dropOpen} pending={drop.pending} onCancel={() => setDropOpen(false)} onConfirm={(reason) => void drop.run(reason)} />
    </div>
  );
}

/** Admin: applications and affiliates, with a detail sheet for each. */
export function AffiliatesAdmin({
  tab,
  initial,
  emailFailedIds = [],
  boards = null,
  boardUrl = null,
  emailMessage = "",
  emailMessageFailed = false,
  payouts = [],
  payoutsFailed = false,
  templates = null,
  templatesFailed = false,
  sends = [],
  sendsFailed = false,
}: {
  /** The section to show; the sidebar and bottom bar are the navigation. */
  tab: AffiliatesTab;
  initial: AffiliateRow[];
  emailFailedIds?: string[];
  boards?: AdminBoards | null;
  boardUrl?: string | null;
  emailMessage?: string;
  emailMessageFailed?: boolean;
  payouts?: PayoutRow[];
  payoutsFailed?: boolean;
  templates?: AffiliateTemplates | null;
  templatesFailed?: boolean;
  sends?: MotivationSendRow[];
  sendsFailed?: boolean;
}) {
  const router = useRouter();
  const confirmTop = useConfirm();
  const clearOld = useAsyncAction(async () => {
    const yes = await confirmTop({
      title: "Clear email history older than 90 days?",
      description: "Older records of emails sent to affiliates are deleted to keep the database small. Newer ones stay.",
      confirmLabel: "Clear old history",
      destructive: true,
    });
    if (!yes) return;
    try {
      const res = await fetch("/api/admin/affiliates/emails?olderThanDays=90", { method: "DELETE" });
      const data = (await res.json().catch(() => null)) as { error?: string; removed?: number } | null;
      if (!res.ok) toast.error(data?.error ?? "Could not clear the history. Please try again.");
      else {
        toast.success(`Cleared ${data?.removed ?? 0} old records.`);
        router.refresh();
      }
    } catch {
      toast.error("Could not reach the server. Please check your connection and try again.");
    }
  });

  const [openId, setOpenId] = useState<string | null>(null);
  // The Emails section unmounts when you leave it, so the last saved message lives here.
  const [savedMessage, setSavedMessage] = useState(emailMessage);
  const [messageFailed, setMessageFailed] = useState(emailMessageFailed);

  const shown = initial.filter((r) => r.status !== "applied");
  const open = initial.find((r) => r.id === openId) ?? null;

  return (
    <div className="min-w-0 space-y-4">
      {tab === "payouts" ? (
        <AffiliatePayoutsTab initial={payouts} failed={payoutsFailed} />
      ) : tab === "leaderboard" ? (
        <AffiliateLeaderboardTab boards={boards} boardUrl={boardUrl} />
      ) : tab === "emails" ? (
        <AffiliateEmailsTab initialMessage={savedMessage} messageFailed={messageFailed} onSaved={(text) => { setSavedMessage(text); setMessageFailed(false); }} sends={sends} sendsFailed={sendsFailed} onSent={() => router.refresh()} />
      ) : tab === "applications" ? (
        <AffiliateApplicationsTab rows={initial} onOpen={setOpenId} onClearOld={() => void clearOld.run()} />
      ) : shown.length === 0 ? (
        <EmptyState icon={Users} title="No affiliates yet" description="Accepted affiliates show up here." />
      ) : (
        <AffiliatesList rows={shown} templates={templates} templatesFailed={templatesFailed} emailFailedIds={emailFailedIds} onOpen={setOpenId} />
      )}

      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-xl overflow-y-auto">
          {open ? <Detail key={open.id} row={open} onClose={() => setOpenId(null)} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
