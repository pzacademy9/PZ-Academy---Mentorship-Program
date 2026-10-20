"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight, Mail, MessageCircle, Send, X } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import type { SendCounts, SendListItem } from "@/lib/data/participant-sends";
import { PARTICIPANTS_API, call, runSendLoop } from "./run-send";
import { WhatsAppSendList } from "./WhatsAppSendList";

type Recipient = {
  id: string;
  name: string;
  email: string;
  phone: string;
  state: string;
  reason: string;
};

const SKIP_WORDS: Record<string, string> = {
  unsubscribed: "Unsubscribed",
  no_phone: "No phone number",
  no_email: "No email address",
  merged: "Already included",
};

const WHATSAPP_WORDS = 8;

/** Reasons the team wrote itself; anything else is provider text and stays out of the screen. */
const KNOWN_FAILURES = ["May have been sent. Check before sending again.", "No portal link available"];
const FALLBACK_FAILURE = "The email service could not send this one.";
const failureWords = (reason: string): string =>
  reason.trim() === "" ? "Could not be sent" : KNOWN_FAILURES.includes(reason) ? reason : FALLBACK_FAILURE;

const whenOf = (s: SendListItem): string => (s.created_at ? formatDateTime(s.created_at) : "");

const initials = (name: string): string =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join("");

function titleOf(s: SendListItem): string {
  if (s.channel === "whatsapp") {
    const words = s.body.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return "WhatsApp message";
    return words.slice(0, WHATSAPP_WORDS).join(" ") + (words.length > WHATSAPP_WORDS ? "..." : "");
  }
  return s.subject.trim() === "" ? "Email" : s.subject;
}

function countRecipients(rows: Recipient[]): SendCounts {
  const c: SendCounts = { sent: 0, failed: 0, skipped: 0, waiting: 0 };
  for (const r of rows) {
    if (r.state === "sent") c.sent += 1;
    else if (r.state === "failed") c.failed += 1;
    else if (r.state === "skipped") c.skipped += 1;
    else c.waiting += 1;
  }
  return c;
}

function CountPills({ counts }: { counts: SendCounts }) {
  return (
    <div className="inline-flex flex-wrap items-center gap-1.5 text-xs font-headline font-semibold">
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-pz-primary-fixed text-pz-on-primary-fixed">
        <span className="w-1.5 h-1.5 rounded-full bg-pz-primary" aria-hidden="true" />Sent {counts.sent}
      </span>
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${counts.failed > 0 ? "bg-pz-error-container text-pz-on-error-container" : "bg-pz-surface-container text-pz-on-surface-variant"}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${counts.failed > 0 ? "bg-pz-error" : "bg-pz-outline"}`} aria-hidden="true" />Failed {counts.failed}
      </span>
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-pz-surface-container text-pz-on-surface-variant">
        <span className="w-1.5 h-1.5 rounded-full bg-pz-outline" aria-hidden="true" />Skipped {counts.skipped}
      </span>
    </div>
  );
}

function ChannelChip({ channel }: { channel: string }) {
  const whatsapp = channel === "whatsapp";
  const Icon = whatsapp ? MessageCircle : Mail;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-headline font-bold ${whatsapp ? "bg-pz-primary-container text-pz-on-primary-container" : "bg-pz-surface-container-highest text-pz-on-surface"}`}>
      <Icon className="w-3 h-3" aria-hidden="true" />
      {whatsapp ? "WhatsApp" : "Email"}
    </span>
  );
}

function RecipientRow({ r }: { r: Recipient }) {
  const failed = r.state === "failed";
  const skipped = r.state === "skipped";
  const sent = r.state === "sent";
  const word = sent ? "Sent" : failed ? "Failed" : skipped ? "Skipped" : "Waiting";
  const chip = sent
    ? "bg-pz-primary-fixed text-pz-on-primary-fixed"
    : failed
      ? "bg-pz-error-container text-pz-on-error-container"
      : skipped
        ? "bg-pz-surface-container text-pz-on-surface-variant"
        : "bg-pz-secondary-container/40 text-pz-on-secondary-container";
  const reason = failed
    ? failureWords(r.reason)
    : skipped
      ? SKIP_WORDS[r.reason] ?? "Not included"
      : "";
  const contact = [r.email, r.phone].filter((v) => v.trim() !== "").join(" • ");
  return (
    <li className={`p-3.5 rounded-xl flex items-center justify-between gap-3 ${failed ? "bg-pz-error-container/40 border border-pz-error/30" : "bg-pz-surface-container-low"}`}>
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-headline font-bold text-xs shrink-0 ${failed ? "bg-pz-error-container text-pz-on-error-container" : "bg-pz-primary-container text-pz-on-primary-container"}`} aria-hidden="true">
          {initials(r.name)}
        </div>
        <div className="min-w-0">
          <div className="font-headline font-bold text-xs text-pz-on-surface truncate">{r.name}</div>
          {contact !== "" && <div className="text-[11px] font-body text-pz-on-surface-variant truncate">{contact}</div>}
        </div>
      </div>
      <div className="text-right shrink-0 max-w-[50%]">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-headline font-bold ${chip}`}>{word}</span>
        {reason !== "" && <div className={`text-[10px] font-body mt-0.5 break-words ${failed ? "text-pz-error font-medium" : "text-pz-on-surface-variant"}`}>{reason}</div>}
      </div>
    </li>
  );
}

function SendDetailPanel({ send, pauseMs, onClose, onCounts }: { send: SendListItem; pauseMs: number; onClose: () => void; onCounts: (c: SendCounts) => void }) {
  const [recipients, setRecipients] = useState<Recipient[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const isEmail = send.channel === "email";

  const load = useCallback(async () => {
    const { status, data } = await call(`${PARTICIPANTS_API}/sends/${send.id}`, "GET");
    if (status !== 200 || !Array.isArray(data.recipients)) {
      setLoadError(typeof data.error === "string" && data.error !== "" ? data.error : "Could not load this message. Try again.");
      return;
    }
    const rows = data.recipients as Recipient[];
    setLoadError(null);
    setRecipients(rows);
    onCounts(countRecipients(rows));
  }, [send.id, onCounts]);

  useEffect(() => {
    void load();
  }, [load]);

  /** One request at a time: a second click while one is working does nothing. */
  async function exclusive(fn: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await fn();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function runToEnd() {
    const result = await runSendLoop(send.id, { pauseMs });
    if (result === "error") setMessage("Sending stopped part way. Some messages may already have gone out. Press Continue sending to carry on.");
    else if (result === "paused") setMessage("Sending paused. Some people are still waiting. Press Continue sending to try again.");
    await load();
  }

  async function resendFailed() {
    await exclusive(async () => {
      setMessage(null);
      const { status, data } = await call(`${PARTICIPANTS_API}/sends/${send.id}/retry`, "POST");
      if (status !== 200) {
        setMessage(typeof data.error === "string" && data.error !== "" ? data.error : "Could not retry the failed ones.");
        return;
      }
      await runToEnd();
    });
  }

  async function continueSending() {
    await exclusive(async () => {
      setMessage(null);
      await runToEnd();
    });
  }

  const counts = recipients ? countRecipients(recipients) : send.counts;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end bg-pz-on-surface/40 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-labelledby="message-detail-title" className="w-full max-w-xl h-full bg-pz-surface-container-lowest shadow-2xl flex flex-col border-l border-pz-surface-container">
        <div className="p-6 border-b border-pz-surface-container bg-pz-surface-container-low/50">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1 min-w-0">
              <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-headline font-bold bg-pz-primary-container text-pz-on-primary-container uppercase tracking-wide">Message details</span>
              <h3 id="message-detail-title" className="text-lg font-headline font-black text-pz-on-surface tracking-tight break-words">{titleOf(send)}</h3>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="w-8 h-8 shrink-0 rounded-lg bg-pz-surface-container hover:bg-pz-surface-container-high text-pz-on-surface-variant flex items-center justify-center transition-colors">
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
          <div className="mt-4 p-3 rounded-xl bg-pz-surface-container-lowest shadow-sm flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-headline font-bold text-pz-on-surface">{whenOf(send)}</span>
              <ChannelChip channel={send.channel} />
            </div>
            {send.senderName && <div className="text-pz-on-surface-variant text-[11px]">Sent by: <span className="font-headline font-bold text-pz-on-surface">{send.senderName}</span></div>}
          </div>
          <div className="mt-3.5 flex items-center justify-between gap-3 flex-wrap">
            <CountPills counts={counts} />
            <div className="flex flex-wrap items-center gap-2">
              {isEmail && counts.waiting > 0 && (
                <button type="button" onClick={() => void continueSending()} disabled={busy} className="inline-flex items-center gap-1.5 px-3.5 py-1.5 max-md:min-h-11 rounded-lg bg-pz-primary-container text-pz-on-primary-container hover:bg-pz-primary-fixed text-xs font-headline font-bold shadow-md transition-all disabled:opacity-50">
                  <Send className="w-3.5 h-3.5" aria-hidden="true" />
                  Continue sending
                </button>
              )}
              {isEmail && counts.failed > 0 && (
                <button type="button" onClick={() => void resendFailed()} disabled={busy} className="inline-flex items-center gap-1.5 px-3.5 py-1.5 max-md:min-h-11 rounded-lg bg-pz-error text-pz-on-error hover:bg-pz-error/90 text-xs font-headline font-bold shadow-md transition-all disabled:opacity-50">
                  {`Resend failed (${counts.failed})`}
                </button>
              )}
            </div>
          </div>
          {isEmail && counts.failed > 0 && (
            <p className="mt-2.5 text-[11px] font-body text-pz-on-surface-variant">Some of these may already have gone out. Check before you resend.</p>
          )}
          {message && <p role="alert" className="mt-2.5 text-xs font-headline font-semibold text-pz-error">{message}</p>}
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {!isEmail ? (
            <WhatsAppSendList sendId={send.id} onClose={onClose} />
          ) : loadError ? (
            <div className="flex flex-col gap-3">
              <p role="alert" className="text-xs font-headline font-semibold text-pz-error">{loadError}</p>
              <button type="button" onClick={() => void load()} className="self-start px-4 py-2 max-md:min-h-11 rounded-lg bg-pz-primary-container text-pz-on-primary-container text-xs font-headline font-bold">Try again</button>
            </div>
          ) : recipients === null ? (
            <p role="status" className="text-xs font-headline font-semibold text-pz-on-surface-variant">Loading the list...</p>
          ) : (
            <>
              <h4 className="text-xs font-headline font-bold text-pz-on-surface uppercase tracking-wider">{`People (${recipients.length})`}</h4>
              <ul className="space-y-2.5">
                {recipients.map((r) => <RecipientRow key={r.id} r={r} />)}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export interface MessagesSentListProps {
  sends: SendListItem[];
  /** Pause between sending runs that made no progress. Tests pass 0. */
  pauseMs?: number;
}

/** Every email and WhatsApp message sent from a campaign, newest first. Admin-only. */
export function MessagesSentList({ sends, pauseMs = 300 }: MessagesSentListProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, SendCounts>>({});
  const open = sends.find((s) => s.id === openId) ?? null;
  const countsOf = (s: SendListItem) => counts[s.id] ?? s.counts;
  const record = useCallback((c: SendCounts) => {
    setCounts((prev) => (openId ? { ...prev, [openId]: c } : prev));
  }, [openId]);

  return (
    <section aria-labelledby="messages-sent-title" className="bg-pz-surface-container-lowest rounded-xl p-6 shadow-sm space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-pz-surface-container pb-4">
        <div>
          <h2 id="messages-sent-title" className="text-base font-headline font-bold text-pz-on-surface">Messages sent</h2>
          <p className="text-xs font-body text-pz-on-surface-variant mt-0.5">Every email and WhatsApp message sent from this campaign</p>
        </div>
        {sends.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-pz-surface-container-low text-xs font-body text-pz-on-surface">
              <span className="font-headline font-semibold">{`${sends.length} ${sends.length === 1 ? "message" : "messages"}`}</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-pz-secondary-container/40 text-xs font-body text-pz-on-secondary-container">
              Last sent <span className="font-headline font-bold">{whenOf(sends[0])}</span>
            </div>
          </div>
        )}
      </div>

      {sends.length === 0 ? (
        <p className="p-4 rounded-lg bg-pz-surface-container-low text-center text-xs text-pz-on-surface-variant font-body">Nothing has been sent from this campaign yet.</p>
      ) : (
        <ul className="space-y-3">
          {sends.map((s) => {
            const whatsapp = s.channel === "whatsapp";
            const Icon = whatsapp ? MessageCircle : Mail;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(s.id)}
                  className="w-full text-left flex flex-col lg:flex-row lg:items-center justify-between p-4 rounded-xl bg-pz-surface-container-low hover:bg-pz-surface-container transition-all group gap-4"
                >
                  <div className="flex items-start md:items-center gap-3.5 min-w-0 flex-1">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${whatsapp ? "bg-pz-primary-container text-pz-on-primary-container" : "bg-pz-surface-container text-pz-on-surface"}`}>
                      <Icon className="w-5 h-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-headline font-bold text-xs text-pz-on-surface group-hover:text-pz-primary transition-colors">{titleOf(s)}</span>
                        <ChannelChip channel={s.channel} />
                        <span className="text-[11px] font-body text-pz-on-surface-variant">{whenOf(s)}</span>
                      </div>
                      {s.senderName && (
                        <div className="text-xs font-body text-pz-on-surface-variant">
                          Sent by: <strong className="font-headline text-pz-on-surface font-semibold">{s.senderName}</strong>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 self-end lg:self-auto shrink-0">
                    <CountPills counts={countsOf(s)} />
                    <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-pz-surface-container-lowest text-pz-on-surface-variant group-hover:text-pz-primary text-xs font-headline font-semibold transition-all">
                      View details
                      <ChevronRight className="w-4 h-4" aria-hidden="true" />
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {open && <SendDetailPanel key={open.id} send={{ ...open, counts: countsOf(open) }} pauseMs={pauseMs} onClose={() => setOpenId(null)} onCounts={record} />}
    </section>
  );
}
