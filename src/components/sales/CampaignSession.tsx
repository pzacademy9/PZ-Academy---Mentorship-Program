"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, CircleCheck, CirclePause, MessageCircle, Phone, Play, SkipForward, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { renderWhatsAppMessage } from "@/lib/crm/whatsapp-link";
import { formatDateTime } from "@/lib/format";
import {
  explainSendError,
  lockCopy,
  openWhatsAppLink,
  sendLock,
  type ApiErrorJson,
  type BudgetJson,
} from "@/lib/crm/sales-ui";
import type { CampaignDetailJson, CampaignRecipientJson } from "@/lib/crm/campaign-ui";
import type { CampaignRecipientStatus } from "@/lib/crm/campaign-rules";
import { useSalesBudget } from "./SalesBudgetProvider";
import { useNow } from "./useNow";
import { PanicButton } from "./PanicButton";

const LIST_HREF = "/dashboard/sales/campaigns";
const QUEUE_PREVIEW = 10;

type SendOk = { link: string; warnings: string[]; budget: BudgetJson; done: boolean };
type SendFail = ApiErrorJson & { paused?: boolean; recipientBlocked?: boolean };

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("") || "?";

export function CampaignSession({
  initial,
  openLink = openWhatsAppLink,
}: {
  initial: CampaignDetailJson;
  openLink?: (url: string) => void;
}) {
  const { budgets, selectedId, select, refresh, applyBudget } = useSalesBudget();
  const now = useNow();
  const desktop = useMediaQuery("(min-width: 1024px)");
  const [detail, setDetail] = useState<CampaignDetailJson>(initial);
  const [retryAt, setRetryAt] = useState<string | null>(null);
  const [queueOpen, setQueueOpen] = useState(false);
  const [lastSent, setLastSent] = useState<{ name: string; link: string } | null>(null);
  const selectedOnce = useRef(false);
  const refreshedFor = useRef<string | null>(null);

  const base = `/api/sales/campaigns/${detail.id}`;
  const current = detail.recipients.find((r) => r.status === "pending") ?? null;
  const upcoming = detail.recipients.filter((r) => r.status === "pending" && r.id !== current?.id);
  const total = detail.recipients.length;
  const sentCount = detail.recipients.filter((r) => r.status === "sent").length;
  const skippedCount = detail.recipients.filter((r) => r.status === "skipped" || r.status === "blocked").length;
  const handled = sentCount + skippedCount;
  const done = detail.status === "done" || !current;
  const paused = detail.status === "paused";

  // Send from the campaign's own number: select it once the agent's numbers arrive.
  useEffect(() => {
    if (selectedOnce.current || !initial.numberId || !budgets) return;
    if (!budgets.some((b) => b.number.id === initial.numberId)) return;
    selectedOnce.current = true;
    if (selectedId !== initial.numberId) select(initial.numberId);
  }, [budgets, initial.numberId, selectedId, select]);

  const campaignNumber = budgets?.find((b) => b.number.id === detail.numberId) ?? null;
  const lock = sendLock({ budgets, selected: campaignNumber, warm: false, now });
  const copy = lockCopy(lock, now);

  // When a number pause or quiet hours ends, fetch fresh numbers once.
  const until = lock.kind === "frozen" || lock.kind === "quiet" ? lock.until : null;
  useEffect(() => {
    if (until && Date.parse(until) <= now.getTime() && refreshedFor.current !== until) {
      refreshedFor.current = until;
      void refresh();
    }
  }, [until, now, refresh]);

  const preview = useMemo(
    () => (current ? renderWhatsAppMessage(detail.messageTemplate, current.fullName) : ""),
    [detail.messageTemplate, current],
  );

  const mark = (id: string, status: CampaignRecipientStatus) =>
    setDetail((d) => ({ ...d, recipients: d.recipients.map((r) => (r.id === id ? { ...r, status } : r)) }));

  const reload = async () => {
    try {
      const res = await fetch(base, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { campaign: CampaignDetailJson };
      setDetail(body.campaign);
    } catch {
      toast.error("Could not load the latest list. Reload the page.");
    }
  };

  const { run: send, pending: sending } = useAsyncAction(async () => {
    if (!current || !campaignNumber || lock.kind !== "ready" || paused || done) return;
    const target = current;
    try {
      const res = await fetch(`${base}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientId: target.id }),
      });
      const body = (await res.json().catch(() => null)) as SendOk | SendFail | null;
      if (!res.ok) {
        const fail = (body ?? {}) as SendFail;
        if (fail.reason === "already-handled" || fail.reason === "campaign-done") {
          // Another tab got there first: show what the server has now.
          await reload();
          return;
        }
        if (fail.recipientBlocked) {
          mark(target.id, "skipped");
          toast.error(`Skipped ${target.fullName}: ${explainSendError(fail, new Date())}`);
          return;
        }
        if (fail.paused) {
          setDetail((d) => ({ ...d, status: "paused", pausedReason: fail.error ?? null }));
          setRetryAt(fail.retryAt ?? null);
          await refresh();
          return;
        }
        toast.error(explainSendError(fail, new Date()));
        await refresh();
        return;
      }
      const ok = body as SendOk;
      applyBudget(campaignNumber.number.id, ok.budget);
      for (const w of ok.warnings) toast.warning(w);
      mark(target.id, "sent");
      if (ok.done) setDetail((d) => ({ ...d, status: "done" }));
      setLastSent({ name: target.fullName, link: ok.link });
      openLink(ok.link);
    } catch {
      toast.error("Could not send this message.");
    }
  });

  const { run: skip, pending: skipping } = useAsyncAction(async () => {
    if (!current || done) return;
    const target = current;
    try {
      const res = await fetch(`${base}/skip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientId: target.id }),
      });
      const body = (await res.json().catch(() => null)) as ({ done?: boolean } & ApiErrorJson) | null;
      if (!res.ok) {
        if (body?.reason === "already-handled" || body?.reason === "campaign-done") {
          await reload();
          return;
        }
        toast.error(body?.error ?? "Could not skip this person.");
        return;
      }
      mark(target.id, "skipped");
      if (body?.done) setDetail((d) => ({ ...d, status: "done" }));
    } catch {
      toast.error("Could not skip this person.");
    }
  });

  const { run: setStatus, pending: switching } = useAsyncAction(async (status: "active" | "paused") => {
    try {
      const res = await fetch(base, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const body = (await res.json().catch(() => null)) as ApiErrorJson | null;
      if (!res.ok) {
        toast.error(body?.error ?? (status === "active" ? "Could not resume this campaign." : "Could not pause this campaign."));
        return;
      }
      setDetail((d) => ({ ...d, status, pausedReason: null }));
      setRetryAt(null);
      if (status === "active") await refresh();
    } catch {
      toast.error(status === "active" ? "Could not resume this campaign." : "Could not pause this campaign.");
    }
  });

  const busy = sending || skipping || switching;
  const locked = lock.kind !== "ready";
  const percent = total === 0 ? 0 : Math.round((handled / total) * 100);

  return (
    <div className="flex flex-col gap-6 font-body">
      <div className="bg-pz-surface-container-lowest rounded-xl p-4 sm:p-6 shadow-sm flex flex-col gap-4">
        <Link
          href={LIST_HREF}
          className="inline-flex items-center gap-1.5 self-start max-md:min-h-11 text-xs font-headline font-semibold text-pz-on-surface-variant hover:text-pz-on-surface"
        >
          <ArrowLeft className="w-4 h-4" /> Campaigns
        </Link>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl lg:text-2xl font-headline font-black text-pz-on-surface tracking-tight break-words">
              {detail.name}
            </h1>
            <p className="mt-1 text-sm font-headline font-bold text-pz-primary">
              {sentCount} of {total} sent
            </p>
          </div>
          {!done && !paused && (
            <Button
              type="button"
              variant="bare"
              size="bare"
              loading={switching}
              disabled={busy}
              onClick={() => void setStatus("paused")}
              className="shrink-0 gap-1.5 px-3.5 h-10 max-md:min-h-11 rounded-lg bg-pz-surface-container-low text-pz-on-surface font-headline text-sm font-bold hover:bg-pz-surface-container-high transition-colors"
            >
              <CirclePause className="w-4 h-4" />
              Pause
            </Button>
          )}
        </div>
        <div
          role="progressbar"
          aria-label="Campaign progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="h-2 rounded-full bg-pz-surface-container-high overflow-hidden"
        >
          <div className="h-full rounded-full bg-pz-primary transition-all" style={{ width: `${percent}%` }} />
        </div>
        <p className="text-xs text-pz-on-surface-variant">
          {skippedCount > 0 ? `${skippedCount} skipped · ` : ""}
          {upcoming.length + (current ? 1 : 0)} still to message
        </p>
      </div>

      {done ? (
        <div className="bg-pz-surface-container-lowest rounded-xl p-6 sm:p-8 shadow-sm flex flex-col items-center text-center gap-3">
          <CircleCheck className="w-10 h-10 text-pz-primary" />
          <h2 className="text-xl font-headline font-black text-pz-on-surface">All done</h2>
          <p className="text-sm text-pz-on-surface-variant">
            Sent {sentCount}, skipped {skippedCount}
          </p>
          {lastSent && (
            <a
              href={lastSent.link}
              {...(desktop ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              className="min-h-11 inline-flex items-center justify-center rounded-lg bg-pz-surface-container-low text-pz-on-surface font-headline font-semibold text-sm px-4"
            >
              Open WhatsApp again for {lastSent.name}
            </a>
          )}
          <Link
            href={LIST_HREF}
            className="mt-2 inline-flex items-center justify-center h-12 max-md:min-h-11 px-5 rounded-lg bg-pz-primary hover:bg-pz-primary/95 text-pz-on-primary font-headline font-bold text-sm transition-all shadow-sm active:scale-[0.99]"
          >
            Back to Campaigns
          </Link>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] items-start">
          <div className="bg-pz-surface-container-lowest rounded-xl p-4 sm:p-6 shadow-sm flex flex-col gap-5">
            {current && <CurrentPerson person={current} />}

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-headline font-semibold text-pz-on-surface-variant">What they will see</span>
              <div className="bg-pz-surface-container-low rounded-xl p-4">
                <p className="bg-pz-surface-container-lowest rounded-lg p-4 shadow-sm text-sm text-pz-on-surface leading-relaxed whitespace-pre-wrap">
                  {preview}
                </p>
              </div>
            </div>

            {paused ? (
              <div className="rounded-xl bg-pz-secondary-fixed text-pz-on-secondary-fixed p-4 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <CirclePause className="w-5 h-5" />
                  <h3 className="text-base font-headline font-bold">Paused</h3>
                </div>
                <p className="text-sm">{detail.pausedReason ?? "You paused this campaign. Resume when you are ready."}</p>
                {retryAt && <p className="text-sm font-semibold">Try again after {formatDateTime(retryAt)}.</p>}
                <Button
                  type="button"
                  variant="bare"
                  size="bare"
                  loading={switching}
                  disabled={busy}
                  onClick={() => void setStatus("active")}
                  className="self-start gap-1.5 px-5 h-12 max-md:min-h-11 rounded-lg bg-pz-primary hover:bg-pz-primary/95 text-pz-on-primary font-headline font-bold text-sm shadow-sm transition-all"
                >
                  <Play className="w-4 h-4" />
                  Resume
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  variant="bare"
                  size="bare"
                  data-testid="campaign-send"
                  disabled={locked || busy}
                  loading={sending}
                  onClick={() => void send()}
                  className="w-full min-h-14 px-4 py-3 rounded-xl bg-pz-primary hover:bg-pz-primary/95 text-pz-on-primary font-headline font-bold text-base flex items-center justify-center gap-3 whitespace-normal text-center transition-all shadow-md active:scale-[0.99] disabled:bg-pz-surface-container-high disabled:text-pz-on-surface-variant disabled:shadow-none disabled:opacity-100"
                >
                  <MessageCircle className="w-6 h-6" />
                  {locked ? copy.button : "Open WhatsApp"}
                </Button>
                {locked && copy.detail && (
                  <p className="text-xs text-center text-pz-on-surface-variant">{copy.detail}</p>
                )}
                {!locked && (
                  <p className="text-[11px] text-center text-pz-on-surface-variant">
                    Opens WhatsApp with the message filled in. Check it, then press send in WhatsApp.
                  </p>
                )}
                <Button
                  type="button"
                  variant="bare"
                  size="bare"
                  loading={skipping}
                  disabled={busy}
                  onClick={() => void skip()}
                  className="w-full h-12 max-md:min-h-11 gap-2 rounded-xl bg-pz-surface-container-low text-pz-on-surface font-headline font-semibold text-sm hover:bg-pz-surface-container-high transition-colors"
                >
                  <SkipForward className="w-4 h-4" />
                  Skip this person
                </Button>
                {lastSent && (
                  <a
                    href={lastSent.link}
                    {...(desktop ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    className="min-h-11 inline-flex items-center justify-center rounded-lg text-pz-primary font-headline font-semibold text-xs px-4 underline-offset-4 hover:underline"
                  >
                    Open WhatsApp again for {lastSent.name}
                  </a>
                )}
              </div>
            )}
          </div>

          <aside className="flex flex-col gap-6">
            <WhoIsNext upcoming={upcoming} open={queueOpen} onToggle={() => setQueueOpen((o) => !o)} />
            <div className="bg-pz-error-container/40 rounded-xl p-4 sm:p-5 flex flex-col gap-3">
              <h3 className="text-sm font-headline font-bold text-pz-danger">If WhatsApp warns you</h3>
              <p className="text-xs text-pz-on-surface-variant leading-relaxed">
                If WhatsApp shows a warning, asks you to verify, or limits your account, stop here and pause this
                number. Your admin is told.
              </p>
              <PanicButton className="w-full justify-center" />
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function CurrentPerson({ person }: { person: CampaignRecipientJson }) {
  return (
    <div className="flex items-center gap-4">
      <div
        aria-hidden="true"
        className="w-14 h-14 shrink-0 rounded-full bg-pz-primary-container/30 text-pz-on-primary-container flex items-center justify-center font-headline font-black text-lg"
      >
        {initials(person.fullName)}
      </div>
      <div className="min-w-0">
        <span className="text-[11px] font-headline font-semibold uppercase tracking-wide text-pz-on-surface-variant">
          Now messaging
        </span>
        <h2 className="text-lg sm:text-xl font-headline font-black text-pz-on-surface break-words">{person.fullName}</h2>
        <p className="flex items-center gap-1.5 text-sm text-pz-on-surface-variant">
          <Phone className="w-3.5 h-3.5" />
          <span>{person.phone}</span>
        </p>
      </div>
    </div>
  );
}

function WhoIsNext({
  upcoming,
  open,
  onToggle,
}: {
  upcoming: CampaignRecipientJson[];
  open: boolean;
  onToggle: () => void;
}) {
  const shown = upcoming.slice(0, QUEUE_PREVIEW);
  const more = upcoming.length - shown.length;
  return (
    <div className="bg-pz-surface-container-lowest rounded-xl p-4 sm:p-5 shadow-sm flex flex-col gap-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="campaign-who-is-next"
        onClick={onToggle}
        className="lg:hidden min-h-11 inline-flex items-center justify-center gap-2 rounded-lg bg-pz-surface-container-low text-pz-on-surface font-headline font-semibold text-sm px-4"
      >
        <Users className="w-4 h-4" />
        {open ? "Hide who is next" : "Show who is next"}
      </button>
      <div id="campaign-who-is-next" className={open ? "flex flex-col gap-3" : "max-lg:hidden flex flex-col gap-3"}>
        <h3 className="max-lg:hidden text-sm font-headline font-bold text-pz-on-surface">Who is next</h3>
        {upcoming.length === 0 ? (
          <p className="text-xs text-pz-on-surface-variant">Nobody else is waiting. This is the last person.</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {shown.map((r) => (
              <li key={r.id} className="flex items-center gap-3 rounded-lg bg-pz-surface-container-low px-3 py-2">
                <span
                  aria-hidden="true"
                  className="w-8 h-8 shrink-0 rounded-full bg-pz-surface-container-high text-pz-on-surface-variant flex items-center justify-center font-headline font-bold text-xs"
                >
                  {initials(r.fullName)}
                </span>
                <span className="min-w-0 text-sm font-semibold text-pz-on-surface truncate">{r.fullName}</span>
              </li>
            ))}
          </ol>
        )}
        {more > 0 && <p className="text-xs text-pz-on-surface-variant">and {more} more</p>}
      </div>
    </div>
  );
}
