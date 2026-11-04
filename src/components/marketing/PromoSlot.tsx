import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Promo } from "@/lib/marketing/promo";

/**
 * A native in-site promo. Always labelled "Featured" (honest — it is our own
 * program, never dressed up as content). Renders nothing without a promo.
 * "banner": wide block between page sections. "card": fits inside a card grid.
 */
export function PromoSlot({ promo, variant = "banner" }: { promo: Promo | null; variant?: "banner" | "card" }) {
  if (!promo) return null;
  const external = /^https?:\/\//.test(promo.href);
  const linkProps = external ? { target: "_blank", rel: "noopener noreferrer" } : {};

  const label = (
    <span className="self-start inline-flex items-center gap-1.5 text-[.72rem] font-poppins font-bold uppercase tracking-[.12em] text-pz-bright">
      <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-pz-bright" />
      Featured
    </span>
  );

  const button = (
    <Link
      href={promo.href}
      {...linkProps}
      className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-full bg-pz-bright px-6 py-3 font-poppins text-sm font-bold text-pz-forest transition-colors duration-200 hover:bg-pz-pale focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pz-bright"
    >
      {promo.ctaText} <ArrowRight className="w-4 h-4" aria-hidden="true" />
    </Link>
  );

  if (variant === "card") {
    return (
      <aside aria-label="Featured" className="flex flex-col gap-4 rounded-2xl bg-pz-solid-forest p-6 text-white">
        {label}
        <h3 className="font-montserrat text-lg font-bold leading-snug">{promo.headline}</h3>
        {promo.detail && <p className="font-poppins text-sm text-[rgba(255,255,255,.8)]">{promo.detail}</p>}
        <div className="mt-auto">{button}</div>
      </aside>
    );
  }

  return (
    <section aria-label="Featured" className="bg-white px-6 py-12">
      <div className="relative mx-auto flex max-w-[1060px] flex-col gap-4 overflow-hidden rounded-2xl bg-pz-solid-forest p-7 text-white md:flex-row md:items-center md:justify-between md:p-10">
        {promo.imageUrl && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={promo.imageUrl} alt="" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-cover opacity-25" />
          </>
        )}
        <div className="relative flex flex-col gap-2">
          {label}
          <h2 className="font-montserrat text-xl font-extrabold leading-tight md:text-2xl">{promo.headline}</h2>
          {promo.detail && <p className="font-poppins text-sm text-[rgba(255,255,255,.8)]">{promo.detail}</p>}
        </div>
        <div className="relative">{button}</div>
      </div>
    </section>
  );
}
