// src/lib/landing/terms.ts
// Which Terms and Conditions text a landing page shows, and how plain text becomes blocks.

export type ResolvedTerms = { text: string; source: "page" | "general" };

/** The page's own text wins; otherwise the general text; otherwise none (no link anywhere). */
export function resolveTerms(pageText: string | undefined, generalText: string): ResolvedTerms | null {
  if (pageText && pageText.trim() !== "") return { text: pageText, source: "page" };
  if (generalText.trim() !== "") return { text: generalText, source: "general" };
  return null;
}

export type TermsBlock = { kind: "heading" | "p"; text: string };

const HEADING = /^\d+\.\s+\S.{0,80}$/;

/** Paragraphs split on blank lines; a one-line paragraph like "1. Payment and refunds" is a heading. */
export function termsBlocks(text: string): TermsBlock[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter((b) => b !== "")
    .map((b) => ({ kind: !b.includes("\n") && HEADING.test(b) ? ("heading" as const) : ("p" as const), text: b }));
}
