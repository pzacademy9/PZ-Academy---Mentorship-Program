import Link from "next/link";

/**
 * Phone-only bar fixed to the bottom of a course page: price + the one main
 * button, so buying never needs a long scroll. Hidden on large screens, where
 * the sticky side box does the same job. The page adds a phone-only spacer
 * after the footer so the bar never covers content.
 */
export function StickyEnrollBar({ priceLabel, price, action }: { priceLabel: string; price: string; action: { href: string; label: string } }) {
  return (
    <section
      aria-label="Enroll bar"
      className="lg:hidden fixed inset-x-0 bottom-0 z-40 border-t border-pz-border bg-pz-surface-container-lowest/95 backdrop-blur px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-6px_24px_rgba(15,61,34,.12)]"
    >
      <div className="mx-auto flex max-w-[640px] items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="font-poppins text-[11px] font-bold uppercase tracking-wider text-pz-muted">{priceLabel}</p>
          <p className="truncate font-montserrat text-lg font-extrabold text-pz-deep">{price}</p>
        </div>
        <Link
          href={action.href}
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-pz-bright px-6 py-3 font-montserrat text-sm font-bold text-pz-solid-deep shadow-md transition-transform hover:scale-[1.02]"
        >
          {action.label}
        </Link>
      </div>
    </section>
  );
}
