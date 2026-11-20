// src/lib/landing/registration/match-choice.ts
// Pure label matcher: turns a saved purchase label into page option keys. No server or database imports.

export type ChoiceOption = { key: string; label: string; kind: "bundle" | "module"; moduleIds: string[] };

const TIER_RE = /^(individual|group\b.*)$/;

function normalise(label: string): string {
  return label.toLowerCase().replace(/[\u2013\u2014]/g, "-").replace(/\s+/g, " ").trim();
}

/** The mode and the option text (the middle part between the mode and the tier text), lowercased. */
export function splitLabel(label: string): { mode: "live" | "recorded" | null; optionText: string } {
  const parts = normalise(label).split(/\s+-\s+/).filter((p) => p !== "");
  let mode: "live" | "recorded" | null = null;
  if (parts[0] === "live" || parts[0] === "recorded") {
    mode = parts[0];
    parts.shift();
  }
  if (parts.length > 0 && TIER_RE.test(parts[parts.length - 1])) parts.pop();
  return { mode, optionText: parts.join(" - ") };
}

/** The module number an option stands for, read strictly from "Module 3" / "M3" (label) or "m3" / "module-3" (key). */
function moduleNumber(o: ChoiceOption): string | null {
  const l = /^(?:module|m)\s*(\d+)$/.exec(o.label.toLowerCase().trim());
  if (l) return String(Number(l[1]));
  const k = /^(?:module|m)[-_ ]?(\d+)$/.exec(o.key.toLowerCase().trim());
  return k ? String(Number(k[1])) : null;
}

export function suggestOptions(label: string, options: readonly ChoiceOption[]): { keys: string[]; confident: boolean } {
  const { optionText } = splitLabel(label);
  const text = optionText.replace(/^modules?\s*:\s*/, "");
  const tokens = text.split(/,|\+|\band\b/).map((t) => t.trim()).filter((t) => t !== "");
  const keys: string[] = [];
  let allMatched = tokens.length > 0;
  for (const token of tokens) {
    let hits: ChoiceOption[] = [];
    if (token === "full course" || token === "full") {
      hits = options.filter((o) => o.kind === "bundle");
    } else {
      const m = /^(?:m|module)?\s*(\d+)$/.exec(token);
      if (m) hits = options.filter((o) => o.kind === "module" && moduleNumber(o) === String(Number(m[1])));
    }
    if (hits.length === 1) {
      if (!keys.includes(hits[0].key)) keys.push(hits[0].key);
    } else {
      allMatched = false;
    }
  }
  // A module option with no module ticked would mean the whole course, so it is never a certain match.
  const noModule = keys.some((k) => options.some((o) => o.key === k && o.kind === "module" && o.moduleIds.length === 0));
  return { keys, confident: allMatched && !noModule };
}
