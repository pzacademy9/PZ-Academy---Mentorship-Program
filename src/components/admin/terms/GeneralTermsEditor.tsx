"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MAX_TERMS_LENGTH, type TermsKey } from "@/lib/validations/site-terms";

/** The general Terms and Conditions: shown on every landing page that has no Terms of its own. */
export function GeneralTermsEditor({
  initial,
  docKey = "general",
  label = "General Terms and Conditions",
  help,
}: {
  initial: string;
  docKey?: TermsKey;
  label?: string;
  help?: string;
}) {
  const [text, setText] = useState(initial);
  const [pending, setPending] = useState(false);
  const over = text.length - MAX_TERMS_LENGTH;

  async function save() {
    if (over > 0) return;
    setPending(true);
    try {
      const res = await fetch(docKey === "general" ? "/api/admin/site-terms" : `/api/admin/site-terms?key=${docKey}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: text }) });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) toast.error(data?.error ?? "Could not save the Terms. Please try again.");
      else toast.success(docKey === "general" ? "Terms saved. Landing pages show the new text within an hour." : "Saved.");
    } catch {
      toast.error("Could not save the Terms. Please check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <label htmlFor={`terms-${docKey}`} className="font-body text-sm font-semibold text-pz-on-surface">{label}</label>
      <p className="font-body text-xs text-pz-on-surface-variant">
        {help ?? "Shown on every landing page that has no Terms of its own. A page's own Terms win over this text. Plain text: start each part with 1. 2. 3. and a short title on its own line."}
      </p>
      <textarea
        id={`terms-${docKey}`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={20}
        className="w-full rounded-md border border-pz-outline-variant bg-pz-surface-container-lowest px-3 py-2 font-body text-sm text-pz-on-surface shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
      {over > 0 ? <p role="alert" className="font-body text-xs font-medium text-pz-danger">This is {over} characters too long. Please keep it under 20,000 characters.</p> : null}
      <Button type="button" onClick={() => void save()} disabled={pending}>{pending ? "Saving..." : "Save Terms"}</Button>
    </div>
  );
}
