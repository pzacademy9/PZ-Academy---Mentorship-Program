import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";

type StepLink = { href: string; label: string };

/**
 * Closing dark band on the list pages (Stitch "Next step band"). The quiet
 * button keeps the visitor on this page's own programs; the lime one points
 * one step up the ladder (webinars -> workshops -> courses -> mentorship).
 */
export function NextStep({
  kicker = "Your next step",
  title,
  text,
  primary,
  next,
}: {
  kicker?: string;
  title: ReactNode;
  text: string;
  primary: StepLink;
  next: StepLink;
}) {
  return (
    <section aria-label="Your next step" className="relative w-full overflow-hidden bg-pz-solid-deep px-5 py-16 text-white md:px-6">
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-20 -right-20 h-80 w-80 rounded-full bg-pz-bright/20 blur-3xl" />
      <div className="relative mx-auto flex max-w-[1320px] flex-col items-start justify-between gap-8 md:flex-row md:items-center">
        <div className="flex max-w-2xl flex-col">
          <span className="mb-2 font-poppins text-xs font-bold uppercase tracking-wider text-pz-bright">{kicker}</span>
          <h2 className="break-words font-montserrat text-[28px] font-extrabold leading-tight tracking-[-0.025em] text-white md:text-[40px]">{title}</h2>
          <p className="mt-2 font-poppins text-base leading-relaxed text-white/80 md:text-lg">{text}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-4">
          <Link href={primary.href} className="inline-flex min-h-11 items-center rounded-full bg-pz-solid-forest px-6 py-3 font-montserrat text-[15px] font-bold text-white transition-transform hover:scale-[1.02] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
            {primary.label}
          </Link>
          <Link href={next.href} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-pz-bright px-7 py-3 font-montserrat text-[15px] font-bold text-pz-solid-deep shadow-md transition-transform hover:scale-[1.02] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pz-bright">
            {next.label} <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
