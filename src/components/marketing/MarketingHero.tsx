import type { ReactNode } from "react";

/**
 * Short dark band at the top of the Courses / Workshops / Webinars lists
 * (Stitch "PZ Academy Platform 2"). Sits under the light top menu, so it
 * pads for the fixed 80px bar. `children` is where the list puts its search
 * box and filter buttons.
 */
export function MarketingHero({
  kicker,
  title,
  text,
  align = "center",
  children,
}: {
  kicker: ReactNode;
  title: ReactNode;
  text: ReactNode;
  align?: "center" | "left";
  children?: ReactNode;
}) {
  const centred = align === "center";
  return (
    <section className="relative w-full overflow-hidden bg-pz-solid-deep px-5 pb-12 pt-[7.5rem] text-white md:px-6 md:pb-16 md:pt-[8.5rem]">
      <div aria-hidden="true" className="pointer-events-none absolute -top-24 right-1/4 h-96 w-96 rounded-full bg-pz-bright/15 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-20 -left-12 h-80 w-80 rounded-full bg-pz-solid-mid/30 blur-3xl" />
      <div className={`relative mx-auto flex max-w-[1320px] flex-col ${centred ? "items-center text-center" : "items-start text-left"}`}>
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-pz-solid-forest/80 px-3 py-1 shadow-sm">
          <span aria-hidden="true" className="h-2 w-2 animate-pulse rounded-full bg-pz-bright" />
          <span className="font-poppins text-xs font-bold uppercase tracking-wider text-pz-bright">{kicker}</span>
        </div>
        <h1 className="max-w-3xl font-montserrat text-[32px] font-extrabold leading-[1.15] tracking-[-0.025em] text-white md:text-[48px]">{title}</h1>
        <p className={`mt-3 max-w-2xl font-poppins text-base leading-relaxed text-white/80 md:text-lg ${centred ? "mx-auto" : ""}`}>{text}</p>
        {children && <div className="mt-8 w-full">{children}</div>}
      </div>
    </section>
  );
}
