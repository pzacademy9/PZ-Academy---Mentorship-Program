import Link from "next/link";

/**
 * Phone-only bar fixed to the bottom of a course page: price + the one main
 * button, so buying never needs a long scroll. Hidden on large screens, where
 * the sticky side box does the same job. The page adds bottom padding (pb-28)
 * so the bar never covers content.
 */
export function StickyEnrollBar({ priceLabel, price, action }: { priceLabel: string; price: string; action: { href: string; label: string } }) {
  return (
    <section
      aria-label="Enroll bar"
      className="lg:hidden fixed inset-x-0 bottom-0 z-40 border-t border-pz-outline-variant/40 bg-pz-surface-container-lowest/95 backdrop-blur px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-6px_24px_rgba(0,0,0,.12)]"
    >
      <div className="mx-auto flex max-w-[640px] items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs text-pz-on-surface-variant font-body">{priceLabel}</p>
          <p className="truncate text-lg font-black text-pz-deep font-headline">{price}</p>
        </div>
        <Link
          href={action.href}
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-pz-primary px-5 py-3 text-sm font-bold text-pz-on-primary font-headline transition-colors hover:bg-pz-on-primary-container"
        >
          {action.label}
        </Link>
      </div>
    </section>
  );
}
