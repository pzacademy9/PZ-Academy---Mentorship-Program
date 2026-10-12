// src/components/landing/sections/util.tsx
// Small shared helpers for the section components. Section data is already normalized, but these
// stay defensive so a surprise shape can never throw while rendering a public page.
import type { Inline } from "@/lib/landing/simple-text";
import { parseSimpleText } from "@/lib/landing/simple-text";
import { InlineNodes } from "../SimpleText";

export function str(d: Record<string, unknown> | undefined, key: string): string {
  const v = d?.[key];
  return typeof v === "string" ? v.trim() : "";
}

export function rows(d: Record<string, unknown> | undefined, key: string): Record<string, unknown>[] {
  const v = d?.[key];
  return Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null) : [];
}

export function SectionHeader({ heading, sub, className = "" }: { heading: string; sub?: string; className?: string }) {
  if (!heading && !sub) return null;
  return (
    <div className={`mx-auto mb-8 max-w-2xl text-center md:mb-12 ${className}`}>
      {heading ? <h2 className="font-headline text-xl font-bold tracking-tight text-landing-deep sm:text-3xl lg:text-4xl">{heading}</h2> : null}
      {sub ? <p className="mt-3 text-sm text-landing-on-surface md:text-base">{sub}</p> : null}
    </div>
  );
}

export function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={`h-5 w-5 shrink-0 fill-none stroke-landing-primary ${className}`} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" className="stroke-landing-mint" />
      <path d="M8 12.5l2.7 2.7L16 9.5" />
    </svg>
  );
}

/** Admin mini-markup rendered as a check-marked list (every line / bullet becomes a row). */
export function CheckList({ text, className = "" }: { text: string; className?: string }) {
  const blocks = parseSimpleText(text);
  const lines: Inline[][] = blocks.flatMap((b) => (b.t === "ul" ? b.items : [b.inline]));
  if (lines.length === 0) return null;
  return (
    <ul className={`space-y-2.5 ${className}`}>
      {lines.map((nodes, i) => (
        <li key={i} className="flex items-start gap-2.5">
          <CheckIcon className="mt-0.5 h-4 w-4" />
          <span><InlineNodes nodes={nodes} /></span>
        </li>
      ))}
    </ul>
  );
}
