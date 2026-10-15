"use client";

import { useEffect, useRef } from "react";
import { CheckCircle2, FlaskConical, MessageCircle } from "lucide-react";
import type { Mode, RegistrationConfig } from "@/lib/landing/registration/config";
import { formatMoney } from "@/lib/landing/registration/format";
import { whatsappVerifyUrl } from "@/lib/landing/registration/labels";
import { isValidWaGroupUrl } from "@/lib/landing/registration/wa-groups";
import { successCopy } from "@/lib/landing/registration/outcome-copy";
import { CopyButton } from "./CopyButton";
import type { RegisterSuccess } from "./types";
import { R_BTN_PRIMARY, R_BTN_SECONDARY, R_BTN_WHATSAPP, R_CARD, R_HINT } from "./ui";

export interface SuccessScreenProps {
  slug: string;
  config: RegistrationConfig;
  result: RegisterSuccess;
  lead: { name: string; email: string };
  mode: Mode;
  isFree: boolean;
  testMode: boolean;
  isGuest: boolean;
  onClose: () => void;
}

const H3 = "font-headline text-base font-bold text-landing-near-black";

export function SuccessScreen({ slug, config, result, lead, mode, isFree, testMode, isGuest, onClose }: SuccessScreenProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Screen-reader and keyboard users land on the outcome, not on a button that no longer exists.
  useEffect(() => { headingRef.current?.focus(); }, []);

  // The server already chose the groups; only ever render real WhatsApp invite links.
  const groups = result.waGroups.filter((g) => isValidWaGroupUrl(g.url));
  const copy = successCopy({ mode, isFree, email: lead.email, eventLabel: config.eventLabel, hasGroups: groups.length > 0 });
  const title = config.successTitle.trim() || copy.title;
  const verifyUrl = !testMode && !isFree && result.verifyMessage && config.whatsappVerifyNumber
    ? whatsappVerifyUrl(config.whatsappVerifyNumber, result.verifyMessage)
    : null;
  const statusHref = `/e/${encodeURIComponent(slug)}/status?ref=${encodeURIComponent(result.refId)}`;

  return (
    <div data-testid="registration-done" className="min-h-0 flex-1 overflow-y-auto">
      {testMode && (
        <div data-testid="success-test-banner" role="note" className="flex items-start gap-2 border-b border-landing-outline-variant bg-landing-test-banner px-4 py-2 font-landing-body text-sm text-landing-on-test-banner">
          <FlaskConical aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <span><strong>Test registration:</strong> nothing was saved to the sheet.</span>
        </div>
      )}

      <div className="mx-auto max-w-xl space-y-5 px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:px-6 md:py-8">
        <div className="text-center">
          <CheckCircle2 aria-hidden="true" className="mx-auto h-12 w-12 text-landing-primary" />
          <h2 ref={headingRef} tabIndex={-1} className="mt-3 font-headline text-2xl font-black text-landing-deep focus:outline-none">{title}</h2>
          <p className="mt-2 font-landing-body text-base text-landing-on-surface">{copy.subtitle}</p>
        </div>

        <section aria-labelledby="success-ref-h" className={R_CARD}>
          <h3 id="success-ref-h" className="font-landing-body text-sm text-landing-muted">Your reference number</h3>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
            <span data-testid="registration-ref" className="rounded-full bg-landing-mint-light px-4 py-1.5 font-mono text-lg font-bold tracking-wide text-landing-deep">
              {result.refId}
            </span>
            <CopyButton value={result.refId} label="reference number" />
          </div>
          <p className={`${R_HINT} mt-2`}>Keep this number. You need it to check your registration or to contact us.</p>
          {!isFree && result.total > 0 && (
            <p className="mt-2 font-landing-body text-sm text-landing-on-surface">{`Amount we will check: ${formatMoney(result.total, result.currency)}`}</p>
          )}
        </section>

        <section aria-labelledby="success-next-h">
          <h3 id="success-next-h" className={H3}>What happens next</h3>
          <ol className="mt-2 space-y-2">
            {copy.steps.map((s, i) => (
              <li key={s} className="flex gap-3 font-landing-body text-base text-landing-on-surface">
                <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-landing-primary font-headline text-sm font-bold text-landing-on-primary">{i + 1}</span>
                <span className="pt-0.5">{s}</span>
              </li>
            ))}
          </ol>
        </section>

        {groups.length > 0 && (
          <section aria-labelledby="success-wa-h" className="space-y-2">
            <h3 id="success-wa-h" className={H3}>Join the WhatsApp group</h3>
            <p className={R_HINT}>Session links, reminders and updates are shared only in the group.</p>
            {groups.map((g) => (
              <a key={g.url} href={g.url} target="_blank" rel="noopener noreferrer" className={R_BTN_WHATSAPP}>
                <MessageCircle aria-hidden="true" className="h-5 w-5" />
                {`Join the ${g.label} WhatsApp group`}
              </a>
            ))}
          </section>
        )}

        {verifyUrl && (
          <div className="space-y-1">
            <a href={verifyUrl} target="_blank" rel="noopener noreferrer" className={`${R_BTN_SECONDARY} w-full`}>
              Message us on WhatsApp to verify
            </a>
            <p className={`${R_HINT} text-center`}>Sends your name and reference to our team so we can check your payment faster.</p>
          </div>
        )}

        {isGuest && !testMode && (
          <section aria-labelledby="success-acct-h" className={R_CARD}>
            <h3 id="success-acct-h" className={H3}>See this registration in your account</h3>
            <p className="mt-1 font-landing-body text-base text-landing-on-surface">
              {`Create a free PZ Academy account with ${lead.email}. We link this registration to your account.`}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a href="/register" className={R_BTN_SECONDARY}>Create account</a>
              <a href="/login" className={R_BTN_SECONDARY}>Log in</a>
            </div>
          </section>
        )}

        {!testMode && (
          <p className="text-center">
            <a href={statusHref} className="inline-flex min-h-11 items-center font-landing-body text-base font-semibold text-landing-primary underline underline-offset-2">
              Check your registration status
            </a>
          </p>
        )}

        <button type="button" onClick={onClose} className={`${R_BTN_PRIMARY} w-full`}>Done</button>
      </div>
    </div>
  );
}
