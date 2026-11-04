import type { LucideIcon } from "lucide-react";

export type WhyCard = { icon: LucideIcon; title: string; text: string };

/** Mint, lime and gold icon tiles (constant tokens, readable in dark mode too). */
const TILE = ["bg-pz-tertiary-fixed text-pz-on-tertiary-fixed", "bg-pz-primary-fixed text-pz-on-primary-fixed", "bg-pz-secondary-container text-pz-on-secondary-container"];

/** "Why study with PZ Academy?" — three white cards on a mint band (Stitch list screens). */
export function WhyCards({ title, text, cards }: { title: string; text: string; cards: WhyCard[] }) {
  return (
    <section aria-labelledby="why-title" className="w-full bg-pz-web-surface-low px-5 py-16 md:px-6">
      <div className="mx-auto max-w-[1320px]">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <h2 id="why-title" className="font-montserrat text-[26px] font-extrabold leading-tight tracking-[-0.02em] text-pz-deep md:text-[30px]">{title}</h2>
          <p className="mt-2 font-poppins text-base text-pz-muted">{text}</p>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {cards.map(({ icon: Icon, title: t, text: d }, i) => (
            <div key={t} className="flex flex-col items-start gap-4 rounded-3xl bg-pz-surface-container-lowest p-7 shadow-[0_8px_30px_rgba(15,61,34,0.05)]">
              <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${TILE[i % TILE.length]}`}>
                <Icon className="h-6 w-6" strokeWidth={1.9} aria-hidden="true" />
              </div>
              <div>
                <h3 className="font-montserrat text-xl font-bold text-pz-deep">{t}</h3>
                <p className="mt-2 font-poppins text-[15px] leading-relaxed text-pz-muted">{d}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
