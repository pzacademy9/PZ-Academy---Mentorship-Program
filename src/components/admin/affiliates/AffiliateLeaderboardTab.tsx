"use client";

import { useState } from "react";
import { Trophy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { SharePodium } from "@/components/progress/portal/SharePodium";
import { shareText, type BoardPeriod } from "@/lib/affiliates/leaderboard";
import type { AffiliateBoard } from "@/lib/data/affiliate-leaderboard";

export type AdminBoards = { month: AffiliateBoard; all: AffiliateBoard };

const INPUT =
  "w-full min-w-0 rounded-lg border border-pz-outline-variant bg-pz-surface-container-lowest px-3 py-2.5 font-body text-sm max-md:min-h-11 max-md:text-base focus:outline-none focus:ring-2 focus:ring-pz-primary/20";
const LABEL = "mb-1.5 block font-headline text-xs font-bold uppercase tracking-wide text-pz-on-surface-variant";

// The five team identity colours (owner ruling: raw colour classes are fine for these dots).
const TEAM_DOT: Record<string, string> = {
  Green: "bg-green-500",
  White: "bg-slate-200 border border-pz-outline-variant",
  Yellow: "bg-yellow-400",
  Blue: "bg-sky-500",
  Pink: "bg-pink-400",
};

function TeamDot({ team }: { team: string | null }) {
  if (!team) return null;
  return <span role="img" aria-label={`${team} team`} className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${TEAM_DOT[team] ?? "bg-slate-300"}`} />;
}

const PERIODS: { id: BoardPeriod; label: string }[] = [
  { id: "month", label: "This month" },
  { id: "all", label: "All time" },
];

/** Admin: the affiliate leaderboard with the share picture, the WhatsApp text and the public link. */
export function AffiliateLeaderboardTab({ boards, boardUrl }: { boards: AdminBoards | null; boardUrl: string | null }) {
  const confirm = useConfirm();
  const [period, setPeriod] = useState<BoardPeriod>("month");
  const [url, setUrl] = useState<string | null>(boardUrl);
  const [copied, setCopied] = useState(false);

  const change = useAsyncAction(async () => {
    const yes = await confirm({
      title: "Change the public link?",
      description: "The old link will stop working. Continue?",
      confirmLabel: "Change link",
      destructive: true,
    });
    if (!yes) return;
    try {
      const res = await fetch("/api/admin/affiliates/board-link", { method: "POST" });
      const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!res.ok || typeof data?.url !== "string") {
        toast.error(data?.error ?? "Could not change the link. Please try again.");
        return;
      }
      setUrl(data.url);
      toast.success("New link made. The old link no longer works.");
    } catch {
      toast.error("Could not reach the server. Please check your connection and try again.");
    }
  });

  if (!boards) {
    return <EmptyState icon={Trophy} title="The leaderboard could not load" description="Please refresh the page in a minute." />;
  }

  const board = boards[period];
  const label = PERIODS.find((p) => p.id === period)?.label ?? "";
  const paidRows = board.rows.filter((r) => r.paid >= 1);
  const canShare = paidRows.length > 0;

  const copyText = async () => {
    if (!url || !canShare) return;
    try {
      await navigator.clipboard.writeText(shareText({ period, top: paidRows, teams: board.teams, boardUrl: url }));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Could not copy. Please try again.");
    }
  };

  const copyLink = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied.");
    } catch {
      toast.error("Could not copy. Select the link and copy it by hand.");
    }
  };

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {PERIODS.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={period === p.id}
            onClick={() => setPeriod(p.id)}
            className={`min-h-11 rounded-md border px-4 font-body text-sm font-semibold ${
              period === p.id ? "border-pz-solid-forest bg-pz-solid-forest text-white" : "border-pz-outline-variant bg-pz-surface-container-lowest text-pz-on-surface"
            }`}
          >
            {p.label}
          </button>
        ))}
        {canShare ? (
          <SharePodium
            slug="affiliates"
            title="Pharmacozyme Affiliates"
            pick={period}
            label={label}
            fileBase="affiliates"
            imageUrl={(size) => `/api/admin/affiliates/podium?period=${period}&size=${size}`}
          />
        ) : null}
        <Button type="button" variant="outline" onClick={() => void copyText()} disabled={!canShare || !url}>
          Copy for WhatsApp
        </Button>
        {copied ? (
          <span role="status" className="font-body text-sm font-semibold text-pz-primary">
            Copied
          </span>
        ) : null}
      </div>

      {board.rows.length === 0 ? (
        <EmptyState icon={Trophy} title="No affiliates on the board yet" description="Accepted affiliates show up here once they are in." />
      ) : (
        <>
          {!canShare ? <p className="font-body text-sm text-pz-on-surface-variant">No paid sales {period === "month" ? "this month" : "yet"}.</p> : null}
          <ol data-testid="leaderboard-list" className="w-full min-w-0 space-y-2">
            {board.rows.map((r) => (
              <li key={r.affiliateId} className="flex min-w-0 items-center gap-3 rounded-xl border border-pz-outline-variant bg-pz-surface-container-lowest p-3">
                <span className="w-8 shrink-0 text-center font-headline text-base font-bold text-pz-secondary">{r.rank}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-2">
                    <TeamDot team={r.team} />
                    <span className="break-words font-headline text-sm font-bold text-pz-secondary">{r.name}</span>
                  </span>
                  <span className="mt-0.5 block font-body text-xs text-pz-on-surface-variant">
                    {r.registered} registered · {r.paid} paid
                  </span>
                </span>
              </li>
            ))}
          </ol>

          <section aria-label="Team race" data-testid="team-race" className="space-y-2">
            <p className={LABEL}>Team race</p>
            <ol className="w-full min-w-0 space-y-2">
              {board.teams.map((t) => (
                <li key={t.team} className="flex min-w-0 items-center gap-3 rounded-xl border border-pz-outline-variant bg-pz-surface-container-lowest p-3">
                  <span className="w-8 shrink-0 text-center font-headline text-base font-bold text-pz-secondary">{t.rank}</span>
                  <TeamDot team={t.team} />
                  <span className="min-w-0 flex-1 break-words font-body text-sm text-pz-on-surface">
                    <span className="font-semibold">{t.team}</span> · {t.paid} paid · {t.active} of {t.members} active
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </>
      )}

      <div className="space-y-2 border-t border-pz-outline-variant pt-4">
        <label htmlFor="board-link" className={LABEL}>Public link</label>
        <input id="board-link" readOnly className={INPUT} value={url ?? ""} placeholder="No link yet. Press Change link to make one." />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => void copyLink()} disabled={!url}>Copy link</Button>
          <Button type="button" variant="outline" onClick={() => void change.run()} disabled={change.pending}>Change link</Button>
        </div>
        <p className="font-body text-xs text-pz-on-surface-variant">Anyone with this link can see first names, last initials and paid counts. Change it to stop the old link.</p>
      </div>
    </div>
  );
}
