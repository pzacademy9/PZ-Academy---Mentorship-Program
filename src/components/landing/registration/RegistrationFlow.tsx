"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RegistrationConfig } from "@/lib/landing/registration/config";
import { compressImage } from "@/lib/landing/compress-image";
import { promoMessage } from "@/lib/landing/registration/promo";
import { formatMoney } from "@/lib/landing/registration/format";
import {
  buildPayload, chooseTier, fieldStep, isFreeSelection, nextStep, prevStep, setGroupSize, stepsFor, toggleOption,
  validateStep, voucherProblem, VOUCHER_TYPES, type FieldErrors, type FormState, type StepKey,
} from "@/lib/landing/registration/form-state";
import { usePricingQuote } from "./usePricingQuote";
import { readAttribution } from "./attribution";
import { documentCookie, safeLocal, safeSession } from "./storage";
import { getSessionId, sendFunnelEvent } from "./funnel";
import { newEventId, track } from "./pixel";
import { submitRegistration } from "./submit";
import { StepChoose } from "./StepChoose";
import { StepDetails } from "./StepDetails";
import { StepPay, type PromoStatus } from "./StepPay";
import { StepUpload } from "./StepUpload";
import { SuccessScreen } from "./SuccessScreen";
import { OrderSummary, dueTotal } from "./OrderSummary";
import type { MeProfile, PublicConfig, RegisterSuccess } from "./types";
import { R_BTN_PRIMARY, R_BTN_SECONDARY } from "./ui";

const STEP_LABEL: Record<StepKey, string> = { choose: "Choose", details: "Details", pay: "Pay", upload: "Upload" };
const STEP_TITLE: Record<StepKey, string> = { choose: "Choose your option", details: "Your details", pay: "Pay", upload: "Upload your receipt" };
/** Whether a server-reported field has a visible place on screen for this form. Otherwise its message goes in the form-level error. */
function fieldHasPlace(field: string, config: RegistrationConfig, isFree: boolean, groupSize: number): boolean {
  switch (field) {
    case "regionKey": return config.regions.length > 1;
    case "mode": return config.modes.length > 1;
    case "tierKey":
    case "groupSize": return !isFree && config.tiers.length > 0;
    case "optionKeys": case "paymentMethod": case "promoCode": case "voucher": case "consent": return true;
    case "lead.name": case "lead.email": case "lead.whatsapp": case "lead.profession": case "lead.city": return true;
    default: {
      const m = /^members\.(\d+)\.(name|email|whatsapp|profession)$/.exec(field);
      return !!m && Number(m[1]) < groupSize - 1;
    }
  }
}

export interface FlowProps {
  slug: string;
  /** Variant path of a country / module link; sent as `?v=` on quote and register. */
  variant?: string;
  config: PublicConfig;
  me: MeProfile | null;
  testMode: boolean;
  tracking: boolean;
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  result: RegisterSuccess | null;
  setResult: (r: RegisterSuccess) => void;
  onClose: () => void;
  /** The mode was already chosen (Register menu), so the mode question is skipped. */
  modeLocked?: boolean;
  /** The phone sheet's back arrow lives in the modal's top bar; the flow tells it whether Back is possible. */
  renderTopBar?: (ctx: { canGoBack: boolean; goBack: () => void; stepIndex: number; stepCount: number }) => React.ReactNode;
}

export function RegistrationFlow({ slug, variant, config: pc, me, testMode, tracking, form, setForm, result, setResult, onClose, renderTopBar, modeLocked }: FlowProps) {
  const config = pc.registration;
  // Test mode (admin only) sends no Meta events and no funnel events: nothing real happens.
  const live = tracking && !testMode;
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [focusTick, setFocusTick] = useState(0);
  // One id per form session: a retry after a lost reply is recognised by the server, and Meta de-duplicates on it.
  const eventIdRef = useRef<string | null>(null);

  const { quote, promo, pending } = usePricingQuote({
    slug, variant, config,
    selection: { regionKey: form.regionKey, mode: form.mode, optionKeys: form.optionKeys, tierKey: form.tierKey, groupSize: form.groupSize },
    promoCode: form.promoApplied, email: form.lead.email,
  });
  const isFree = quote && quote.ok ? quote.isFree : isFreeSelection(config, form.optionKeys);
  const steps = useMemo(() => stepsFor(isFree), [isFree]);
  const step: StepKey = steps.includes(form.step) ? form.step : steps[steps.length - 1];
  const region = config.regions.find((r) => r.key === form.regionKey);
  const accounts = useMemo(() => (region ? region.accountKeys.map((k) => pc.accounts.find((a) => a.key === k)).filter((a): a is NonNullable<typeof a> => !!a) : []), [region, pc.accounts]);
  const total = dueTotal(quote, promo);
  const currency = quote && quote.ok ? quote.currency : region?.currency ?? "";

  // Move focus to the step heading on every step change (keyboard and screen-reader users land in the right place).
  useEffect(() => { headingRef.current?.focus(); }, [step, result]);

  const promoStatus: PromoStatus = !form.promoApplied
    ? { kind: "idle" }
    : pending && !promo ? { kind: "checking" }
    : promo && promo.ok
      ? { kind: "ok", message: promo.discount > 0 ? `✓ ${formatMoney(promo.discount, currency)} off applied` : "✓ Code accepted. It doesn't change your price." }
    : promo && !promo.ok ? { kind: "error", message: promoMessage(promo.reason) }
    : { kind: "checking" };

  // After a failed Continue or a server error, move focus to the first invalid field (or the message) in DOM order.
  // Declared after the heading effect so it wins when the step changes in the same render.
  useEffect(() => {
    if (focusTick === 0) return;
    const root = bodyRef.current;
    if (!root) return;
    const target = root.querySelector<HTMLElement>('[aria-invalid="true"]')
      ?? root.querySelector<HTMLElement>('[data-testid="registration-form-error"]')
      ?? root.querySelector<HTMLElement>('[role="alert"]');
    if (!target) return;
    if (!target.matches("input,select,textarea,button,a")) target.tabIndex = -1;
    target.focus();
  }, [focusTick]);

  const patch = (p: Partial<FormState>) => setForm((s) => ({ ...s, ...p }));
  const goTo = (s: StepKey, forward = false) => {
    setForm((f) => ({ ...f, step: s }));
    // Tracking fires on forward moves only; going back is not a funnel step or a checkout.
    if (live && forward) {
      sendFunnelEvent(slug, "step");
      if (s === "pay") track("InitiateCheckout", { content_name: config.eventLabel, value: total ?? 0, currency }, newEventId());
    }
  };

  async function onFile(file: File | null) {
    if (!file) { patch({ voucher: null }); return; }
    // Checked here, before anything is uploaded: the same types and 4 MB cap as the server.
    if (!VOUCHER_TYPES.includes(file.type)) {
      patch({ voucher: null });
      setErrors((e) => ({ ...e, voucher: voucherProblem(file) ?? "Upload a JPG, PNG, WebP or PDF file." }));
      return;
    }
    let chosen = file;
    if (file.type.startsWith("image/")) {
      setPreparing(true);
      try { chosen = await compressImage(file, { timeoutMs: 8000 }); } catch { chosen = file; } finally { setPreparing(false); }
    }
    const problem = voucherProblem(chosen);
    if (problem) {
      patch({ voucher: null });
      setErrors((e) => ({ ...e, voucher: problem }));
      return;
    }
    patch({ voucher: chosen });
    setErrors((e) => { const n = { ...e }; delete n.voucher; return n; });
  }

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    setFormError(null);
    const eventId = (eventIdRef.current ??= newEventId());
    const attribution = { ...readAttribution(Date.now(), safeLocal(), safeSession(), documentCookie()), eventId, sessionId: getSessionId() };
    const effective = promo && promo.ok ? form : { ...form, promoApplied: "" };
    const outcome = await submitRegistration(slug, buildPayload(effective, attribution, testMode, isFree), isFree ? null : form.voucher, { variant });
    setSubmitting(false);
    if (outcome.ok) {
      setResult(outcome.data);
      if (live) {
        sendFunnelEvent(slug, "submit");
        track("CompleteRegistration", { content_name: config.eventLabel, value: outcome.data.total, currency: outcome.data.currency }, eventId);
      }
      return;
    }
    if (outcome.field) {
      const key = outcome.field === "lead.consent" ? "consent" : outcome.field;
      const s = fieldStep(outcome.field, steps);
      setErrors({ [key]: outcome.error });
      // The server refused the code, so the "applied" confirmation must not keep showing.
      if (key === "promoCode") setForm((f) => ({ ...f, promoApplied: "" }));
      if (!fieldHasPlace(key, config, isFree, form.groupSize)) setFormError(outcome.error);
      setForm((f) => ({ ...f, step: s, detailsCollapsed: s === "details" ? false : f.detailsCollapsed }));
      setFocusTick((t) => t + 1);
      return;
    }
    setFormError(outcome.error);
    setFocusTick((t) => t + 1);
  }

  function onContinue() {
    setFormError(null);
    const found = validateStep(step, form, config, quote, { hasAccounts: accounts.length > 0, isFree });
    setErrors(found);
    if (Object.keys(found).length > 0) {
      if (step === "details" && Object.keys(found).some((k) => k.startsWith("lead.") && k !== "lead.city")) patch({ detailsCollapsed: false });
      setFocusTick((t) => t + 1);
      return;
    }
    const next = nextStep(steps, step);
    if (next === "submit") void submit();
    else goTo(next, true);
  }

  function onBack() {
    const prev = prevStep(steps, step);
    setErrors({});
    setFormError(null);
    if (prev) goTo(prev);
  }

  if (result) {
    return (
      <SuccessScreen
        slug={slug}
        config={config}
        result={result}
        lead={{ name: form.lead.name.trim(), email: form.lead.email.trim().toLowerCase() }}
        mode={form.mode}
        isFree={isFree}
        testMode={testMode}
        isGuest={me === null}
        onClose={onClose}
      />
    );
  }

  const last = nextStep(steps, step) === "submit";
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {renderTopBar?.({ canGoBack: !!prevStep(steps, step), goBack: onBack, stepIndex: steps.indexOf(step), stepCount: steps.length })}
      {testMode && (
        <div data-testid="test-mode-banner" role="note" className="border-b border-landing-outline-variant bg-landing-test-banner px-4 py-2 font-landing-body text-sm text-landing-on-test-banner">
          <strong>Test mode - nothing real is saved.</strong> No sheet row, no promo use, no Meta events. Emails go only to you.
        </div>
      )}
      <ol data-testid="registration-step-indicator" aria-label="Registration steps" className="flex gap-2 px-4 pt-3 md:px-6">
        {steps.map((s, i) => (
          <li key={s} aria-current={s === step ? "step" : undefined} className={`flex-1 border-t-4 pt-1.5 font-headline text-xs font-bold ${steps.indexOf(step) >= i ? "border-landing-primary text-landing-deep" : "border-landing-border text-landing-muted"}`}>
            {`${i + 1} ${STEP_LABEL[s]}`}
            {steps.indexOf(step) > i && <span className="sr-only"> (done)</span>}
          </li>
        ))}
      </ol>

      <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(0,1fr)_20rem]">
        <div ref={bodyRef} className="min-h-0 overflow-y-auto px-4 py-4 md:px-6">
          <h2 ref={headingRef} tabIndex={-1} className="mb-4 font-headline text-xl font-black text-landing-deep focus:outline-none">{STEP_TITLE[step]}</h2>
          {formError && (
            <div data-testid="registration-form-error" role="alert" className="mb-4 rounded-landing border-2 border-landing-error bg-landing-surface-container-low p-3 font-landing-body text-base text-landing-near-black">
              {formError}
              {config.whatsappVerifyNumber && (
                <> {" "}<a className="inline-flex min-h-11 items-center font-semibold underline" href={`https://wa.me/${config.whatsappVerifyNumber}`} target="_blank" rel="noopener noreferrer">Message us on WhatsApp</a></>
              )}
            </div>
          )}
          <div className="relative">
            {step === "choose" && (
              <StepChoose
                config={config} state={form} errors={errors} notice={notice} isFree={isFree} modeLocked={modeLocked}
                onRegion={(k) => patch({ regionKey: k, paymentMethod: "" })}
                onMode={(m) => patch({ mode: m })}
                onToggleOption={(k) => {
                  const t = toggleOption(config, form.optionKeys, k);
                  const bundle = config.options.find((o) => o.key === config.moduleMix.bundleOptionKey);
                  setNotice(t.collapsed && bundle ? `All modules selected, switched to ${bundle.label}` : null);
                  setForm((f) => {
                    const next = { ...f, optionKeys: t.optionKeys };
                    return isFreeSelection(config, t.optionKeys) ? chooseTier(next, config, "individual") : next;
                  });
                }}
                onTier={(k) => setForm((f) => chooseTier(f, config, k))}
                onGroupSize={(n) => setForm((f) => setGroupSize(f, config, n))}
              />
            )}
            {step === "details" && (
              <StepDetails
                config={config} state={form} errors={errors} isFree={isFree}
                onLead={(p) => setForm((f) => ({ ...f, lead: { ...f.lead, ...p, ...(f.emailLocked ? { email: f.lead.email } : {}) } }))}
                onMember={(i, p) => setForm((f) => ({ ...f, members: f.members.map((m, n) => (n === i ? { ...m, ...p } : m)) }))}
                onExpand={() => patch({ detailsCollapsed: false })}
                onConsent={(v) => patch({ consent: v })}
                onHoneypot={(v) => patch({ honeypot: v })}
              />
            )}
            {step === "pay" && (
              <StepPay
                accounts={accounts} state={form} errors={errors} amountDue={total} currency={currency} promoStatus={promoStatus}
                onMethod={(k) => patch({ paymentMethod: k })}
                onPromoInput={(v) => patch({ promoInput: v })}
                onApply={() => { patch({ promoApplied: form.promoInput.trim().toUpperCase() }); setErrors((e) => { const n = { ...e }; delete n.promoCode; return n; }); }}
                onRemovePromo={() => patch({ promoApplied: "", promoInput: "" })}
              />
            )}
            {step === "upload" && <StepUpload state={form} errors={errors} preparing={preparing} onFile={(f) => void onFile(f)} onConsent={(v) => patch({ consent: v })} />}
          </div>
        </div>
        <aside className="hidden min-h-0 overflow-y-auto border-l border-landing-border bg-landing-surface p-5 md:block">
          <div className="sticky top-0"><OrderSummary config={config} state={form} quote={quote} promo={promo} /></div>
        </aside>
      </div>

      <div className="sticky bottom-0 flex items-center gap-3 border-t border-landing-border bg-landing-surface-container-lowest px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-landing-bar md:px-6">
        <div className="min-w-0 flex-1 md:hidden">
          <span className="block font-landing-body text-xs text-landing-muted">Total</span>
          <span className="block truncate font-headline text-lg font-black text-landing-deep">{total === null ? "—" : isFree ? "Free" : formatMoney(total, currency)}</span>
        </div>
        {prevStep(steps, step) && (
          <button type="button" onClick={onBack} className={R_BTN_SECONDARY + " hidden md:inline-flex"}>Back</button>
        )}
        <button type="button" onClick={onContinue} disabled={submitting || preparing} aria-busy={submitting || undefined} className={R_BTN_PRIMARY + " md:ml-auto"}>
          {submitting ? "Submitting…" : last ? "Complete registration" : "Continue"}
        </button>
      </div>
    </div>
  );
}
