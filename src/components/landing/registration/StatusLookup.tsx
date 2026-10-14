"use client";

import { useEffect, useRef, useState } from "react";
import { lookupMessage, statusView, type StatusTone } from "@/lib/landing/registration/outcome-copy";
import { TextField } from "./Field";
import type { StatusResponse } from "./types";
import { R_BTN_PRIMARY, R_BTN_WHATSAPP, R_CARD, R_ERROR } from "./ui";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REF_RE = /^[A-Z0-9][A-Z0-9-]{3,39}$/;

type LookupState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "found"; data: StatusResponse; ref: string }
  | { kind: "error"; message: string };

const PILL: Record<StatusTone, string> = {
  pending: "border border-landing-outline-variant bg-landing-surface-container-low text-landing-near-black",
  ok: "bg-landing-mint-light text-landing-deep",
  attention: "border-2 border-landing-deep bg-landing-surface-container-lowest text-landing-deep",
};

/** Look up a registration by reference number + email. Nothing personal is shown without both. */
export function StatusLookup({ slug, whatsappNumber = "" }: { slug: string; whatsappNumber?: string }) {
  const [ref, setRef] = useState("");
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<{ ref?: string; email?: string }>({});
  const [state, setState] = useState<LookupState>({ kind: "idle" });
  const formRef = useRef<HTMLFormElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  // The success screen links here with ?ref=; the email is never put in a URL.
  useEffect(() => {
    try {
      const r = new URLSearchParams(window.location.search).get("ref");
      if (r) setRef(r.trim().toUpperCase().slice(0, 40));
    } catch {
      // no prefill
    }
  }, []);
  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [errors]);
  useEffect(() => {
    if (state.kind === "found" || state.kind === "error") resultRef.current?.focus();
  }, [state]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const r = ref.trim().toUpperCase();
    const m = email.trim().toLowerCase();
    const found: { ref?: string; email?: string } = {};
    if (!REF_RE.test(r)) found.ref = "Enter your reference number, like PZA-PPC-042.";
    if (!EMAIL_RE.test(m)) found.email = "Enter the email you registered with.";
    setErrors(found);
    if (found.ref || found.email) return;
    setState({ kind: "loading" });
    try {
      const res = await fetch(`/api/landing/${encodeURIComponent(slug)}/status?ref=${encodeURIComponent(r)}&email=${encodeURIComponent(m)}`, { cache: "no-store" });
      if (!res.ok) { setState({ kind: "error", message: lookupMessage(res.status) }); return; }
      setState({ kind: "found", data: (await res.json()) as StatusResponse, ref: r });
    } catch {
      setState({ kind: "error", message: lookupMessage(0) });
    }
  }

  const view = state.kind === "found" ? statusView(state.data.status) : null;
  const firstName = state.kind === "found" ? state.data.name.trim().split(/\s+/)[0] ?? "" : "";
  const waNumber = whatsappNumber.replace(/\D/g, "");
  const waHref = state.kind === "found" && view?.showWhatsApp && waNumber
    ? `https://wa.me/${waNumber}?text=${encodeURIComponent(`Hi PZ Academy! I'm checking my registration ${state.ref} for ${state.data.eventLabel}.`)}`
    : null;

  return (
    <div className="space-y-5">
      <form ref={formRef} noValidate onSubmit={(e) => void onSubmit(e)} className={`${R_CARD} space-y-4`}>
        <TextField
          label="Reference number" placeholder="PZA-PPC-042" autoComplete="off" value={ref}
          onChange={(v) => setRef(v.toUpperCase())} error={errors.ref}
        />
        <TextField
          label="Email you registered with" type="email" inputMode="email" autoComplete="email" value={email}
          onChange={setEmail} error={errors.email}
        />
        <button type="submit" disabled={state.kind === "loading"} aria-busy={state.kind === "loading" || undefined} className={`${R_BTN_PRIMARY} w-full`}>
          {state.kind === "loading" ? "Checking…" : "Check status"}
        </button>
      </form>

      <div ref={resultRef} tabIndex={-1} aria-live="polite" className="focus:outline-none">
        {state.kind === "error" && <p role="alert" className={R_ERROR}>{state.message}</p>}
        {state.kind === "found" && view && (
          <section aria-labelledby="status-result-h" className={`${R_CARD} space-y-2`}>
            <span className={`inline-flex rounded-full px-3 py-1 font-headline text-sm font-bold ${PILL[view.tone]}`}>{view.pill}</span>
            <h2 id="status-result-h" className="font-headline text-xl font-black text-landing-deep">{view.title}</h2>
            <p className="font-landing-body text-base text-landing-on-surface">{`Hi ${firstName}, ${view.body.charAt(0).toLowerCase()}${view.body.slice(1)}`}</p>
            <p className="font-landing-body text-sm text-landing-muted">{`${state.data.eventLabel} · ${state.ref}`}</p>
            {waHref && (
              <a href={waHref} target="_blank" rel="noopener noreferrer" className={R_BTN_WHATSAPP}>Message us on WhatsApp</a>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
