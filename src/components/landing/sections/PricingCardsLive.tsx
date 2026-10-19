"use client";
// src/components/landing/sections/PricingCardsLive.tsx
// Pricing cards with at least one card linked to a registration option. Prices come from the same
// maths as the registration form (cardPrice); the country switcher and the Early Bird cut-off run in the browser.
// Imports only pure modules so the registration modal stays out of the page bundle.
import { useEffect, useId, useState } from "react";
import type { RegistrationConfig } from "@/lib/landing/registration/types";
import { cardPrice, type CardPrice } from "@/lib/landing/registration/card-price";
import { RegisterButton, type Register } from "../RegisterButton";
import { CheckList } from "./util";

export type LiveRegistration = Pick<RegistrationConfig, "enabled" | "modes" | "recordedPercentOfRegular" | "defaultRegionKey" | "moduleMix" | "tiers" | "prices" | "earlyBirdEndsAt"> & {
  regions: { key: string; label: string; currency: string }[];
  options: { key: string; label: string; kind: "bundle" | "module"; free: boolean }[];
};
export interface LiveCard { name: string; price: string; oldPrice: string; badge: string; features: string; option: string }

export function PricingCardsLive({ heading, note, cards, registration, nowIso, register }: {
  heading: string; note: string; cards: LiveCard[]; registration: LiveRegistration; nowIso: string; register: Register;
}) {
  const selectId = useId();
  const regions = registration.regions;
  const initial = regions.some((g) => g.key === registration.defaultRegionKey) ? registration.defaultRegionKey : regions[0]?.key ?? "";
  const [region, setRegion] = useState(initial);
  const [now, setNow] = useState(() => new Date(nowIso));
  useEffect(() => { setNow(new Date()); }, []);
  const config: RegistrationConfig = {
    ...registration,
    capacity: 0, whatsappVerifyNumber: "", successTitle: "", eventLabel: "", refPrefix: "",
    professions: [], discoveryOptions: [], pixelId: "",
    regions: regions.map((g) => ({ ...g, classTime: "", timezoneLabel: "", accountKeys: [] })),
    options: registration.options.map((o) => ({ ...o, waGroupUrl: "", moduleIds: [] })),
  };
  // Stays put when the chosen country prices no card, so the visitor can switch back.
  const showSwitcher = registration.enabled && regions.length > 1 && cards.some((c) => c.option !== "");

  // Per card: the live figures, or null (hidden). A card without a link, or any card while the form is off, shows its typed price.
  const views = cards
    .map((card) => {
      if (card.option === "") return { card, live: null as CardPrice | null, typed: true };
      if (!registration.enabled) return card.price !== "" ? { card, live: null, typed: true } : null;
      const live = cardPrice(config, card.option, region, now);
      return live ? { card, live, typed: false } : null;
    })
    .filter((v): v is { card: LiveCard; live: CardPrice | null; typed: boolean } => v !== null);
  if (views.length === 0 && !(showSwitcher && region !== initial)) return null;

  return (
    <div className="border-b border-landing-border bg-landing-surface-container-lowest py-10 md:py-20">
      <div className="mx-auto max-w-7xl">
        {heading || note ? (
          <div className="mx-auto mb-6 max-w-2xl px-4 text-center md:mb-14">
            {heading ? <h2 className="font-headline text-xl font-bold tracking-tight text-landing-deep sm:text-3xl lg:text-4xl">{heading}</h2> : null}
            {note ? (
              <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-landing-mint/40 bg-landing-mint-light px-3 py-1 text-xs font-semibold text-landing-deep">{note}</p>
            ) : null}
          </div>
        ) : null}
        {showSwitcher ? (
          <div className="mx-auto mb-4 flex items-center justify-center gap-2 px-4 md:mb-8">
            <label htmlFor={selectId} className="text-sm font-semibold text-landing-deep">Prices for:</label>
            <select
              id={selectId}
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="min-h-[44px] rounded-landing border border-landing-border bg-landing-surface px-3 text-sm font-semibold text-landing-deep"
            >
              {regions.map((g) => <option key={g.key} value={g.key}>{g.label || g.key}</option>)}
            </select>
          </div>
        ) : null}
        <div className="flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-4 pt-5 [scrollbar-width:none] md:scroll-px-6 md:px-6 lg:snap-none lg:flex-wrap lg:items-stretch lg:justify-center lg:gap-8 lg:overflow-visible">
          {views.map(({ card: it, live }, i) => {
            const featured = it.badge !== "";
            const priceCls = `font-headline font-extrabold tracking-tight text-landing-deep ${featured ? "text-3xl md:text-4xl" : "text-2xl md:text-3xl"}`;
            return (
              <div
                key={i}
                className={`relative flex w-[295px] shrink-0 snap-start flex-col justify-between rounded-landing p-5 md:p-8 lg:w-auto lg:max-w-sm lg:flex-1 lg:basis-[300px] ${
                  featured
                    ? "border-2 border-landing-primary bg-landing-surface-container-lowest shadow-landing-soft-lg lg:-translate-y-2"
                    : "border border-landing-border bg-landing-surface"
                }`}
              >
                {featured ? (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-landing-primary/30 bg-landing-mint px-4 py-1 font-headline text-xs font-bold uppercase tracking-wider text-landing-deep shadow-landing-soft">
                    {it.badge}
                  </div>
                ) : null}
                <div>
                  {it.name ? <h3 className={`mb-4 font-headline font-bold text-landing-deep ${featured ? "mt-2 text-xl" : "text-lg"}`}>{it.name}</h3> : null}
                  {live === null ? (
                    it.price ? (
                      <div className="mb-5 rounded-landing md:mb-6">
                        {it.oldPrice ? <span className="text-sm font-semibold text-landing-muted line-through">{it.oldPrice}</span> : null}
                        <p className={priceCls}>{it.price}</p>
                      </div>
                    ) : null
                  ) : live.kind === "group" ? (
                    <ul className="mb-5 space-y-1 text-sm font-semibold text-landing-deep md:mb-6">
                      {live.lines.map((l, j) => <li key={j}>{l}</li>)}
                    </ul>
                  ) : (
                    <div className="mb-5 rounded-landing md:mb-6">
                      {live.strike ? <span className="text-sm font-semibold text-landing-muted line-through">{live.strike}</span> : null}
                      <p className={priceCls}>
                        {live.current}
                        {live.suffix ? <span className="ml-1 text-sm font-semibold text-landing-muted">{live.suffix}</span> : null}
                      </p>
                      {live.earlyEnds ? <p className="mt-1 text-xs font-semibold text-landing-primary">{`Early Bird ends ${live.earlyEnds}`}</p> : null}
                      {live.recorded ? <p className="mt-1 text-xs text-landing-muted">{`Recorded: ${live.recorded}`}</p> : null}
                      {live.groupLines.length > 0 ? (
                        <ul className="mt-2 space-y-0.5 text-xs text-landing-on-surface">
                          {live.groupLines.map((l, j) => <li key={j}>{l}</li>)}
                        </ul>
                      ) : null}
                    </div>
                  )}
                  <CheckList text={it.features} className="mb-6 text-sm text-landing-on-surface md:mb-8" />
                </div>
                <RegisterButton register={register} variant={featured ? "primary" : "outline"} className="w-full" menuPlacement="up" />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
