// Audience rules for class emails and IDs. Pure code, shared by the UI,
// the server action and the SQL filter (via optionPatterns).

export type OptionScope = {
  mode: "live" | "recorded" | "unknown";
  full: boolean;
  modules: number[];
};

export function parseOption(label: string): OptionScope {
  const text = (label ?? "").trim().toLowerCase();
  const mode: OptionScope["mode"] = text.startsWith("live")
    ? "live"
    : text.startsWith("recorded")
      ? "recorded"
      : "unknown";
  const full = text.includes("full course");
  const m = /modules?:\s*((?:m\d+\s*,?\s*)+)/i.exec(label ?? "");
  const modules = m
    ? Array.from(m[1].matchAll(/m(\d+)/gi), (x) => Number(x[1]))
    : [];
  return { mode, full, modules };
}

export type Audience = { mode: "live" | "any"; modules: number[] | "all" };
export type ExcludeReason = "recorded" | "wrong_module" | "unrecognised";

export function matchAudience(
  opt: OptionScope,
  a: Audience,
): { include: true } | { include: false; reason: ExcludeReason } {
  if (opt.mode === "unknown") return { include: false, reason: "unrecognised" };
  if (a.mode === "live" && opt.mode === "recorded") {
    return { include: false, reason: "recorded" };
  }
  if (a.modules === "all" || opt.full) return { include: true };
  if (opt.modules.some((n) => (a.modules as number[]).includes(n))) {
    return { include: true };
  }
  return { include: false, reason: "wrong_module" };
}

export function audienceFromJson(v: unknown): Audience | null {
  if (!v || typeof v !== "object") return null;
  const o = v as { mode?: unknown; modules?: unknown };
  if (o.mode !== "live" && o.mode !== "any") return null;
  if (o.modules === "all") return { mode: o.mode, modules: "all" };
  if (
    Array.isArray(o.modules) &&
    o.modules.every((n) => typeof n === "number" && Number.isInteger(n))
  ) {
    return { mode: o.mode, modules: o.modules as number[] };
  }
  return null;
}

export const AUDIENCE_PRESETS: {
  key: string;
  label: string;
  audience: Audience;
}[] = [
  { key: "all_live", label: "All live students", audience: { mode: "live", modules: "all" } },
  { key: "everyone", label: "Everyone with an ID", audience: { mode: "any", modules: "all" } },
];

export function presetLiveWithModule(n: number): Audience {
  return { mode: "live", modules: [n] };
}

// SQL ilike patterns agreeing with parseOption. A module number is matched
// only when followed by a comma, a space or the end of the label, so M1 never
// matches M10 or M12.
export function optionPatterns(scope: "full" | number): string[] {
  if (scope === "full") return ["%full course%"];
  const m = `m${scope}`;
  return [`%module%:%${m},%`, `%module%:%${m} %`, `%module%:%${m}`];
}
