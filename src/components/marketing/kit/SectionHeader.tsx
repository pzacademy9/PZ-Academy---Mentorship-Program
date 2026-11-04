import type { ReactNode } from "react";

/**
 * The heading block every website section starts with: a small playful
 * kicker pill, a bold title and an optional line of text.
 * Pass `titleId` (or `kickerId`) so the section can be labelled by it.
 */
export function SectionHeader({
  kicker,
  title,
  text,
  titleId,
  kickerId,
  tone = "light",
  align = "center",
}: {
  kicker: string;
  title: ReactNode;
  text?: ReactNode;
  titleId?: string;
  kickerId?: string;
  tone?: "light" | "dark";
  align?: "center" | "left";
}) {
  const dark = tone === "dark";
  const centred = align === "center";
  return (
    <div className={`mb-12 md:mb-14 ${centred ? "text-center" : "text-left"}`}>
      <span
        id={kickerId}
        className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1 font-fredoka text-[.78rem] font-semibold uppercase tracking-[.12em] ${
          dark ? "bg-white/10 text-pz-bright" : "bg-pz-bright/15 text-pz-mid"
        }`}
      >
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-pz-bright" />
        {kicker}
      </span>
      <h2
        id={titleId}
        className={`mt-4 font-montserrat text-[clamp(1.75rem,3.4vw,2.6rem)] font-extrabold leading-[1.15] tracking-[-0.02em] ${
          dark ? "text-white" : "text-pz-deep"
        }`}
      >
        {title}
      </h2>
      {text && (
        <p
          className={`mt-4 max-w-[560px] font-poppins text-[.98rem] leading-relaxed ${centred ? "mx-auto" : ""} ${
            dark ? "text-white/70" : "text-pz-muted"
          }`}
        >
          {text}
        </p>
      )}
    </div>
  );
}
