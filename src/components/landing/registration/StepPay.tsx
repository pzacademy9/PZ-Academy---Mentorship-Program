"use client";

import type { FieldErrors, FormState } from "@/lib/landing/registration/form-state";
import type { PaymentAccount } from "@/lib/data/landing-payment-accounts";
import { formatMoney } from "@/lib/landing/registration/format";
import { CopyButton } from "./CopyButton";
import { R_BTN_SECONDARY, R_CARD, R_CHOICE, R_ERROR, R_HINT, R_INPUT, R_LABEL } from "./ui";

export type PromoStatus = { kind: "idle" } | { kind: "checking" } | { kind: "ok"; message: string } | { kind: "error"; message: string };

const linkFor = (value: string): string | null => {
  const v = value.trim();
  if (/^https:\/\/(www\.)?paypal\.me\//i.test(v)) return v;
  if (/^(www\.)?paypal\.me\//i.test(v)) return `https://${v.replace(/^www\./i, "")}`;
  return null;
};

export function StepPay({
  accounts, state, errors, amountDue, currency, promoStatus, onMethod, onPromoInput, onApply, onRemovePromo,
}: {
  accounts: PaymentAccount[]; state: FormState; errors: FieldErrors; amountDue: number | null; currency: string;
  promoStatus: PromoStatus; onMethod: (key: string) => void; onPromoInput: (v: string) => void; onApply: () => void; onRemovePromo: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="rounded-landing bg-landing-mint-light p-4">
        <p className="font-landing-body text-sm text-landing-on-surface">Send exactly</p>
        <p className="font-headline text-2xl font-black text-landing-deep">{amountDue === null ? "…" : formatMoney(amountDue, currency)}</p>
        <p className={R_HINT}>Pay into one of these accounts, take a screenshot of the receipt, then continue to upload it.</p>
      </div>

      <fieldset>
        <legend className="font-headline text-base font-bold text-landing-near-black">Choose how you pay</legend>
        <div className="mt-2 space-y-2">
          {accounts.map((a) => {
            const selected = state.paymentMethod === a.key;
            return (
              <div key={a.key} className={R_CHOICE + " flex-col"}>
                <label className="flex w-full cursor-pointer items-start gap-3">
                  <input type="radio" name="paymentMethod" className="mt-1 h-5 w-5 accent-landing-primary" checked={selected} onChange={() => onMethod(a.key)} />
                  <span>
                    <span className="block font-headline text-base font-bold text-landing-near-black">{a.label}</span>
                    <span className={R_HINT}>{a.displayText}</span>
                  </span>
                </label>
                <dl className="mt-2 w-full space-y-2 border-t border-landing-border pt-3">
                    {a.rows.map((row) => {
                      const link = linkFor(row.value);
                      return (
                        <div key={row.label} className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <dt className="font-landing-body text-sm text-landing-muted">{row.label}</dt>
                            <dd className="break-all font-landing-body text-base font-semibold text-landing-on-surface">{row.value}</dd>
                          </div>
                          <div className="flex gap-2">
                            {link && <a href={link} target="_blank" rel="noopener noreferrer" className={R_BTN_SECONDARY + " !min-h-11 !px-3 !text-sm"}>Pay via PayPal</a>}
                            <CopyButton value={row.value} label={`${a.label} ${row.label}`} />
                          </div>
                        </div>
                      );
                    })}
                </dl>
              </div>
            );
          })}
        </div>
        {errors.paymentMethod && <span role="alert" className={R_ERROR}>{errors.paymentMethod}</span>}
      </fieldset>

      <div className={R_CARD}>
        <label htmlFor="promo-code" className={R_LABEL}>Promo code</label>
        <div className="mt-1.5 flex gap-2">
          <input
            id="promo-code" value={state.promoInput} autoCapitalize="characters" autoComplete="off"
            aria-invalid={errors.promoCode || promoStatus.kind === "error" ? true : undefined}
            aria-describedby={promoStatus.kind === "error" || errors.promoCode ? "promo-err" : undefined}
            onChange={(e) => onPromoInput(e.target.value.toUpperCase())}
            className={R_INPUT + " !mt-0"}
          />
          <button type="button" onClick={onApply} disabled={state.promoInput.trim() === "" || promoStatus.kind === "checking"} className={R_BTN_SECONDARY}>Apply</button>
        </div>
        {promoStatus.kind === "checking" && <p role="status" className={R_HINT}>Checking…</p>}
        {promoStatus.kind === "ok" && (
          <p role="status" className="mt-1 font-landing-body text-sm font-semibold text-landing-primary">
            {promoStatus.message}{" "}
            <button type="button" onClick={onRemovePromo} aria-label="Remove promo code" className="inline-flex min-h-11 items-center px-2 underline underline-offset-2">Remove</button>
          </p>
        )}
        {promoStatus.kind === "error" && <p id="promo-err" role="alert" className={R_ERROR}>{promoStatus.message}</p>}
        {errors.promoCode && promoStatus.kind !== "error" && <p id="promo-err" role="alert" className={R_ERROR}>{errors.promoCode}</p>}
      </div>
    </div>
  );
}
