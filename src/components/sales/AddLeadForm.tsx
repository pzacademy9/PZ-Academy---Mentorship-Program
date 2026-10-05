"use client";

import { useState } from "react";
import Link from "next/link";
import { ClipboardPaste, Pencil, CheckCircle2, Info, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { extractEmail, extractName, extractPhone, extractProfession } from "@/lib/leads/extract";
import { leadPayload, type ApiErrorJson } from "@/lib/crm/sales-ui";

const inputClass =
  "w-full bg-pz-surface-container-low rounded-lg px-3.5 py-3 text-sm max-md:text-base max-md:min-h-11 font-body text-pz-on-surface focus:outline-none focus:ring-2 focus:ring-pz-primary/20";
const labelClass = "block font-headline text-xs font-semibold text-pz-on-surface-variant mb-1.5";
const primaryBtn =
  "rounded-lg bg-pz-primary text-pz-on-primary font-headline font-bold text-sm shadow-md disabled:bg-pz-surface-container-high disabled:text-pz-on-surface-variant disabled:shadow-none disabled:opacity-100";

type Result =
  | { kind: "saved"; contactId: string }
  | { kind: "duplicate"; contactId: string | null; ownerName: string | null; message: string };

const EMPTY = { name: "", phone: "", email: "", profession: "", note: "" };

const TIPS = [
  "Paste the whole chat. Times and sender names are fine.",
  "We look for a name, a phone number, an email and a profession.",
  "Always check the details before you save. You can change any of them.",
];

export function AddLeadForm() {
  const [mode, setMode] = useState<"paste" | "type">("paste");
  const [raw, setRaw] = useState("");
  const [fields, setFields] = useState(EMPTY);
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setFields((f) => ({ ...f, [k]: e.target.value }));

  function extract() {
    const found = {
      name: extractName(raw),
      phone: extractPhone(raw),
      email: extractEmail(raw),
      profession: extractProfession(raw),
    };
    setFields((f) => ({
      ...f,
      name: found.name ?? f.name,
      phone: found.phone ?? f.phone,
      email: found.email ?? f.email,
      profession: found.profession ?? f.profession,
    }));
    setHint(found.phone ? "Check the details, then save." : "We could not find a phone number. Type it in below.");
  }

  function reset() {
    setRaw("");
    setFields(EMPTY);
    setHint(null);
    setError(null);
    setResult(null);
  }

  const { run: save, pending } = useAsyncAction(async () => {
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/sales/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(leadPayload(fields)),
      });
      const body = (await res.json().catch(() => null)) as
        | ({ contactId?: string | null; ownerName?: string | null } & ApiErrorJson)
        | null;
      if (res.status === 201 && body?.contactId) {
        setResult({ kind: "saved", contactId: body.contactId });
        return;
      }
      if (res.status === 409 && body?.reason === "duplicate") {
        setResult({
          kind: "duplicate",
          contactId: body.contactId ?? null,
          ownerName: body.ownerName ?? null,
          message: body.error ?? "This person is already in the CRM.",
        });
        return;
      }
      setError(body?.error ?? "Could not save this lead. Please try again.");
    } catch {
      setError("Could not save this lead. Check your connection and try again.");
    }
  });

  if (result?.kind === "saved") {
    return (
      <section className="bg-pz-surface-container-lowest rounded-xl p-6 shadow-sm flex flex-col gap-4 font-body">
        <h1 className="text-xl font-headline font-bold text-pz-on-surface flex items-center gap-2">
          <CheckCircle2 className="w-6 h-6 text-pz-primary" aria-hidden="true" /> Saved to your contacts
        </h1>
        <p className="text-sm text-pz-on-surface-variant">They are at the top of your Today list.</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <Link href="/dashboard/sales" className="min-h-11 px-4 inline-flex items-center justify-center rounded-lg bg-pz-primary text-pz-on-primary font-headline font-bold text-sm">Go to Today</Link>
          <button type="button" onClick={reset} className="min-h-11 px-4 rounded-lg bg-pz-surface-container-low text-pz-on-surface font-headline font-semibold text-sm">Add another</button>
        </div>
      </section>
    );
  }

  const tabClass = (active: boolean) =>
    `min-h-11 px-4 rounded-lg font-headline text-sm inline-flex items-center gap-2 transition-all ${
      active
        ? "bg-pz-primary text-pz-on-primary font-bold shadow-sm"
        : "bg-pz-surface-container-lowest text-pz-on-surface-variant font-medium hover:text-pz-on-surface"
    }`;

  return (
    <div className="flex flex-col gap-6 font-body">
      <header>
        <h1 className="text-2xl lg:text-3xl font-headline font-black text-pz-on-surface tracking-tight">Add a Lead</h1>
        <p className="text-sm text-pz-on-surface-variant mt-1">Paste a WhatsApp chat or type the details in. The lead goes straight to your list.</p>
      </header>

      <div role="tablist" aria-label="How to add" className="flex flex-wrap gap-2">
        <button role="tab" aria-selected={mode === "paste"} type="button" onClick={() => setMode("paste")} className={tabClass(mode === "paste")}>
          <ClipboardPaste className="w-4 h-4" aria-hidden="true" /> Paste a WhatsApp chat
        </button>
        <button role="tab" aria-selected={mode === "type"} type="button" onClick={() => setMode("type")} className={tabClass(mode === "type")}>
          <Pencil className="w-4 h-4" aria-hidden="true" /> Type it in
        </button>
      </div>

      {result?.kind === "duplicate" && (
        <div role="alert" className="bg-pz-secondary-fixed text-pz-on-secondary-fixed rounded-xl p-4 text-sm flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <span>{result.ownerName ? `${result.ownerName} already has this person.` : result.message}</span>
          {result.contactId && (
            <Link href={`/dashboard/sales/contacts?tab=all&open=${encodeURIComponent(result.contactId)}`} className="min-h-11 px-4 inline-flex items-center justify-center rounded-lg bg-pz-surface-container-lowest text-pz-on-surface font-headline font-bold">
              Open contact
            </Link>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {mode === "paste" && (
          <div className="flex flex-col gap-4">
            <section className="bg-pz-surface-container-lowest rounded-xl p-4 sm:p-6 shadow-sm flex flex-col gap-3">
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-lg bg-pz-surface-container-high flex items-center justify-center font-headline font-bold text-xs text-pz-on-surface" aria-hidden="true">1</span>
                <label htmlFor="lead-chat" className="font-headline font-bold text-lg text-pz-on-surface">Paste the chat</label>
              </div>
              <textarea id="lead-chat" rows={10} value={raw} onChange={(e) => setRaw(e.target.value)}
                placeholder="Copy the messages from WhatsApp and paste them here."
                className={`${inputClass} resize-y`} />
              <Button type="button" variant="bare" size="bare" disabled={raw.trim().length === 0} onClick={extract}
                className={`w-full sm:w-auto sm:self-end min-h-11 px-6 ${primaryBtn}`}>
                Read it and fill in the details
              </Button>
              <p className="text-xs text-pz-on-surface-variant flex items-start gap-1.5">
                <Info className="w-4 h-4 shrink-0" aria-hidden="true" /> Only the details you see in the form are saved. The pasted chat is not stored.
              </p>
            </section>
            <section className="bg-pz-surface-container-lowest rounded-xl p-4 sm:p-5 shadow-sm flex flex-col gap-3">
              <h3 className="font-headline font-bold text-xs uppercase tracking-wider text-pz-on-surface-variant">Tips</h3>
              <ul className="text-xs text-pz-on-surface-variant space-y-2">
                {TIPS.map((tip) => (
                  <li key={tip} className="flex items-start gap-2">
                    <Check className="w-4 h-4 shrink-0 text-pz-primary" aria-hidden="true" /> <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}

        <section className="bg-pz-surface-container-lowest rounded-xl p-4 sm:p-6 shadow-sm flex flex-col gap-4">
          <h2 className="font-headline font-bold text-lg text-pz-on-surface flex items-center gap-2.5">
            {mode === "paste" && <span className="w-7 h-7 rounded-lg bg-pz-primary-container/40 flex items-center justify-center font-headline font-bold text-xs text-pz-on-primary-container" aria-hidden="true">2</span>}
            {mode === "paste" ? "Check and save" : "Their details"}
          </h2>
          {hint && <p role="status" className="text-xs text-pz-on-surface-variant">{hint}</p>}
          <div><label htmlFor="lead-name" className={labelClass}>Full name</label><input id="lead-name" value={fields.name} onChange={set("name")} className={inputClass} /></div>
          <div><label htmlFor="lead-phone" className={labelClass}>WhatsApp phone</label><input id="lead-phone" inputMode="tel" value={fields.phone} onChange={set("phone")} placeholder="03001234567" className={inputClass} /></div>
          <div><label htmlFor="lead-email" className={labelClass}>Email (optional)</label><input id="lead-email" type="email" value={fields.email} onChange={set("email")} className={inputClass} /></div>
          <div><label htmlFor="lead-prof" className={labelClass}>Profession (optional)</label><input id="lead-prof" value={fields.profession} onChange={set("profession")} className={inputClass} /></div>
          <div><label htmlFor="lead-note" className={labelClass}>Note (optional)</label><textarea id="lead-note" rows={3} value={fields.note} onChange={set("note")} placeholder="e.g. Wants the weekend batch" className={`${inputClass} resize-none`} /></div>
          {error && <p role="alert" className="text-sm text-pz-academy-error">{error}</p>}
          <div className="flex flex-col sm:flex-row gap-2">
            <Button type="button" variant="bare" size="bare" loading={pending} disabled={fields.phone.trim().length === 0}
              onClick={() => void save()}
              className={`min-h-11 px-6 sm:flex-1 ${primaryBtn}`}>
              Save to My Contacts
            </Button>
            <button type="button" onClick={reset} className="min-h-11 px-4 rounded-lg bg-pz-surface-container-low text-pz-on-surface font-headline font-semibold text-sm">
              Clear
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
