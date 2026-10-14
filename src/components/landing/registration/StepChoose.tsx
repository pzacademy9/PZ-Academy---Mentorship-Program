"use client";

import { useMemo } from "react";
import { computeQuote } from "@/lib/landing/registration/pricing";
import { formatMoney } from "@/lib/landing/registration/format";
import { INDIVIDUAL, type FieldErrors, type FormState } from "@/lib/landing/registration/form-state";
import type { Mode, RegistrationConfig } from "@/lib/landing/registration/config";
import { R_CHOICE, R_ERROR, R_HINT, R_INPUT, R_LABEL } from "./ui";

const LEGEND = "font-headline text-base font-bold text-landing-near-black";

export function StepChoose({
  config, state, errors, notice, isFree, onRegion, onMode, onToggleOption, onTier, onGroupSize,
}: {
  config: RegistrationConfig; state: FormState; errors: FieldErrors; notice: string | null; isFree: boolean;
  onRegion: (k: string) => void; onMode: (m: Mode) => void; onToggleOption: (k: string) => void;
  onTier: (k: string) => void; onGroupSize: (n: number) => void;
}) {
  const region = config.regions.find((r) => r.key === state.regionKey);
  const now = useMemo(() => new Date(), []);
  const priceOf = (key: string) => {
    const q = computeQuote({ config, regionKey: state.regionKey, mode: state.mode, optionKeys: [key], tierKey: INDIVIDUAL, groupSize: 1, now });
    return q.ok ? q : null;
  };
  const tier = config.tiers.find((t) => t.key === state.tierKey);

  return (
    <div className="space-y-6">
      {config.regions.length > 1 && (
        <fieldset aria-describedby={errors.regionKey ? "err-region" : undefined}>
          <legend className={LEGEND}>Registering from</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {config.regions.map((r) => (
              <label key={r.key} className="inline-flex min-h-11 cursor-pointer items-center rounded-full border-2 border-landing-border bg-landing-surface-container-lowest px-4 font-landing-body text-base font-semibold text-landing-on-surface has-[:checked]:border-landing-primary has-[:checked]:bg-landing-mint-light has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-landing-mint">
                <input type="radio" name="region" className="sr-only" checked={state.regionKey === r.key} onChange={() => onRegion(r.key)} />
                {r.label}
              </label>
            ))}
          </div>
          {errors.regionKey && <span id="err-region" role="alert" className={R_ERROR}>{errors.regionKey}</span>}
        </fieldset>
      )}

      {config.modes.length > 1 && (
        <fieldset aria-describedby={errors.mode ? "err-mode" : undefined}>
          <legend className={LEGEND}>How do you want to learn?</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {config.modes.map((m) => (
              <label key={m} className={R_CHOICE}>
                <input type="radio" name="mode" className="mt-1 h-5 w-5 accent-landing-primary" checked={state.mode === m} onChange={() => onMode(m)} />
                <span>
                  <span className="block font-headline text-base font-bold text-landing-near-black">{m === "live" ? "Live sessions" : "Recorded lectures"}</span>
                  <span className={R_HINT}>{m === "live" ? "Real-time on Zoom" : "Self-paced, watch anytime"}</span>
                </span>
              </label>
            ))}
          </div>
          {errors.mode && <span id="err-mode" role="alert" className={R_ERROR}>{errors.mode}</span>}
        </fieldset>
      )}

      <fieldset aria-describedby={errors.optionKeys ? "err-options" : undefined}>
        <legend className={LEGEND}>What do you want to join?</legend>
        <div className="mt-2 grid gap-2">
          {config.options.map((o) => {
            const q = priceOf(o.key);
            const checked = state.optionKeys.includes(o.key);
            return (
              <label key={o.key} className={R_CHOICE}>
                <input
                  type={o.kind === "bundle" ? "radio" : "checkbox"}
                  name={o.kind === "bundle" ? "bundle" : undefined}
                  className="mt-1 h-5 w-5 accent-landing-primary"
                  checked={checked}
                  onChange={() => onToggleOption(o.key)}
                />
                <span className="flex flex-1 flex-wrap items-baseline justify-between gap-x-3">
                  <span className="font-headline text-base font-bold text-landing-near-black">{o.label}</span>
                  {q && (
                    <span className="font-landing-body text-base text-landing-on-surface">
                      {q.isFree ? "Free" : formatMoney(q.perPerson, q.currency)}
                      {q.earlyBirdApplied && q.listPerPerson > q.perPerson && (
                        <s className="ml-2 text-sm text-landing-muted">{formatMoney(q.listPerPerson, q.currency)}</s>
                      )}
                    </span>
                  )}
                </span>
              </label>
            );
          })}
        </div>
        {notice && <p role="status" className="mt-2 font-landing-body text-sm font-semibold text-landing-primary">✓ {notice}</p>}
        {errors.optionKeys && <span id="err-options" role="alert" className={R_ERROR}>{errors.optionKeys}</span>}
      </fieldset>

      {!isFree && config.tiers.length > 0 && (
        <fieldset aria-describedby={errors.tierKey || errors.groupSize ? "err-tier" : undefined}>
          <legend className={LEGEND}>Who is registering?</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <label className={R_CHOICE}>
              <input type="radio" name="tier" className="mt-1 h-5 w-5 accent-landing-primary" checked={state.tierKey === INDIVIDUAL} onChange={() => onTier(INDIVIDUAL)} />
              <span className="font-headline text-base font-bold text-landing-near-black">Individual</span>
            </label>
            {config.tiers.map((t) => (
              <label key={t.key} className={R_CHOICE}>
                <input type="radio" name="tier" className="mt-1 h-5 w-5 accent-landing-primary" checked={state.tierKey === t.key} onChange={() => onTier(t.key)} />
                <span>
                  <span className="block font-headline text-base font-bold text-landing-near-black">{t.label}</span>
                  {t.percentOff > 0 && <span className={R_HINT}>{`${t.percentOff}% off per person`}</span>}
                </span>
              </label>
            ))}
          </div>
          {tier && tier.minSize < tier.maxSize && (
            <label className="mt-3 block max-w-[12rem]">
              <span className={R_LABEL}>Group size (including you)</span>
              <input type="number" inputMode="numeric" min={tier.minSize} max={tier.maxSize} value={state.groupSize} onChange={(e) => onGroupSize(Number(e.target.value))} aria-invalid={errors.groupSize ? true : undefined} aria-describedby={errors.groupSize ? "err-tier" : undefined} className={R_INPUT} />
            </label>
          )}
          {(errors.tierKey || errors.groupSize) && <span id="err-tier" role="alert" className={R_ERROR}>{errors.tierKey ?? errors.groupSize}</span>}
        </fieldset>
      )}

      {region && state.mode === "live" && region.classTime && (
        <p className={R_HINT}>{`Class time: ${region.classTime} (${region.timezoneLabel})`}</p>
      )}
    </div>
  );
}
