"use client";

import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { initialState, type FormState } from "@/lib/landing/registration/form-state";
import { useRegistrationConfig } from "./useRegistrationConfig";
import { RegistrationFlow } from "./RegistrationFlow";
import { sendFunnelEvent } from "./funnel";
import { track } from "./pixel";
import type { RegisterSuccess } from "./types";
import { R_BTN_PRIMARY } from "./ui";
import { takeOpener } from "./registration-bus";

export interface RegistrationModalProps {
  slug: string;
  /** Variant path of a country / module link; scopes config, quote and register. */
  variant?: string;
  open: boolean;
  onClose: () => void;
  testMode?: boolean;
  tracking?: boolean;
  portalContainer?: HTMLElement | null;
}

let leadSent = false; // Lead / start fire once per page load, not on every reopen

export function RegistrationModal({ slug, variant, open, onClose, testMode = false, tracking = true, portalContainer }: RegistrationModalProps) {
  const cfg = useRegistrationConfig(slug, open, variant);
  // The answers live here, outside Dialog.Content (which unmounts when closed), so closing and reopening keeps them.
  const [form, setForm] = useState<FormState | null>(null);
  const [result, setResult] = useState<RegisterSuccess | null>(null);
  const live = tracking && !testMode;
  // The flow only renders once `form` is set, so it gets a setter typed for a non-null state.
  const setFormSafe: React.Dispatch<React.SetStateAction<FormState>> = (u) =>
    setForm((prev) => (prev === null ? prev : typeof u === "function" ? (u as (s: FormState) => FormState)(prev) : u));

  useEffect(() => {
    if (cfg.status !== "ready" || form) return;
    const regionParam = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("region");
    setForm(initialState(cfg.config.registration, { country: cfg.config.country, me: cfg.me, regionParam }));
  }, [cfg, form]);

  const leadRef = useRef(false);
  useEffect(() => {
    if (!open || !live || leadSent || leadRef.current) return;
    leadSent = leadRef.current = true;
    sendFunnelEvent(slug, "start");
    track("Lead", { content_name: cfg.status === "ready" ? cfg.config.registration.eventLabel : slug });
  }, [open, live, slug, cfg]);

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal container={portalContainer ?? undefined}>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-landing-near-black/60 motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-describedby={undefined}
          onCloseAutoFocus={(e) => {
            // Radix only restores focus to a Dialog.Trigger; our Register buttons open the form through the bus.
            const el = takeOpener();
            if (el && el.isConnected) {
              e.preventDefault();
              el.focus();
            }
          }}
          className="fixed inset-0 z-50 flex flex-col bg-landing-surface font-landing-body text-landing-on-surface motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:slide-in-from-bottom md:inset-auto md:left-1/2 md:top-1/2 md:h-[min(46rem,92dvh)] md:w-[min(60rem,calc(100vw-2rem))] md:-translate-x-1/2 md:-translate-y-1/2 md:overflow-hidden md:rounded-landing md:shadow-landing-soft-lg md:motion-safe:data-[state=open]:fade-in-0 md:motion-safe:data-[state=open]:slide-in-from-bottom-0"
          style={{ colorScheme: "light" }}
        >
          <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-landing-border bg-landing-surface-container-lowest px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
            <Dialog.Title className="flex-1 truncate pl-12 font-headline text-lg font-black text-landing-deep md:pl-0">
              {cfg.status === "ready" && cfg.config.registration.eventLabel ? `Register · ${cfg.config.registration.eventLabel}` : "Register"}
            </Dialog.Title>
            <Dialog.Close aria-label="Close registration" className="inline-flex h-11 w-11 items-center justify-center rounded-full text-landing-near-black hover:bg-landing-surface-container-low focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-landing-mint">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current" strokeWidth={2.5} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </Dialog.Close>
          </div>

          {cfg.status === "loading" && <p role="status" className="p-6 text-base text-landing-muted">Loading the registration form…</p>}
          {cfg.status === "error" && (
            <div className="space-y-4 p-6">
              <p role="alert" className="text-base">{cfg.message}</p>
              <button type="button" className={R_BTN_PRIMARY} onClick={cfg.retry}>Try again</button>
            </div>
          )}
          {cfg.status === "ready" && cfg.config.status === "closed" && !testMode && (
            <p role="status" className="p-6 text-base">Registration is closed for this event.</p>
          )}
          {cfg.status === "ready" && (cfg.config.status !== "closed" || testMode) && form && (
            <RegistrationFlow
              slug={slug} variant={variant} config={cfg.config} me={cfg.me} testMode={testMode} tracking={tracking}
              form={form} setForm={setFormSafe}
              result={result} setResult={setResult} onClose={onClose}
              renderTopBar={({ canGoBack, goBack }) => canGoBack ? (
                <button type="button" onClick={goBack} aria-label="Back" className="absolute left-3 top-[max(0.5rem,env(safe-area-inset-top))] z-20 inline-flex h-11 w-11 items-center justify-center rounded-full text-landing-near-black hover:bg-landing-surface-container-low md:hidden">
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
                </button>
              ) : null}
            />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default RegistrationModal;
