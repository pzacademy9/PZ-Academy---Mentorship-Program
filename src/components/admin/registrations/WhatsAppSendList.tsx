"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, CheckCircle2, Globe, Laptop, MessageCircle, PhoneOff } from "lucide-react";
import { renderParticipantTags } from "@/lib/landing/participants/merge";
import { buildWhatsAppLink } from "@/lib/crm/whatsapp-link";
import { linkForMode, linkTargetProps, readMode, writeMode, type WhatsAppMode } from "@/lib/crm/whatsapp-mode";
import { normalizePhone } from "@/lib/crm/phone";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import type { RegistrationStatus } from "@/lib/landing/registration/config";
import { STATUS_CHIP, STATUS_LABEL } from "./SendSummary";

const API = "/api/admin/participants/sends";
/** Same storage scope idea as the Sales Hub, with its own name so the two choices stay separate. */
const MODE_SCOPE = "participants";

type Recipient = {
  id: string;
  registration_id: string;
  name: string;
  phone: string;
  state: string;
  reason: string;
  sent_at: string | null;
  status_at_send: string;
};
type Detail = { body: string; recipients: Recipient[]; refIds: Record<string, string>; portalUrl: string | null };
type Filter = "all" | "todo" | "done" | "missing";

const SKIP_WORDS: Record<string, string> = {
  no_phone: "No phone number",
  merged: "Merged into another registration",
  unsubscribed: "Asked not to be contacted",
  no_email: "No email",
};

const timeLabel = (iso: string | null): string => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Karachi" }).replace(" AM", " am").replace(" PM", " pm");
};

const leftOutWord = (r: Recipient): string => {
  if (r.state === "skipped" && r.reason !== "no_phone") return SKIP_WORDS[r.reason] ?? "Left out";
  return r.phone.trim() === "" ? "No phone number" : "Number not valid";
};

const initials = (name: string): string =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join("");

async function request(url: string, method: "GET" | "PATCH", body?: unknown): Promise<{ status: number; data: Record<string, unknown> }> {
  try {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: res.status, data };
  } catch {
    return { status: 0, data: {} };
  }
}

export interface WhatsAppSendListProps {
  sendId: string;
  /** Called when the owner leaves the list. */
  onClose: () => void;
}

export function WhatsAppSendList({ sendId, onClose }: WhatsAppSendListProps) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [mode, setMode] = useState<WhatsAppMode | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [marking, setMarking] = useState<Set<string>>(new Set());
  const markingRef = useRef<Set<string>>(new Set());
  const desktop = useMediaQuery("(min-width: 1024px)");

  useEffect(() => setMode(readMode(MODE_SCOPE)), []);

  const load = useCallback(async () => {
    setLoadError(null);
    const { status, data } = await request(`${API}/${sendId}`, "GET");
    const send = data.send as { body?: unknown } | undefined;
    if (status !== 200 || !Array.isArray(data.recipients) || typeof send?.body !== "string") {
      setLoadError(typeof data.error === "string" && data.error !== "" ? data.error : "Could not load the list. Try again.");
      return;
    }
    setDetail({
      body: send.body,
      recipients: data.recipients as Recipient[],
      refIds: (typeof data.refIds === "object" && data.refIds !== null ? data.refIds : {}) as Record<string, string>,
      portalUrl: typeof data.portalUrl === "string" ? data.portalUrl : null,
    });
  }, [sendId]);

  useEffect(() => {
    void load();
  }, [load]);

  function chooseMode(next: WhatsAppMode) {
    setMode(next);
    writeMode(MODE_SCOPE, next);
  }

  async function markSent(r: Recipient) {
    if (markingRef.current.has(r.id)) return;
    markingRef.current.add(r.id);
    setMarking(new Set(markingRef.current));
    setRowError(null);
    try {
      const { status, data } = await request(`${API}/${sendId}/recipients/${r.id}`, "PATCH", { sent: true });
      if (status === 200) {
        const at = new Date().toISOString();
        setDetail((d) => (d ? { ...d, recipients: d.recipients.map((x) => (x.id === r.id ? { ...x, state: "sent", sent_at: at } : x)) } : d));
      } else {
        setRowError(typeof data.error === "string" && data.error !== "" ? data.error : "Could not mark this one as sent. Try again.");
      }
    } finally {
      markingRef.current.delete(r.id);
      setMarking(new Set(markingRef.current));
    }
  }

  if (loadError) {
    return (
      <div className="p-6 sm:p-7 flex flex-col gap-3">
        <p role="alert" className="text-xs font-headline font-semibold text-pz-error">{loadError}</p>
        <div className="flex gap-3">
          <button type="button" onClick={() => void load()} className="px-5 py-2.5 max-md:min-h-11 rounded-lg bg-pz-primary-container text-pz-on-primary-container font-headline font-bold text-sm">Try again</button>
          <button type="button" onClick={onClose} className="px-5 py-2.5 max-md:min-h-11 rounded-lg text-sm font-headline font-semibold text-pz-on-surface-variant bg-pz-surface-container hover:bg-pz-surface-container-high transition-all">Back to the campaign</button>
        </div>
      </div>
    );
  }
  if (!detail) {
    return <p className="p-6 sm:p-7 text-xs font-headline font-semibold text-pz-on-surface-variant" role="status">Loading the list...</p>;
  }

  const rows = detail.recipients.map((r) => {
    const phone = normalizePhone(r.phone);
    const sendable = r.state !== "skipped" && phone.ok;
    return { r, e164: phone.ok ? phone.e164 : "", sendable };
  });
  const sendableRows = rows.filter((x) => x.r.state !== "skipped" && x.sendable);
  const total = sendableRows.length;
  const sentCount = sendableRows.filter((x) => x.r.state === "sent").length;
  const pct = total > 0 ? Math.round((sentCount / total) * 100) : 0;
  const todo = rows.filter((x) => x.sendable && x.r.state !== "sent");
  const done = rows.filter((x) => x.r.state === "sent");
  const missing = rows.filter((x) => !x.sendable && x.r.state !== "sent");
  const nextId = todo[0]?.r.id ?? null;
  const shown = filter === "all" ? rows : filter === "todo" ? todo : filter === "done" ? done : missing;
  const target = linkTargetProps(mode, desktop);
  const activeMode: WhatsAppMode = mode ?? "app";

  const filters: { key: Filter; label: string }[] = [
    { key: "all", label: `All (${rows.length})` },
    { key: "todo", label: `To send (${todo.length})` },
    { key: "done", label: `Sent (${done.length})` },
    { key: "missing", label: `Left out (${missing.length})` },
  ];

  return (
    <div className="px-6 sm:px-7 py-4 flex flex-col gap-5">
      {/* Progress */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-base font-headline font-bold text-pz-on-surface">Your WhatsApp list</span>
          <div className="flex items-center gap-2">
            <span className="text-xs font-headline font-semibold text-pz-on-surface">{`Sent ${sentCount} of ${total}`}</span>
            <span className="px-2 py-0.5 rounded-full text-xs font-headline font-bold bg-pz-primary-container text-pz-on-primary-container">{pct}%</span>
          </div>
        </div>
        <div className="w-full h-2 rounded-full bg-pz-surface-container-high overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full bg-pz-primary-container rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Web or app */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-3.5 rounded-lg bg-pz-surface-container-low">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-headline font-bold uppercase tracking-wider text-pz-outline">Open WhatsApp in</span>
          <div className="inline-flex p-1 bg-pz-surface-container rounded-lg">
            <button
              type="button"
              aria-pressed={activeMode === "web"}
              onClick={() => chooseMode("web")}
              className={`flex items-center gap-1.5 px-3 py-1 max-md:min-h-11 rounded text-xs font-headline transition-all ${activeMode === "web" ? "bg-pz-surface-container-lowest shadow-sm font-bold text-pz-primary" : "font-medium text-pz-on-surface-variant hover:text-pz-on-surface"}`}
            >
              <Globe className="w-4 h-4" aria-hidden="true" />
              WhatsApp Web
            </button>
            <button
              type="button"
              aria-pressed={activeMode === "app"}
              onClick={() => chooseMode("app")}
              className={`flex items-center gap-1.5 px-3 py-1 max-md:min-h-11 rounded text-xs font-headline transition-all ${activeMode === "app" ? "bg-pz-surface-container-lowest shadow-sm font-bold text-pz-primary" : "font-medium text-pz-on-surface-variant hover:text-pz-on-surface"}`}
            >
              <Laptop className="w-4 h-4" aria-hidden="true" />
              WhatsApp Desktop
            </button>
          </div>
        </div>
        <span className="text-xs text-pz-on-surface-variant sm:text-right">Opening a chat does not mark it sent. Press Mark sent after you send it.</span>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-1.5 overflow-x-auto border-b border-pz-surface-container pb-3">
        {filters.map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1 max-md:min-h-11 rounded-md text-xs font-headline whitespace-nowrap ${filter === f.key ? "bg-pz-surface-container-highest text-pz-on-surface font-bold" : "text-pz-on-surface-variant hover:bg-pz-surface-container font-medium"}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {rowError && <p role="alert" className="text-xs font-headline font-semibold text-pz-error">{rowError}</p>}

      {/* Rows */}
      <ul className="flex flex-col gap-2.5">
        {shown.map(({ r, e164, sendable }) => {
          const status = r.status_at_send as RegistrationStatus;
          const chip = STATUS_CHIP[status] ? (
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-headline font-semibold ${STATUS_CHIP[status]}`}>{STATUS_LABEL[status]}</span>
          ) : null;

          if (r.state === "sent") {
            return (
              <li key={r.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-lg bg-pz-surface-container-low/60 opacity-80 gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-pz-surface-container-high flex items-center justify-center shrink-0">
                    <Check className="w-4 h-4 text-pz-outline" aria-hidden="true" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-headline font-bold text-pz-on-surface truncate">{r.name}</span>
                      {chip}
                    </div>
                    <span className="text-[11px] text-pz-outline">{e164 || r.phone}</span>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 self-end sm:self-auto rounded-full text-xs font-headline font-semibold bg-pz-surface-container text-pz-outline">
                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                  {`Sent ${timeLabel(r.sent_at)}`.trim()}
                </span>
              </li>
            );
          }

          if (!sendable) {
            return (
              <li key={r.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-lg bg-pz-secondary-fixed/15 opacity-75 gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-pz-surface-container-high flex items-center justify-center text-pz-outline shrink-0">
                    <PhoneOff className="w-4 h-4" aria-hidden="true" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-headline font-bold text-pz-on-surface truncate">{r.name}</span>
                      {chip}
                      <span className="px-2 py-0.5 rounded text-[10px] font-headline font-bold bg-pz-error-container text-pz-on-error-container">
                        {leftOutWord(r)}
                      </span>
                    </div>
                  </div>
                </div>
              </li>
            );
          }

          const text = renderParticipantTags(detail.body, { name: r.name, refId: detail.refIds[r.registration_id] ?? "", portalUrl: detail.portalUrl }, "text");
          const href = linkForMode(buildWhatsAppLink(e164, text, ""), mode);
          const isNext = r.id === nextId;
          return (
            <li
              key={r.id}
              className={isNext
                ? "flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl bg-pz-surface-container-lowest shadow-[0_4px_20px_rgba(36,109,0,0.12)] gap-4"
                : "flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-lg bg-pz-surface-container-low/60 gap-3"}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className={`${isNext ? "w-10 h-10 bg-pz-primary-container text-pz-on-primary-container text-sm" : "w-8 h-8 bg-pz-surface-container-high text-pz-on-surface-variant text-xs"} rounded-full flex items-center justify-center shrink-0 font-headline font-bold`} aria-hidden="true">
                  {initials(r.name)}
                </div>
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`${isNext ? "text-sm font-black" : "text-xs font-bold"} font-headline text-pz-on-surface truncate`}>{r.name}</span>
                    {chip}
                    {isNext && <span className="text-xs text-pz-primary font-bold hidden md:inline">Next up</span>}
                  </div>
                  <span className="text-xs text-pz-on-surface-variant mt-0.5">{e164}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                <a
                  href={href}
                  {...target}
                  aria-label={`Open WhatsApp for ${r.name}`}
                  className="px-4 py-2 max-md:min-h-11 rounded-lg bg-pz-primary text-pz-on-primary hover:bg-pz-on-primary-container font-headline font-bold text-xs tracking-wide transition-all shadow-sm inline-flex items-center gap-1.5"
                >
                  <MessageCircle className="w-4 h-4" aria-hidden="true" />
                  Open WhatsApp
                </a>
                <button
                  type="button"
                  onClick={() => void markSent(r)}
                  disabled={marking.has(r.id)}
                  aria-label={`Mark ${r.name} as sent`}
                  className="px-3 py-2 max-md:min-h-11 rounded-lg bg-pz-surface-container hover:bg-pz-surface-container-high text-pz-on-surface font-headline font-bold text-xs transition-colors disabled:opacity-60"
                >
                  Mark sent
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex justify-end pt-1">
        <button type="button" onClick={onClose} className="w-full sm:w-auto px-6 py-3 max-md:min-h-11 rounded-lg bg-pz-primary-container text-pz-on-primary-container font-headline font-bold text-sm">
          Back to the campaign
        </button>
      </div>
    </div>
  );
}
