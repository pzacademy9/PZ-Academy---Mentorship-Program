import type { QuoteResult } from "@/lib/landing/registration/pricing";
import type { PromoResult } from "@/lib/landing/registration/promo";
import type { RegistrationConfig } from "@/lib/landing/registration/config";
import type { FormState } from "@/lib/landing/registration/form-state";
import { formatMoney } from "@/lib/landing/registration/format";

export function dueTotal(quote: QuoteResult | null, promo: PromoResult | null): number | null {
  if (!quote || !quote.ok) return null;
  return promo && promo.ok ? promo.total : quote.total;
}

export function OrderSummary({ config, state, quote, promo }: { config: RegistrationConfig; state: FormState; quote: QuoteResult | null; promo: PromoResult | null }) {
  const region = config.regions.find((r) => r.key === state.regionKey);
  const labels = state.optionKeys.map((k) => config.options.find((o) => o.key === k)?.label ?? k);
  const tier = config.tiers.find((t) => t.key === state.tierKey);
  const total = dueTotal(quote, promo);
  return (
    <section aria-labelledby="order-h" className="rounded-landing border border-landing-border bg-landing-surface-container-lowest p-5 shadow-landing-soft">
      <h3 id="order-h" className="font-headline text-base font-bold text-landing-near-black">Your order</h3>
      {labels.length === 0 ? (
        <p className="mt-2 font-landing-body text-sm text-landing-muted">Choose an option to see your price.</p>
      ) : (
        <>
          <dl className="mt-3 space-y-2 font-landing-body text-sm text-landing-on-surface">
            <div><dt className="sr-only">Option</dt><dd className="font-semibold">{labels.join(", ")}</dd></div>
            <div className="flex justify-between gap-3"><dt>Learning</dt><dd>{state.mode === "live" ? "Live sessions" : "Recorded lectures"}</dd></div>
            <div className="flex justify-between gap-3"><dt>Registering</dt><dd>{tier ? `${tier.label} · ${state.groupSize} people` : "Individual"}</dd></div>
            {state.mode === "live" && region?.classTime && <div className="flex justify-between gap-3"><dt>Class time</dt><dd>{region.classTime}</dd></div>}
            {state.mode === "recorded" && <div className="flex justify-between gap-3"><dt>Access</dt><dd>Watch anytime</dd></div>}
            {quote && quote.ok && !quote.isFree && (
              <>
                <div className="flex justify-between gap-3"><dt>Price per person</dt><dd>{formatMoney(quote.perPerson, quote.currency)}</dd></div>
                {quote.savings > 0 && <div className="flex justify-between gap-3 text-landing-primary"><dt>{quote.earlyBirdApplied ? "Early Bird and group savings" : "You save"}</dt><dd>{`− ${formatMoney(quote.savings, quote.currency)}`}</dd></div>}
                {/* A zero-discount promo changes nothing, so it gets no line. */}
                {promo && promo.ok && promo.discount > 0 && <div className="flex justify-between gap-3 text-landing-primary"><dt>{`Promo ${promo.code}`}</dt><dd>{`− ${formatMoney(promo.discount, quote.currency)}`}</dd></div>}
              </>
            )}
          </dl>
          {quote && quote.ok && quote.earlyBirdApplied && <p className="mt-2 font-landing-body text-xs text-landing-muted">Early Bird price</p>}
        </>
      )}
      <div className="mt-4 flex items-baseline justify-between border-t border-landing-border pt-3">
        <span className="font-headline text-sm font-bold text-landing-near-black">Total</span>
        <span data-testid="order-total" aria-live="polite" className="font-headline text-xl font-black text-landing-deep">
          {total === null ? "—" : quote && quote.ok && quote.isFree ? "Free" : formatMoney(total, quote && quote.ok ? quote.currency : region?.currency ?? "")}
        </span>
      </div>
      <p className="mt-2 font-landing-body text-xs text-landing-muted">Secure and verified manually by our team.</p>
    </section>
  );
}
