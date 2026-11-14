"use client";

import { useState } from "react";
import { Mail, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { AffiliateRow } from "@/lib/data/affiliates";
import type { AffiliateTemplate } from "@/lib/data/affiliate-templates";
import { mailtoHref, renderTemplate, whatsappHref } from "@/lib/affiliates/message-templates";

export type AffiliateTemplates = { whatsapp: AffiliateTemplate[]; email: AffiliateTemplate[] };

const FIELD =
  "w-full min-w-0 rounded-lg border border-pz-outline-variant bg-pz-surface-container-low px-3 py-2.5 font-body text-sm max-md:min-h-11 max-md:text-base focus:outline-none focus:ring-2 focus:ring-pz-primary/20";

/**
 * "Choose a message": pick a saved template, edit the text, then open WhatsApp or the mail app.
 * A bottom sheet on a phone and a centred two-column dialog on a computer (the shared Dialog does both).
 */
export function AffiliateMessagePicker({
  channel,
  row,
  templates,
  onClose,
}: {
  channel: "whatsapp" | "email";
  row: AffiliateRow;
  /** null when the templates could not be loaded. */
  templates: AffiliateTemplates | null;
  onClose: () => void;
}) {
  const list = templates ? templates[channel] : [];
  const vars = { name: row.name, code: row.code };
  const first = list[0] ?? null;

  const [pickedId, setPickedId] = useState<string | null>(first?.id ?? null);
  const [text, setText] = useState(first ? renderTemplate(first.body, vars) : "");
  const [subject, setSubject] = useState(first?.subject ? renderTemplate(first.subject, vars) : "");

  const isWhatsapp = channel === "whatsapp";
  const href = isWhatsapp ? whatsappHref(row.whatsapp, text) : null;
  const noNumber = isWhatsapp && href === null;

  const pick = (t: AffiliateTemplate) => {
    setPickedId(t.id);
    setText(renderTemplate(t.body, vars));
    setSubject(t.subject ? renderTemplate(t.subject, vars) : "");
  };

  const open = () => {
    if (isWhatsapp) {
      if (!href) return;
      window.open(href, "_blank", "noopener,noreferrer");
    } else {
      window.location.href = mailtoHref(row.email, subject, text);
    }
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] gap-0 overflow-y-auto p-0 md:max-w-3xl max-md:p-0">
        <div className="border-b border-pz-outline-variant px-5 py-4 pr-12 md:px-6 md:py-5">
          <DialogTitle className="flex items-center gap-2 font-headline text-base font-bold leading-tight text-pz-secondary md:text-lg">
            {isWhatsapp ? <MessageCircle className="h-4 w-4 text-pz-mid" aria-hidden="true" /> : <Mail className="h-4 w-4 text-pz-mid" aria-hidden="true" />}
            Choose a message
          </DialogTitle>
          <DialogDescription className="mt-1 break-words font-body text-xs text-pz-on-surface-variant">
            {isWhatsapp ? "WhatsApp" : "Email"} for {row.name}
            {row.code ? (
              <>
                {" "}(<code className="font-mono font-medium text-pz-deep">{row.code}</code>)
              </>
            ) : null}
          </DialogDescription>
        </div>

        <div className="grid min-w-0 grid-cols-1 md:min-h-[22rem] md:grid-cols-12">
          <div className="min-w-0 space-y-2 border-pz-outline-variant bg-pz-surface-container-low p-4 md:col-span-5 md:border-r">
            <p className="px-1 font-headline text-xs font-bold text-pz-on-surface-variant">Message templates</p>
            {templates === null ? (
              <p role="status" className="px-1 font-body text-sm text-pz-danger">Messages could not be loaded.</p>
            ) : list.length === 0 ? (
              <p className="px-1 font-body text-sm text-pz-on-surface-variant">No saved messages yet. Write your own on the right.</p>
            ) : (
              <div role="radiogroup" aria-label="Message templates" className="space-y-2">
                {list.map((t) => {
                  const on = t.id === pickedId;
                  return (
                    <label
                      key={t.id}
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 max-md:min-h-11 ${
                        on ? "border-pz-solid-forest bg-pz-surface-container-lowest" : "border-pz-outline-variant bg-pz-surface-container-lowest"
                      }`}
                    >
                      <input type="radio" name="affiliate-template" checked={on} onChange={() => pick(t)} className="mt-1 h-4 w-4 shrink-0 text-pz-deep" />
                      <span className="min-w-0 flex-1">
                        <span className={`block break-words font-headline text-xs ${on ? "font-bold text-pz-deep" : "font-semibold text-pz-on-surface"}`}>{t.name}</span>
                        <span className="mt-0.5 line-clamp-2 block break-words font-body text-xs text-pz-on-surface-variant">{renderTemplate(t.body, vars)}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div className="min-w-0 space-y-3 p-4 md:col-span-7 md:p-6">
            {!isWhatsapp ? (
              <div>
                <label htmlFor="aff-msg-subject" className="mb-1 block font-headline text-xs font-bold text-pz-on-surface">Subject</label>
                <input id="aff-msg-subject" className={FIELD} value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>
            ) : null}
            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <label htmlFor="aff-msg-text" className="font-headline text-xs font-bold text-pz-on-surface">Message text (editable)</label>
                <span className="font-body text-xs text-pz-on-surface-variant">Filled in with their name and code</span>
              </div>
              <textarea id="aff-msg-text" rows={8} className={`${FIELD} resize-none leading-relaxed`} value={text} onChange={(e) => setText(e.target.value)} />
              <p className="mt-1 font-body text-xs text-pz-on-surface-variant">
                {isWhatsapp ? "The message opens in WhatsApp. You press send there." : "The message opens in your mail app. You press send there."}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-pz-outline-variant bg-pz-surface-container-low px-5 py-4 md:flex-row md:items-center md:justify-between md:px-6">
          <p className="min-w-0 break-words font-body text-xs font-medium text-pz-on-surface-variant">
            Recipient: {isWhatsapp ? row.whatsapp || "No number saved" : row.email}
          </p>
          <div className="flex flex-col-reverse gap-2 md:flex-row md:items-center">
            <Button type="button" variant="outline" onClick={onClose} className="max-md:w-full">Cancel</Button>
            <Button type="button" onClick={open} disabled={noNumber} className="max-md:w-full">
              {isWhatsapp ? (noNumber ? "No valid number" : "Open WhatsApp") : "Open email"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
