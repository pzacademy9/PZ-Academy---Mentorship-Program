import type { ReactNode } from "react";

const HEX_BG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='104' viewBox='0 0 60 104'%3E%3Cpolygon fill='none' stroke='rgba(255%2C255%2C255%2C0.045)' stroke-width='1.2' points='30%2C3 57%2C18 57%2C48 30%2C63 3%2C48 3%2C18'/%3E%3Cpolygon fill='none' stroke='rgba(255%2C255%2C255%2C0.045)' stroke-width='1.2' points='30%2C63 57%2C78 57%2C104 3%2C104 3%2C78'/%3E%3C/svg%3E")`;

/**
 * Short dark hero shared by the Courses / Workshops / Webinars list pages.
 * Deliberately not full-screen: the programs themselves should show on the
 * first phone screen. Always dark, so the transparent top menu stays readable.
 */
export function MarketingHero({
  kicker,
  title,
  text,
  action,
}: {
  kicker: string;
  title: ReactNode;
  text: string;
  action?: ReactNode;
}) {
  return (
    <section className="relative flex items-center justify-center text-center overflow-hidden bg-pz-solid-deep">
      <div aria-hidden="true" className="absolute inset-0 opacity-75" style={{ backgroundImage: HEX_BG, backgroundSize: "60px 104px" }} />
      <div aria-hidden="true" className="absolute w-[600px] h-[600px] rounded-full bg-pz-bright opacity-[.07] blur-[90px] -top-[180px] -right-[120px] animate-[orbFloat1_12s_ease-in-out_infinite] pointer-events-none" />
      <div aria-hidden="true" className="absolute w-[450px] h-[450px] rounded-full bg-pz-solid-mid opacity-[.13] blur-[90px] -bottom-20 -left-20 animate-[orbFloat2_15s_ease-in-out_infinite] pointer-events-none" />
      <div className="relative z-10 max-w-[820px] px-6 pt-28 pb-12 md:pt-36 md:pb-20">
        <div className="inline-flex items-center gap-2 bg-[rgba(126,217,87,.1)] border border-[rgba(126,217,87,.28)] text-pz-bright text-[.75rem] font-semibold tracking-[.1em] uppercase px-4 py-1.5 rounded-full mb-5">
          <span aria-hidden="true" className="w-1.5 h-1.5 bg-pz-bright rounded-full animate-[pls_2s_ease-in-out_infinite]" />
          {kicker}
        </div>
        <h1 className="font-montserrat text-[clamp(1.9rem,6vw,4rem)] font-extrabold text-white leading-[1.08] tracking-[-0.02em]">{title}</h1>
        <p className="text-[clamp(.95rem,1.6vw,1.1rem)] text-[rgba(255,255,255,.75)] max-w-[560px] mx-auto mt-5 leading-[1.75] font-poppins">{text}</p>
        {action && <div className="flex gap-3.5 justify-center flex-wrap mt-8">{action}</div>}
      </div>
    </section>
  );
}

/** The bright pill button used across the marketing pages, 44px+ tall. */
export const HERO_BUTTON =
  "inline-flex min-h-11 items-center gap-2 bg-pz-bright text-pz-forest font-poppins font-bold px-7 py-3 rounded-full transition-all duration-200 hover:bg-pz-pale hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgba(126,217,87,.3)]";
