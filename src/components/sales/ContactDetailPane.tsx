"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Ban, Lock, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { initials } from "@/lib/format";
import { isWarmOutcome } from "@/lib/crm/followup";
import { outcomeLabel, recentlySent, type ContactDetailJson, type TemplateJson } from "@/lib/crm/sales-ui";
import { SendPanel } from "./SendPanel";
import { Timeline } from "./Timeline";
import { NoteBox } from "./NoteBox";

export function ContactDetailPane({
  contactId,
  viewerId,
  templates,
  onClose,
  onChanged,
}: {
  contactId: string;
  viewerId: string;
  templates: TemplateJson[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<ContactDetailJson | null>(null);
  const [error, setError] = useState(false);
  const latest = useRef(0);

  const load = useCallback(async () => {
    const mine = ++latest.current;
    setError(false);
    try {
      const res = await fetch(`/api/sales/contacts/${contactId}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as ContactDetailJson;
      if (mine === latest.current) setDetail(body);
    } catch {
      if (mine === latest.current) setError(true);
    }
  }, [contactId]);
  useEffect(() => void load(), [load]);

  const { run: claim, pending: claiming } = useAsyncAction(async () => {
    try {
      const res = await fetch(`/api/sales/contacts/${contactId}/claim`, { method: "POST" });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) toast.error(body?.error ?? "Could not claim this contact.");
      else toast.success("Claimed. They are in your Today list now.");
    } catch {
      toast.error("Could not claim this contact.");
    }
    await load();
    onChanged();
  });

  const back = (
    <button type="button" onClick={onClose} className="lg:hidden self-start inline-flex items-center gap-2 min-h-11 text-sm font-headline font-semibold text-pz-on-surface">
      <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Back to contacts
    </button>
  );

  if (error) return <div className="flex flex-col gap-4">{back}<ErrorState onRetry={() => void load()} /></div>;
  if (!detail) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <div role="status" aria-label="Loading contact" className="h-64 rounded-xl bg-pz-surface-container-low animate-pulse" />
      </div>
    );
  }

  const c = detail.contact;
  const unclaimed = c.owner_id === null;
  const header = (
    <div className="bg-pz-surface-container-lowest rounded-xl p-4 sm:p-6 shadow-sm flex items-center gap-3.5">
      <div className="w-14 h-14 rounded-full bg-pz-primary/10 text-pz-primary flex items-center justify-center font-headline font-black text-xl shrink-0">
        {initials(c.full_name)}
      </div>
      <div className="flex flex-col min-w-0">
        <h2 className="text-xl font-headline font-bold text-pz-on-surface truncate">{c.full_name || "No name"}</h2>
        <span className="text-xs text-pz-on-surface-variant">
          {unclaimed ? "Unclaimed" : c.owner_id === viewerId ? "Yours" : `Owned by ${c.owner_name || "another agent"}`}
          {` · ${outcomeLabel(c.last_outcome)}`}
        </span>
        {!detail.restricted && c.phone_e164 && <span className="text-xs text-pz-on-surface-variant font-mono mt-0.5">{c.phone_e164}</span>}
        {!detail.restricted && c.profession && <span className="text-xs text-pz-on-surface-variant mt-0.5">{c.profession}</span>}
        {!detail.restricted && c.email && <span className="text-xs text-pz-on-surface-variant mt-0.5 truncate">{c.email}</span>}
      </div>
    </div>
  );

  if (detail.restricted) {
    return (
      <div className="flex flex-col gap-4 font-body">
        {back}
        {header}
        <p className="bg-pz-surface-container-low rounded-lg p-4 text-sm text-pz-on-surface-variant flex items-start gap-2">
          <Lock className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          This contact belongs to another agent. Ask your admin if it should be moved to you.
        </p>
      </div>
    );
  }

  const unsubscribed = !!c.whatsapp_unsubscribed_at;
  const sendVisible = detail.canAct && !unclaimed && !c.do_not_contact_at && !unsubscribed && !!c.phone_e164;
  const noteOnly = detail.canAct && !unclaimed && !sendVisible;

  return (
    <div className="flex flex-col gap-5 font-body">
      {back}
      {header}
      {unsubscribed && !c.do_not_contact_at && (
        <p className="bg-pz-error-container text-pz-on-error-container rounded-lg p-4 text-sm flex items-start gap-2">
          <Ban className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" /> This person unsubscribed from WhatsApp messages. Nobody can message them from the app.
        </p>
      )}
      {c.do_not_contact_at && (
        <p className="bg-pz-error-container text-pz-on-error-container rounded-lg p-4 text-sm flex items-start gap-2">
          <Ban className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" /> Asked not to be contacted. Nobody can message them from the app.
        </p>
      )}
      {unclaimed && (
        <Button
          type="button"
          disabled={claiming}
          onClick={() => void claim()}
          className="w-full h-12 rounded-xl bg-pz-primary text-pz-on-primary font-headline font-bold text-base shadow-md gap-2 disabled:opacity-100"
        >
          <UserPlus className="w-5 h-5" aria-hidden="true" />
          {claiming ? "Claiming…" : "Claim to my list"}
        </Button>
      )}
      {sendVisible && c.phone_e164 && (
        <SendPanel
          key={c.id}
          contact={{
            id: c.id,
            full_name: c.full_name,
            phone_e164: c.phone_e164,
            warm: isWarmOutcome(c.last_outcome),
            recently_contacted: recentlySent(detail.timeline, new Date()),
          }}
          templates={templates}
          onSent={() => void load()}
          onOutcome={() => {
            void load();
            onChanged();
          }}
          onNoteSaved={() => void load()}
        />
      )}
      {noteOnly && (
        <div className="bg-pz-surface-container-lowest rounded-xl p-4 sm:p-6 shadow-sm">
          <NoteBox key={c.id} contactId={c.id} onSaved={() => void load()} />
        </div>
      )}
      <Timeline entries={detail.timeline} />
    </div>
  );
}
