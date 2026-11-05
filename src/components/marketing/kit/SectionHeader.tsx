import type { ReactNode } from "react";

/**
 * The heading block every website section starts with (Stitch "PZ Academy
 * Platform 2"): a small green uppercase kicker, a bold title, an optional
 * line of text and an optional link on the right.
 * Pass `titleId` (or `kickerId`) so the section can be labelled by it.
 */
export function SectionHeader({
  kicker,
  title,
  text,
  titleId,
  kickerId,
  action,
  tone = "light",
  align = "left",
}: {
  kicker: string;
  title: ReactNode;
  text?: ReactNode;
  titleId?: string;
  kickerId?: string;
  action?: ReactNode;
  tone?: "light" | "dark";
  align?: "center" | "left";
}) {
  const dark = tone === "dark";
  const centred = align === "center";
  return (
    <div
      className={`mb-8 flex flex-col gap-4 md:mb-12 ${
        centred ? "items-center text-center" : "sm:flex-row sm:items-end sm:justify-between"
      }`}
    >
      <div className={`flex max-w-2xl flex-col gap-1.5 ${centred ? "items-center" : ""}`}>
        <span
          id={kickerId}
          className={`font-poppins text-xs font-bold uppercase tracking-wider ${dark ? "text-pz-bright" : "text-pz-mid"}`}
        >
          {kicker}
        </span>
        <h2
          id={titleId}
          className={`font-montserrat text-[28px] font-extrabold leading-[34px] tracking-[-0.02em] md:text-[40px] md:leading-[48px] md:tracking-[-0.025em] ${
            dark ? "text-white" : "text-pz-deep"
          }`}
        >
          {title}
        </h2>
        {text && (
          <p className={`font-poppins text-sm leading-relaxed md:text-base ${dark ? "text-white/75" : "text-pz-muted"}`}>
            {text}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
