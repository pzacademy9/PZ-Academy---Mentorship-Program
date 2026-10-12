// src/components/landing/sections/PricingCards.tsx
import { RegisterButton } from "../RegisterButton";
import { CheckList, rows, str } from "./util";
import type { SectionProps } from "./types";

export function PricingCards({ data, register }: SectionProps) {
  const items = rows(data, "items")
    .map((i) => ({ name: str(i, "name"), price: str(i, "price"), oldPrice: str(i, "oldPrice"), badge: str(i, "badge"), features: str(i, "features") }))
    .filter((i) => i.name || i.price);
  if (items.length === 0) return null;
  const heading = str(data, "heading");
  const note = str(data, "note");
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
        {/* Phone: swipeable snap carousel. Desktop: plain row of cards. */}
        <div className="flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-4 pt-5 [scrollbar-width:none] md:scroll-px-6 md:px-6 lg:snap-none lg:flex-wrap lg:items-stretch lg:justify-center lg:gap-8 lg:overflow-visible">
          {items.map((it, i) => {
            const featured = it.badge !== "";
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
                  {it.price ? (
                    <div className="mb-5 rounded-landing md:mb-6">
                      {it.oldPrice ? <span className="text-sm font-semibold text-landing-muted line-through">{it.oldPrice}</span> : null}
                      <p className={`font-headline font-extrabold tracking-tight text-landing-deep ${featured ? "text-3xl md:text-4xl" : "text-2xl md:text-3xl"}`}>{it.price}</p>
                    </div>
                  ) : null}
                  <CheckList text={it.features} className="mb-6 text-sm text-landing-on-surface md:mb-8" />
                </div>
                <RegisterButton register={register} variant={featured ? "primary" : "outline"} className="w-full" />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
