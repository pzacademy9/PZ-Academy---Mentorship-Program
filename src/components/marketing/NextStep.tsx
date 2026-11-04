import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";

type StepLink = { href: string; label: string };

const HEX_BG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='104' viewBox='0 0 60 104'%3E%3Cpolygon fill='none' stroke='rgba(255%2C255%2C255%2C0.03)' stroke-width='1.2' points='30%2C3 57%2C18 57%2C48 30%2C63 3%2C48 3%2C18'/%3E%3C/svg%3E")`;

/**
 * Closing call-to-action for the list pages. The main button keeps the visitor
 * on this page's own programs; the second points one step up the ladder
 * (webinars -> workshops -> courses -> mentorship).
 */
export function NextStep({ title, text, primary, next }: { title: ReactNode; text: string; primary: StepLink; next: StepLink }) {
  return (
    <section aria-labelledby="next-step-title" className="py-20 md:py-24 px-6 bg-gradient-to-br from-pz-solid-deep to-[#1a4a2e] text-center relative overflow-hidden z-10">
      <div aria-hidden="true" className="absolute inset-0" style={{ backgroundImage: HEX_BG, backgroundSize: "60px 104px" }} />
      <div className="relative z-10 max-w-[660px] mx-auto">
        <span id="next-step-title" className="text-pz-bright text-[.75rem] font-semibold tracking-[.13em] uppercase font-poppins">Your next step</span>
        <h2 className="font-montserrat text-[clamp(1.9rem,3.5vw,2.8rem)] font-extrabold text-white leading-[1.15] tracking-[-0.015em] mt-3 mb-4">{title}</h2>
        <p className="text-[rgba(255,255,255,.75)] text-[.97rem] leading-[1.8] mb-10 font-poppins">{text}</p>
        <div className="flex gap-4 justify-center flex-wrap">
          <Link href={primary.href} className="inline-flex min-h-11 items-center gap-2 bg-pz-bright text-pz-forest font-poppins font-bold px-8 py-3.5 rounded-full text-base transition-all duration-200 hover:bg-pz-pale hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgba(126,217,87,.3)]">
            {primary.label}
          </Link>
          <Link href={next.href} className="inline-flex min-h-11 items-center gap-2 text-white border-[1.5px] border-[rgba(255,255,255,.32)] font-poppins font-semibold px-8 py-3.5 rounded-full text-base transition-all duration-200 hover:border-pz-bright hover:text-pz-bright hover:-translate-y-0.5">
            {next.label} <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
