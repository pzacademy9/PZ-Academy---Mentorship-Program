"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { MessageCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { renderWhatsAppMessage } from "@/lib/crm/whatsapp-link";
import {
  DEFAULT_MESSAGE,
  explainSendError,
  lockCopy,
  sendLock,
  type ApiErrorJson,
  type SendOkJson,
  type TemplateJson,
} from "@/lib/crm/sales-ui";
import {
  DEFAULT_FOLLOWUP_HOURS,
  FOLLOWUP_CHOICES,
  followupLabel,
  type FollowupHours,
  type OutcomeKind,
} from "@/lib/crm/followup";
import { useSalesBudget } from "./SalesBudgetProvider";
import { useNow } from "./useNow";
import { OutcomeButtons } from "./OutcomeButtons";

export type SendPanelContact = { id: string; full_name: string; phone_e164: string | null; warm: boolean; recently_contacted: boolean };

const defaultOpen = (url: string) => window.location.assign(url);

export function SendPanel({
  contact,
  templates,
  onSent,
  onOutcome,
  onNoteSaved,
  openLink = defaultOpen,
}: {
  contact: SendPanelContact;
  templates: TemplateJson[];
  onSent?: (contactId: string) => void;
  onOutcome: (contactId: string, kind: OutcomeKind, nextFollowupAt: string | null) => void;
  onNoteSaved?: (contactId: string) => void;
  openLink?: (url: string) => void;
}) {
  const { budgets, selected, refresh, applyBudget } = useSalesBudget();
  const now = useNow();
  const [templateId, setTemplateId] = useState<string>(templates[0]?.id ?? "");
  const [message, setMessage] = useState<string>(templates[0]?.body ?? DEFAULT_MESSAGE);
  const [sent, setSent] = useState(false);
  const [sentLink, setSentLink] = useState<string | null>(null);
  const currentId = useRef(contact.id);
  currentId.current = contact.id;
  const refreshedFor = useRef<string | null>(null);
  const [note, setNote] = useState("");
  // The person decides when this contact comes back to Today if they do not answer (decision D1).
  const [followupHours, setFollowupHours] = useState<FollowupHours>(DEFAULT_FOLLOWUP_HOURS);

  // A new contact resets the panel.
  useEffect(() => {
    setSent(false);
    setSentLink(null);
    setNote("");
    setFollowupHours(DEFAULT_FOLLOWUP_HOURS);
  }, [contact.id]);

  const lock = sendLock({ budgets, selected, warm: contact.warm, now });
  const copy = lockCopy(lock, now);
  const preview = useMemo(() => renderWhatsAppMessage(message, contact.full_name), [message, contact.full_name]);

  // When a pause or quiet hours ends, fetch fresh numbers once.
  const until = lock.kind === "frozen" || lock.kind === "quiet" ? lock.until : null;
  useEffect(() => {
    if (until && Date.parse(until) <= now.getTime() && refreshedFor.current !== until) {
      refreshedFor.current = until;
      void refresh();
    }
  }, [until, now, refresh]);

  const { run: send, pending: sending } = useAsyncAction(async () => {
    if (!selected || lock.kind !== "ready") return;
    const startedFor = contact.id;
    try {
      const res = await fetch(`/api/sales/contacts/${contact.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numberId: selected.number.id, messageTemplate: message, followupInHours: followupHours }),
      });
      const body = (await res.json().catch(() => null)) as SendOkJson | ApiErrorJson | null;
      if (!res.ok) {
        toast.error(explainSendError(body as ApiErrorJson | null, new Date()));
        await refresh();
        return;
      }
      const ok = body as SendOkJson;
      applyBudget(selected.number.id, ok.budget);
      for (const w of ok.warnings) toast.warning(w);
      if (currentId.current === startedFor) {
        setSent(true);
        setSentLink(ok.link);
      }
      onSent?.(startedFor);
      openLink(ok.link);
    } catch {
      toast.error("Could not send this message.");
    }
  });

  const { run: saveNote, pending: savingNote } = useAsyncAction(async () => {
    const body = note.trim();
    if (!body) return;
    try {
      const res = await fetch(`/api/sales/contacts/${contact.id}/note`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as ApiErrorJson | null;
        toast.error(err?.error ?? "Could not save the note.");
        return;
      }
      toast.success("Note saved.");
      setNote("");
      onNoteSaved?.(contact.id);
    } catch {
      toast.error("Could not save the note.");
    }
  });

  const noPhone = !contact.phone_e164;
  const emptyMessage = message.trim().length === 0;
  const locked = lock.kind !== "ready" || noPhone;
  const buttonText = noPhone ? "No phone number for this person" : copy.button;
  const detailText = noPhone ? null : copy.detail;

  return (
    <div className="bg-pz-surface-container-lowest rounded-xl p-4 sm:p-6 shadow-sm flex flex-col gap-5 font-body">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-pz-primary" />
          <h3 className="text-base font-headline font-bold text-pz-on-surface">Message</h3>
        </div>
        {contact.recently_contacted && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-headline font-bold bg-pz-secondary-fixed text-pz-on-secondary-fixed">
            <Clock className="w-3.5 h-3.5" /> Messaged in the last 24 hours
          </span>
        )}
      </div>

      {templates.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`tpl-${contact.id}`} className="text-xs font-headline font-semibold text-pz-on-surface-variant">
            Saved message
          </label>
          <select
            id={`tpl-${contact.id}`}
            value={templateId}
            onChange={(e) => {
              setTemplateId(e.target.value);
              setMessage(templates.find((t) => t.id === e.target.value)?.body ?? DEFAULT_MESSAGE);
            }}
            className="w-full bg-pz-surface-container-low rounded-lg px-3.5 py-3 text-sm font-body text-pz-on-surface focus:outline-none focus:ring-2 focus:ring-pz-primary/20"
          >
            {/* "" keeps the select valid when templates arrive after the panel mounted (My Contacts loads them separately). */}
            <option value="">Default message</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`msg-${contact.id}`} className="text-xs font-headline font-semibold text-pz-on-surface-variant">
          Your message ({"{{first_name}}"} becomes their first name)
        </label>
        <textarea
          id={`msg-${contact.id}`}
          rows={4}
          maxLength={1000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="w-full bg-pz-surface-container-low text-pz-on-surface text-sm rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-pz-primary/20 resize-none font-body"
        />
        <span className="text-xs font-headline font-semibold text-pz-on-surface-variant">What they will see</span>
        <div className="bg-pz-surface-container-low rounded-xl p-4">
          <p className="bg-pz-surface-container-lowest rounded-lg p-4 shadow-sm text-sm text-pz-on-surface leading-relaxed whitespace-pre-wrap max-w-lg">
            {preview}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div role="group" aria-label="Bring them back in" className="flex flex-col gap-1.5">
          <span className="text-xs font-headline font-semibold text-pz-on-surface-variant">Bring them back in:</span>
          <div className="flex flex-wrap gap-2">
            {FOLLOWUP_CHOICES.map(({ hours, label }) => (
              <button
                key={hours}
                type="button"
                aria-pressed={followupHours === hours}
                disabled={sent || sending}
                onClick={() => setFollowupHours(hours)}
                className={`min-h-11 px-3.5 py-2 rounded-lg text-xs font-headline font-semibold transition-colors disabled:opacity-50 ${
                  followupHours === hours
                    ? "bg-pz-primary text-pz-on-primary"
                    : "bg-pz-surface-container-low text-pz-on-surface"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <Button
          type="button"
          variant="bare"
          size="bare"
          disabled={locked || sending || emptyMessage}
          loading={sending}
          onClick={() => void send()}
          className="w-full h-14 rounded-xl bg-pz-primary hover:bg-pz-primary/95 text-pz-on-primary font-headline font-bold text-base flex items-center justify-center gap-3 transition-all shadow-md active:scale-[0.99] disabled:bg-pz-surface-container-high disabled:text-pz-on-surface-variant disabled:shadow-none disabled:opacity-100"
        >
          <MessageCircle className="w-6 h-6" />
          {buttonText}
        </Button>
        {detailText && <p className="text-xs text-center text-pz-on-surface-variant">{detailText}</p>}
        {!locked && !detailText && (
          <p className="text-[11px] text-center text-pz-on-surface-variant">
            Opens WhatsApp with the message filled in. Check it, then press send in WhatsApp.
          </p>
        )}
        {sent && sentLink && (
          <a
            href={sentLink}
            className="min-h-11 inline-flex items-center justify-center rounded-lg bg-pz-surface-container-low text-pz-on-surface font-headline font-semibold text-sm px-4"
          >
            Open WhatsApp again
          </a>
        )}
        {sent && (
          <p role="status" className="text-xs text-center font-semibold text-pz-primary">
            Sent. They come back to your list in {followupLabel(followupHours)} if you hear nothing. When they answer, tap what happened below.
          </p>
        )}
      </div>

      <OutcomeButtons contactId={contact.id} onLogged={(kind, next) => onOutcome(contact.id, kind, next)} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`note-${contact.id}`} className="text-xs font-headline font-semibold text-pz-on-surface-variant">
          Note (your team can see it)
        </label>
        <textarea
          id={`note-${contact.id}`}
          rows={2}
          maxLength={2000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Asked about weekend classes"
          className="w-full bg-pz-surface-container-low text-pz-on-surface text-sm rounded-lg p-3 placeholder:text-pz-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-pz-primary/20 resize-none font-body"
        />
        <Button
          type="button"
          variant="bare"
          size="bare"
          disabled={note.trim().length === 0}
          loading={savingNote}
          onClick={() => void saveNote()}
          className="self-end px-4 py-2 max-md:min-h-11 rounded-lg bg-pz-primary-container text-pz-on-primary-container font-headline font-bold text-xs"
        >
          Save note
        </Button>
      </div>
    </div>
  );
}
