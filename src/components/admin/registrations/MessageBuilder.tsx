"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BookmarkPlus, Eye, Info, Send, X } from "lucide-react";
import type { Summary } from "@/lib/landing/participants/types";
import { PARTICIPANT_TAGS, renderParticipantTags, usesPzId } from "@/lib/landing/participants/merge";
import type { RecipientPreview } from "@/lib/data/audience-preview";
import { RecipientPreviewLists } from "@/components/admin/shared/RecipientPreviewLists";
import type { BuilderChannel, CampaignBuilderRequest } from "./CampaignRegistrations";
import { buildRecipientBody } from "./builder-body";
import { SendSummary, skippedTotal } from "./SendSummary";
import { WhatsAppSendList } from "./WhatsAppSendList";
import { PARTICIPANTS_API, call, runSendLoop } from "./run-send";

const API = PARTICIPANTS_API;

type Template = { id: string; name: string; subject: string; emailBody: string; whatsappBody: string };
type Step = "edit" | "review" | "sending" | "done" | "list";
type Progress = { sent: number; failed: number; total: number };
/** What the server recorded for the send, counted from its recipient rows. */
type Recorded = { sent: number; failed: number; skipped: number };

const TAG_LABEL: Record<string, string> = {
  first_name: "First name",
  full_name: "Full name",
  ref_id: "Reference number",
  portal_link: "Portal link",
  pz_id: "PZ ID",
};

const CHANNEL_WORD: Record<BuilderChannel, string> = { email: "email", whatsapp: "WhatsApp message" };
const CHANNEL_LABEL: Record<BuilderChannel, string> = { email: "Email", whatsapp: "WhatsApp" };

const errorText = (data: Record<string, unknown>, fallback: string): string =>
  typeof data.error === "string" && data.error !== "" ? data.error : fallback;

const inputBase =
  "w-full bg-pz-surface-container-low text-pz-on-surface text-sm rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-pz-primary shadow-sm disabled:opacity-60";
const labelBase = "text-xs font-headline font-bold uppercase tracking-wider text-pz-on-surface-variant";

export interface MessageBuilderProps {
  /** Which kind of message is being written. WhatsApp ends in a list of links; the server sends nothing. */
  channel: BuilderChannel;
  request: CampaignBuilderRequest;
  /** `sent` is true when at least one send was started, so the page can refresh its lists. */
  onClose: (sent: boolean) => void;
  /** Pause between runs that made no progress. Tests pass 0. */
  pauseMs?: number;
}

export function MessageBuilder({ channel, request, onClose, pauseMs = 300 }: MessageBuilderProps) {
  const { pageId, pageTitle, selection } = request;
  const word = CHANNEL_WORD[channel];
  const isEmail = channel === "email";

  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [subject, setSubject] = useState(request.starter?.subject ?? "");
  const [body, setBody] = useState(request.starter?.body ?? "");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateMsg, setTemplateMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  const [step, setStep] = useState<Step>("edit");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [ack, setAck] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  /** The create request got no answer: it may have gone through, so no second send until a fresh review. */
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [sendId, setSendId] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress>({ sent: 0, failed: 0, total: 0 });
  const [runError, setRunError] = useState<string | null>(null);
  const [recorded, setRecorded] = useState<Recorded | null>(null);
  /** Who would and would not get the email, loaded when the review opens. */
  const [lists, setLists] = useState<{ state: "loading" } | { state: "error" } | { state: "ready"; preview: RecipientPreview }>({ state: "loading" });
  const listsToken = useRef(0);

  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const startedRef = useRef(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let live = true;
    void call(`${API}/templates`, "GET").then(({ status, data }) => {
      if (live && status === 200 && Array.isArray(data.templates)) setTemplates(data.templates as Template[]);
    });
    return () => {
      live = false;
    };
  }, []);

  /** Runs one request at a time. A second click while one is in flight does nothing. */
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

  const recipients = () => buildRecipientBody(pageId, selection);
  const ready = body.trim() !== "" && (!isEmail || subject.trim() !== "");

  // ---- Email-specific: editor sections --------------------------------------------------------

  function pickTemplate(id: string) {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    if (isEmail) {
      setSubject(t.subject);
      setBody(t.emailBody);
    } else {
      setBody(t.whatsappBody);
    }
  }

  function insertTag(tag: string) {
    const text = `{{ ${tag} }}`;
    const el = bodyRef.current;
    const start = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? body.length;
    setBody(body.slice(0, start) + text + body.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + text.length, start + text.length);
    });
  }

  async function saveTemplate() {
    await exclusive(async () => {
      const { status, data } = await call(`${API}/templates`, "POST", {
        name: templateName,
        subject: isEmail ? subject : "",
        emailBody: isEmail ? body : "",
        whatsappBody: isEmail ? "" : body,
      });
      if (status === 201 || status === 200) {
        const t = data.template as Template;
        setTemplates((prev) => [...prev.filter((x) => x.id !== t.id), t].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())));
        setTemplateId(t.id);
        setSavingTemplate(false);
        setTemplateName("");
        setTemplateMsg({ ok: true, text: "Template saved." });
      } else {
        setTemplateMsg({ ok: false, text: errorText(data, "Could not save the template") });
      }
    });
  }

  async function sendTest() {
    await exclusive(async () => {
      setTestMsg(null);
      const { status, data } = await call(`${API}/test`, "POST", { pageId, subject, body });
      if (status === 200) setTestMsg({ ok: true, text: "Test email sent to you." });
      else setTestMsg({ ok: false, text: errorText(data, "Test send failed. Check the email settings.") });
    });
  }

  // ---- Shared steps ---------------------------------------------------------------------------

  async function review() {
    await exclusive(async () => {
      setEditError(null);
      const { status, data } = await call(`${API}/preview`, "POST", { pageId, channel, ...recipients(), ...(isEmail ? { subject, body } : {}) });
      if (status !== 200 || typeof data.summary !== "object" || data.summary === null) {
        setEditError(errorText(data, "Could not build the list of people. Try again."));
        return;
      }
      setSummary(data.summary as Summary);
      setAck(false);
      setNotice(null);
      setUnconfirmed(false);
      setStep("review");
      void loadLists();
    });
  }

  /** Loads the two lists. Only the newest request may set the result. */
  async function loadLists() {
    if (!isEmail) return;
    const token = (listsToken.current += 1);
    setLists({ state: "loading" });
    const { status, data } = await call(`${API}/recipients`, "POST", {
      pageId, ...recipients(), requirePzId: usesPzId(body) || usesPzId(subject),
    });
    if (token !== listsToken.current) return;
    if (status === 200 && Array.isArray(data.receiving) && Array.isArray(data.notReceiving)) {
      setLists({ state: "ready", preview: data as unknown as RecipientPreview });
    } else {
      setLists({ state: "error" });
    }
  }

  async function runLoop(id: string, start: Progress, total: number) {
    setStep("sending");
    setRunError(null);
    setRecorded(null);
    const result = await runSendLoop(id, {
      start,
      pauseMs,
      onProgress: (sent, failed) => setProgress({ sent, failed, total }),
    });
    if (result === "error") {
      setRunError("Sending stopped part way. Some messages may already have gone out. Press Continue sending to carry on.");
    } else if (result === "done") {
      await loadRecorded(id);
      setStep("done");
    } else {
      setRunError("Sending paused. Some people are still waiting. Press Continue sending to try again.");
    }
  }

  /** The server's own count of what happened, so the result line never mixes in preview figures. */
  async function loadRecorded(id: string) {
    const { status, data } = await call(`${API}/sends/${id}`, "GET");
    if (status !== 200 || !Array.isArray(data.recipients)) return;
    const states = (data.recipients as { state?: string }[]).map((r) => r.state);
    const n = (st: string) => states.filter((x) => x === st).length;
    setRecorded({ sent: n("sent"), failed: n("failed"), skipped: n("skipped") });
  }

  async function confirm() {
    if (!summary) return;
    await exclusive(async () => {
      setNotice(null);
      const { status, data } = await call(`${API}/sends`, "POST", {
        pageId,
        channel,
        ...recipients(),
        subject: isEmail ? subject : "",
        body,
        ...(templateId ? { templateId } : {}),
        expectedCount: summary.total,
        expectedNotPaid: summary.notPaid,
        confirmNotPaid: summary.notPaid > 0 && ack,
      });
      if (status === 409) {
        // Never retried automatically: the owner looks again.
        if (data.code === "count_changed") {
          setAck(false);
          if (typeof data.summary === "object" && data.summary !== null) {
            setSummary(data.summary as Summary);
          } else {
            // The server sent no new figures: ask once for them (a preview never sends anything).
            const again = await call(`${API}/preview`, "POST", { pageId, channel, ...recipients(), ...(isEmail ? { subject, body } : {}) });
            if (again.status === 200 && typeof again.data.summary === "object" && again.data.summary !== null) {
              setSummary(again.data.summary as Summary);
            } else {
              setEditError(errorText(again.data, "Could not build the list of people. Try again."));
              setStep("edit");
              return;
            }
          }
          setNotice("The list changed. Review it again.");
          void loadLists();
        } else {
          setNotice(errorText(data, "This could not be sent."));
        }
        setStep("review");
        return;
      }
      if (status === 0) {
        setUnconfirmed(true);
        setNotice("Could not confirm the send started. Check Messages sent before trying again.");
        return;
      }
      if (status < 200 || status >= 300 || typeof data.sendId !== "string") {
        setNotice(errorText(data, "Could not start the send. Nothing was sent."));
        return;
      }
      startedRef.current = true;
      const total = typeof data.count === "number" ? data.count : summary.total;
      setSendId(data.sendId);
      if (!isEmail) {
        // The server sends nothing for WhatsApp: the owner opens each chat from the list.
        setStep("list");
        return;
      }
      const first = { sent: 0, failed: 0, total };
      setProgress(first);
      await runLoop(data.sendId, first, total);
    });
  }

  async function continueSending() {
    if (!sendId) return;
    await exclusive(() => runLoop(sendId, progress, progress.total));
  }

  async function resendFailed() {
    if (!sendId) return;
    await exclusive(async () => {
      const { status, data } = await call(`${API}/sends/${sendId}/retry`, "POST");
      if (status !== 200) {
        setRunError(errorText(data, "Could not retry the failed ones."));
        return;
      }
      await runLoop(sendId, { sent: progress.sent, failed: 0, total: progress.total }, progress.total);
    });
  }

  function close() {
    if (busy) return;
    onClose(startedRef.current);
  }

  const reviewing = step !== "edit";
  const locked = busy || reviewing;
  const running = step === "sending";
  const failedCount = recorded ? recorded.failed : progress.failed;
  const pct = progress.total > 0 ? Math.min(100, Math.round((progress.sent / progress.total) * 100)) : 0;
  const listsReady = !isEmail || lists.state === "ready";
  const canConfirm = !!summary && summary.total > 0 && (summary.notPaid === 0 || ack) && !busy && !unconfirmed && step === "review" && listsReady;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-pz-surface text-pz-on-surface" role="region" aria-label={`Write an ${word}`}>
      {/* Top bar */}
      <div className="w-full px-6 lg:px-8 py-6 bg-pz-surface-container-lowest shadow-[0_1px_4px_rgba(0,0,0,0.03)] flex flex-col gap-4">
        <nav className="flex items-center gap-2 text-xs font-headline font-semibold text-pz-outline uppercase tracking-wider">
          <span>All campaigns</span>
          <span aria-hidden="true">/</span>
          <span>{pageTitle}</span>
          <span aria-hidden="true">/</span>
          <span className="text-pz-primary font-bold">{CHANNEL_LABEL[channel]}</span>
        </nav>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 flex-wrap">
            <h1 className="font-headline font-extrabold text-2xl lg:text-3xl text-pz-on-surface tracking-tight">
              {`${CHANNEL_LABEL[channel]} to the selected registrations - ${pageTitle}`}
            </h1>
          </div>
          <button
            type="button"
            onClick={close}
            disabled={locked}
            className="self-end md:self-auto px-4 py-2.5 max-md:min-h-11 rounded-lg text-sm font-headline font-semibold text-pz-on-surface-variant bg-pz-surface-container-low hover:bg-pz-surface-container-high transition-all flex items-center gap-2 shadow-sm disabled:opacity-60"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            Cancel and back
          </button>
        </div>
      </div>

      <div className="w-full max-w-[1400px] mx-auto px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Composer */}
          <section className="lg:col-span-7 flex flex-col gap-6">
            <div className="bg-pz-surface-container-lowest rounded-xl p-6 lg:p-7 shadow-[0_4px_24px_rgba(15,30,20,0.04)] flex flex-col gap-5">
              {/* EMAIL: template picker */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="builder-template" className={labelBase}>Template</label>
                  <button
                    type="button"
                    onClick={() => { setSavingTemplate((v) => !v); setTemplateMsg(null); }}
                    className="text-xs font-headline font-bold text-pz-primary hover:text-pz-on-primary-container dark:hover:text-pz-primary-fixed transition-colors flex items-center gap-1"
                  >
                    <BookmarkPlus className="w-4 h-4" aria-hidden="true" />
                    Save as template
                  </button>
                </div>
                <select
                  id="builder-template"
                  value={templateId}
                  onChange={(e) => pickTemplate(e.target.value)}
                  disabled={locked}
                  className={`${inputBase} font-medium`}
                >
                  <option value="">Start from scratch</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                {savingTemplate && (
                  <div className="flex flex-wrap items-end gap-2 bg-pz-surface-container-low rounded-lg p-3">
                    <div className="flex-1 min-w-48 flex flex-col gap-1">
                      <label htmlFor="builder-template-name" className="text-xs font-headline font-semibold text-pz-on-surface-variant">Template name</label>
                      <input
                        id="builder-template-name"
                        value={templateName}
                        onChange={(e) => setTemplateName(e.target.value)}
                        maxLength={120}
                        className="w-full bg-pz-surface-container-lowest text-pz-on-surface text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-pz-primary"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => void saveTemplate()}
                      disabled={locked || templateName.trim() === ""}
                      className="px-4 py-2 max-md:min-h-11 rounded-lg bg-pz-primary-container text-pz-on-primary-container text-xs font-headline font-bold disabled:opacity-50"
                    >
                      Save template
                    </button>
                  </div>
                )}
                {templateMsg && (
                  <p role="status" className={`text-xs font-headline font-semibold ${templateMsg.ok ? "text-pz-tertiary" : "text-pz-error"}`}>{templateMsg.text}</p>
                )}
              </div>

              {/* EMAIL: subject */}
              {isEmail && (
                <div className="flex flex-col gap-2">
                  <label htmlFor="builder-subject" className={labelBase}>Subject</label>
                  <div className="relative">
                    <input
                      id="builder-subject"
                      type="text"
                      value={subject}
                      maxLength={300}
                      onChange={(e) => setSubject(e.target.value)}
                      disabled={locked}
                      className={`${inputBase} font-headline font-medium pr-24`}
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[11px] text-pz-outline">{subject.length} characters</span>
                  </div>
                </div>
              )}

              {/* Tag chips */}
              <div className="flex flex-col gap-2 pt-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-headline font-semibold text-pz-on-surface-variant">Insert a name or link for each person:</span>
                  <span className="text-xs text-pz-secondary font-medium">Click to add it where the cursor is</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {PARTICIPANT_TAGS.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => insertTag(tag)}
                      disabled={locked}
                      className="inline-flex items-center gap-1 px-3 py-1.5 max-md:min-h-11 rounded-lg bg-pz-surface-container-high hover:bg-pz-primary-container/40 text-pz-on-surface hover:text-pz-on-primary-container text-xs font-headline font-medium transition-all shadow-sm disabled:opacity-60"
                    >
                      {TAG_LABEL[tag] ?? tag}
                    </button>
                  ))}
                </div>
              </div>

              {/* EMAIL: message */}
              <div className="flex flex-col gap-2">
                <label htmlFor="builder-message" className={labelBase}>Message</label>
                <textarea
                  id="builder-message"
                  ref={bodyRef}
                  rows={12}
                  value={body}
                  maxLength={20000}
                  onChange={(e) => setBody(e.target.value)}
                  disabled={locked}
                  className="w-full bg-pz-surface-container-low text-pz-on-surface text-sm leading-relaxed rounded-lg p-4 focus:outline-none focus:ring-2 focus:ring-pz-primary shadow-inner resize-y disabled:opacity-60"
                />
                <div className="flex items-center gap-2 px-3 py-2 bg-pz-surface-container rounded-lg text-xs text-pz-on-surface-variant font-medium">
                  <Info className="w-4 h-4 text-pz-secondary shrink-0" aria-hidden="true" />
                  <span>
                    {isEmail
                      ? "Links you paste become clickable. An unsubscribe link is added at the bottom automatically."
                      : "WhatsApp formatting works here: *bold*, _italic_, ~strikethrough~. Links become clickable once the message is sent."}
                  </span>
                </div>
              </div>

              {editError && (
                <p role="alert" className="text-xs font-headline font-semibold text-pz-error">{editError}</p>
              )}
              {testMsg && (
                <p role="status" className={`text-xs font-headline font-semibold ${testMsg.ok ? "text-pz-tertiary" : "text-pz-error"}`}>{testMsg.text}</p>
              )}

              {/* Actions */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-pz-surface-container-low/40 p-4 rounded-xl">
                {isEmail ? (
                  <button
                    type="button"
                    onClick={() => void sendTest()}
                    disabled={locked || body.trim() === ""}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 max-md:min-h-11 rounded-lg bg-pz-surface-container-lowest text-pz-on-surface text-sm font-headline font-semibold shadow-sm hover:bg-pz-surface-container-high transition-all disabled:opacity-50"
                  >
                    <Send className="w-4 h-4 text-pz-tertiary" aria-hidden="true" />
                    Send test to me
                  </button>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  onClick={() => void review()}
                  disabled={locked || !ready}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 max-md:min-h-11 rounded-lg bg-pz-primary-container text-pz-on-primary-container hover:bg-pz-primary-fixed font-headline font-bold text-sm shadow-md transition-all disabled:opacity-50"
                >
                  Review and send
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          </section>

          {/* EMAIL: example of what one person gets */}
          <section className="lg:col-span-5 flex flex-col gap-4">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-pz-primary" aria-hidden="true" />
                <span className="font-headline font-bold text-sm text-pz-on-surface">What one person will see</span>
              </div>
              <span className="text-xs text-pz-secondary font-medium">Example person</span>
            </div>
            <div className="bg-pz-surface-container-lowest rounded-xl shadow-[0_4px_24px_rgba(15,30,20,0.06)] overflow-hidden">
              {isEmail && (
                <div className="p-5 bg-pz-surface-container-low/60 flex flex-col gap-1 text-xs">
                  <span className="text-[11px] font-headline font-bold text-pz-outline uppercase">Subject</span>
                  <span className="font-headline font-bold text-pz-primary">{renderExample(subject) || "Your subject appears here"}</span>
                </div>
              )}
              <div className="p-6 text-sm leading-relaxed whitespace-pre-wrap break-words text-pz-on-surface">
                {renderExample(body) || "Your message appears here."}
              </div>
              {isEmail && (
                <div className="px-6 py-4 bg-pz-surface-container-low text-[11px] text-pz-outline">
                  Unsubscribe link (added automatically)
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Review / send */}
      {reviewing && summary && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 bg-pz-on-surface/40 backdrop-blur-md overflow-y-auto">
          <div role="dialog" aria-modal="true" aria-labelledby="builder-review-title" className={`relative w-full ${step === "list" ? "max-w-3xl" : "max-w-2xl"} bg-pz-surface-container-lowest rounded-2xl shadow-[0_20px_60px_rgba(15,30,20,0.18)] overflow-hidden my-8 flex flex-col`}>
            <div className="h-2 w-full bg-gradient-to-r from-pz-primary via-pz-primary-container to-pz-secondary-container" />
            <div className="p-6 sm:p-7 pb-4 flex items-start justify-between gap-3">
              <div className="flex flex-col">
                <h2 id="builder-review-title" className="font-headline font-extrabold text-xl sm:text-2xl text-pz-on-surface tracking-tight">
                  {step === "list" ? "Your WhatsApp list is ready" : step === "done" ? "Sending finished" : running ? "Sending" : `Review and confirm ${word}`}
                </h2>
                <p className="text-xs sm:text-sm text-pz-on-surface-variant mt-0.5">
                  {step === "list" ? "Open each chat, send the message, then press Mark sent." : null}
                  {step !== "list" && <>You are about to {channel === "email" ? "email" : "message"} <strong className="text-pz-on-surface font-semibold">{`${summary.total} ${summary.total === 1 ? "person" : "people"}`}</strong> in {pageTitle}.</>}
                </p>
              </div>
              {step === "review" && (
                <button type="button" onClick={() => setStep("edit")} disabled={busy} aria-label="Close" className="w-8 h-8 shrink-0 rounded-lg bg-pz-surface-container hover:bg-pz-surface-container-high text-pz-on-surface-variant flex items-center justify-center transition-colors disabled:opacity-50">
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              )}
            </div>

            {step === "review" && (
              <SendSummary summary={summary} channelWord={word} acknowledged={ack} onAcknowledge={setAck} disabled={busy} notice={notice} />
            )}

            {step === "review" && isEmail && (
              <div className="px-6 sm:px-7 py-2 flex flex-col gap-2">
                {lists.state === "loading" && <p role="status" className="text-base text-pz-on-surface-variant">Loading the list of people...</p>}
                {lists.state === "error" && (
                  <div role="alert" className="flex flex-col gap-2">
                    <p className="text-base font-headline font-semibold text-pz-error">Could not load the list of people. You cannot send until you have seen it.</p>
                    <button type="button" onClick={() => void loadLists()} className="w-full sm:w-auto px-5 py-2.5 min-h-12 rounded-lg text-sm font-headline font-semibold text-pz-on-surface-variant bg-pz-surface-container hover:bg-pz-surface-container-high transition-all">
                      Try again
                    </button>
                  </div>
                )}
                {lists.state === "ready" && (
                  <RecipientPreviewLists preview={lists.preview} receivingTitle="Getting this email" notReceivingTitle="Not getting this email" />
                )}
              </div>
            )}

            {step === "list" && sendId && <WhatsAppSendList sendId={sendId} onClose={close} />}

            {(running || step === "done") && (
              <div className="px-6 sm:px-7 py-2">
                <div className="rounded-xl bg-pz-surface-container-low p-4 flex flex-col gap-2.5">
                  <div className="flex justify-between text-xs font-headline font-semibold text-pz-on-surface-variant">
                    <span>{step === "done" ? "Done" : "Sending"}</span>
                    <span>{step === "done" ? recorded ? `Sent ${recorded.sent}, failed ${recorded.failed}, skipped ${recorded.skipped}` : `Sent ${progress.sent}, failed ${progress.failed} (${skippedTotal(summary)} left out before sending)` : `Sent ${progress.sent} of ${progress.total}`}</span>
                  </div>
                  <div className="w-full h-2.5 bg-pz-surface-container-highest rounded-full overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                    <div className="h-full bg-pz-primary-container rounded-full transition-all duration-500" style={{ width: `${step === "done" ? 100 : pct}%` }} />
                  </div>
                  {runError && <p role="alert" className="text-xs font-headline font-semibold text-pz-error">{runError}</p>}
                </div>
              </div>
            )}

            {step !== "list" && (
            <div className="p-6 bg-pz-surface-container-low flex flex-col sm:flex-row items-center justify-between gap-3 mt-2">
              {step === "review" && (
                <>
                  <button type="button" onClick={() => setStep("edit")} disabled={busy} className="w-full sm:w-auto px-5 py-2.5 max-md:min-h-11 rounded-lg text-sm font-headline font-semibold text-pz-on-surface-variant bg-pz-surface-container hover:bg-pz-surface-container-high transition-all disabled:opacity-50">
                    Back to editing
                  </button>
                  <button
                    type="button"
                    onClick={() => void confirm()}
                    disabled={!canConfirm}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 max-md:min-h-11 rounded-lg bg-pz-primary-container text-pz-on-primary-container hover:bg-pz-primary-fixed font-headline font-bold text-sm shadow-md transition-all disabled:bg-pz-surface-container-high disabled:text-pz-outline disabled:shadow-none disabled:cursor-not-allowed"
                  >
                    <Send className="w-4 h-4" aria-hidden="true" />
                    {`Confirm and send (${summary.total} ${summary.total === 1 ? (isEmail ? "email" : "message") : isEmail ? "emails" : "messages"})`}
                  </button>
                </>
              )}
              {running && (
                <>
                  <span className="text-xs text-pz-on-surface-variant">Keep this window open until it finishes.</span>
                  {runError && (
                    <button type="button" onClick={close} disabled={busy} className="w-full sm:w-auto px-5 py-2.5 max-md:min-h-11 rounded-lg text-sm font-headline font-semibold text-pz-on-surface-variant bg-pz-surface-container hover:bg-pz-surface-container-high transition-all disabled:opacity-50">
                      Back to the campaign
                    </button>
                  )}
                  {runError && (
                    <button type="button" onClick={() => void continueSending()} disabled={busy} className="w-full sm:w-auto px-6 py-3 max-md:min-h-11 rounded-lg bg-pz-primary-container text-pz-on-primary-container font-headline font-bold text-sm disabled:opacity-50">
                      Continue sending
                    </button>
                  )}
                </>
              )}
              {step === "done" && (
                <>
                  {failedCount > 0 ? (
                    <button type="button" onClick={() => void resendFailed()} disabled={busy} className="w-full sm:w-auto px-5 py-2.5 max-md:min-h-11 rounded-lg text-sm font-headline font-semibold text-pz-on-surface-variant bg-pz-surface-container hover:bg-pz-surface-container-high transition-all disabled:opacity-50">
                      Resend failed
                    </button>
                  ) : <span />}
                  {failedCount > 0 && <span className="text-xs text-pz-on-surface-variant">Some of these may already have gone out. Check before you resend.</span>}
                  <button type="button" onClick={close} disabled={busy} className="w-full sm:w-auto px-6 py-3 max-md:min-h-11 rounded-lg bg-pz-primary-container text-pz-on-primary-container font-headline font-bold text-sm disabled:opacity-50">
                    Back to the campaign
                  </button>
                </>
              )}
            </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Fills the tags with an example person so the preview reads like a real message. */
function renderExample(text: string): string {
  return renderParticipantTags(text, { name: "Sana Ahmed", refId: "REF-0001", portalUrl: "https://example.com/portal/your-course", pzId: "Hamid-4821" }, "text");
}
