// src/lib/landing/dates.ts
// Pure date formatting and {dates} / {weekdays} marker replacement for landing pages.
// Use `import type` for content types: content.ts and variants.ts must not be pulled in at runtime from here.
import type { LandingContent } from "./content";
import type { VariantRef } from "./variants";
import { SECTION_DEFS } from "./sections";

type Range = { start: string; end: string };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MARKER_RE = /\{(dates|weekdays)(?::([a-z0-9]+(?:-[a-z0-9]+)*))?\}/g;
const BRACKETED_WEEKDAYS_RE = / \(\{weekdays(?::([a-z0-9]+(?:-[a-z0-9]+)*))?\}\)/g;
const DAY_MS = 86_400_000;

function parse(v: string): { y: number; m: number; d: number; t: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const t = Date.UTC(y, m - 1, d);
  const back = new Date(t);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) return null;
  return { y, m, d, t };
}

export function isRealDate(v: string): boolean {
  return parse(v) !== null;
}

export function formatDateRange(start: string, end: string): string {
  const a = parse(start);
  const b = parse(end);
  if (!a || !b || b.t < a.t) return "";
  if (a.t === b.t) return `${a.d} ${MONTHS[a.m - 1]} ${a.y}`;
  if (a.y === b.y && a.m === b.m) return `${a.d} – ${b.d} ${MONTHS[b.m - 1]} ${b.y}`;
  if (a.y === b.y) return `${a.d} ${MONTHS[a.m - 1]} – ${b.d} ${MONTHS[b.m - 1]} ${b.y}`;
  return `${a.d} ${MONTHS[a.m - 1]} ${a.y} – ${b.d} ${MONTHS[b.m - 1]} ${b.y}`;
}

export function weekdayText(ranges: Range[]): string {
  const days = new Set<number>();
  for (const r of ranges) {
    const a = parse(r.start);
    const b = parse(r.end);
    if (!a || !b || b.t < a.t) continue;
    const count = Math.round((b.t - a.t) / DAY_MS) + 1;
    if (count > 7) return "";
    for (let i = 0; i < count; i++) days.add((new Date(a.t + i * DAY_MS).getUTCDay() + 6) % 7);
  }
  if (days.size === 0 || days.size === 7) return "";
  const names = Array.from(days).sort((x, y) => x - y).map((d) => WEEKDAYS[d]);
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

function moduleRange(c: LandingContent, key: string): Range | null {
  const m = c.modules.find((x) => x.key === key);
  if (!m || !m.startsOn || !m.endsOn || !isRealDate(m.startsOn) || !isRealDate(m.endsOn)) return null;
  if (m.endsOn < m.startsOn) return null;
  return { start: m.startsOn, end: m.endsOn };
}

function allModuleRanges(c: LandingContent): Range[] {
  const out: Range[] = [];
  for (const m of c.modules) {
    const r = moduleRange(c, m.key);
    if (r) out.push(r);
  }
  return out;
}

export function datesFor(c: LandingContent, moduleKey: string | null): Range | null {
  if (moduleKey) return moduleRange(c, moduleKey);
  const ranges = allModuleRanges(c);
  if (ranges.length > 0) {
    return {
      start: ranges.reduce((min, r) => (r.start < min ? r.start : min), ranges[0].start),
      end: ranges.reduce((max, r) => (r.end > max ? r.end : max), ranges[0].end),
    };
  }
  // Event dates are only for pages with no modules; a page that has modules ignores them.
  if (c.modules.length > 0) return null;
  const s = c.settings.eventStartsOn ?? "";
  const e = c.settings.eventEndsOn ?? "";
  return isRealDate(s) && isRealDate(e) && e >= s ? { start: s, end: e } : null;
}

/** Weekday ranges for a marker: one module, every module with dates, or the whole-page range. */
function weekdayRanges(c: LandingContent, moduleKey: string | null): Range[] {
  if (moduleKey) {
    const r = moduleRange(c, moduleKey);
    return r ? [r] : [];
  }
  const ranges = allModuleRanges(c);
  if (ranges.length > 0) return ranges;
  const r = datesFor(c, null);
  return r ? [r] : [];
}

function resolveMarker(c: LandingContent, kind: string, key: string | undefined, refKey: string | null): string {
  const moduleKey = key ?? refKey;
  if (kind === "dates") {
    const r = datesFor(c, moduleKey);
    return r ? formatDateRange(r.start, r.end) : "";
  }
  return weekdayText(weekdayRanges(c, moduleKey));
}

function replaceStrings(value: unknown, fn: (s: string) => string): unknown {
  if (typeof value === "string") return fn(value);
  if (Array.isArray(value)) return value.map((v) => replaceStrings(v, fn));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = replaceStrings(v, fn);
    return out;
  }
  return value;
}

export function applyAutoDates(c: LandingContent, ref: Pick<VariantRef, "moduleKey">): LandingContent {
  const refKey = ref.moduleKey;
  const replaceText = (s: string): string => {
    if (!s.includes("{")) return s;
    const step1 = s.replace(BRACKETED_WEEKDAYS_RE, (_m, key: string | undefined) => {
      const text = resolveMarker(c, "weekdays", key, refKey);
      return text ? ` (${text})` : "";
    });
    return step1.replace(MARKER_RE, (_m, kind: string, key: string | undefined) => resolveMarker(c, kind, key, refKey));
  };

  const sections = c.sections.map((section) => {
    let data = replaceStrings(section.data, replaceText) as Record<string, unknown>;
    if (section.type === "schedule" && Array.isArray(data.items)) {
      data = {
        ...data,
        items: data.items.map((item: unknown) => {
          if (!item || typeof item !== "object") return item;
          const row = item as Record<string, unknown>;
          const mod = typeof row.module === "string" ? row.module : "";
          const when = typeof row.when === "string" ? row.when : "";
          if (mod === "" || when.trim() !== "") return row;
          const r = moduleRange(c, mod);
          return r ? { ...row, when: formatDateRange(r.start, r.end) } : row;
        }),
      };
    }
    return { ...section, data };
  });

  const settings = { ...c.settings };
  if (settings.countdownFollowsEarlyBird === true) settings.countdownTo = c.registration.earlyBirdEndsAt;
  return { ...c, sections, settings };
}

function hasUnresolvable(c: LandingContent, value: unknown, refKey: string | null): boolean {
  if (typeof value === "string") {
    for (const m of Array.from(value.matchAll(MARKER_RE))) {
      const moduleKey = m[2] ?? refKey;
      if (datesFor(c, moduleKey) === null) return true;
      // Whole-page marker: every module must have dates, or the range would cover only some of them.
      if (moduleKey === null && c.modules.some((mod) => moduleRange(c, mod.key) === null)) return true;
    }
    return false;
  }
  if (Array.isArray(value)) return value.some((v) => hasUnresolvable(c, v, refKey));
  if (value && typeof value === "object") return Object.values(value as Record<string, unknown>).some((v) => hasUnresolvable(c, v, refKey));
  return false;
}

export function unfilledDateMarkers(c: LandingContent, moduleKey: string | null): { sectionId: string; sectionLabel: string }[] {
  const out: { sectionId: string; sectionLabel: string }[] = [];
  for (const section of c.sections) {
    if (!section.enabled) continue;
    let unfilled = hasUnresolvable(c, section.data, moduleKey);
    if (!unfilled && section.type === "schedule" && Array.isArray(section.data.items)) {
      unfilled = section.data.items.some((item: unknown) => {
        if (!item || typeof item !== "object") return false;
        const row = item as Record<string, unknown>;
        const mod = typeof row.module === "string" ? row.module : "";
        const when = typeof row.when === "string" ? row.when : "";
        return mod !== "" && when.trim() === "" && moduleRange(c, mod) === null;
      });
    }
    if (unfilled) out.push({ sectionId: section.id, sectionLabel: SECTION_DEFS[section.type].label });
  }
  return out;
}

const ANY_MARKER_RE = /\{\s*(?:dates|weekdays)[^}]{0,30}\}?/i;

function collectStrings(value: unknown, out: string[]): void {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) collectStrings(v, out);
  else if (value && typeof value === "object") for (const v of Object.values(value as Record<string, unknown>)) collectStrings(v, out);
}

/** Markers that name a module code the page does not have. */
export function unknownMarkerCodes(c: LandingContent): { sectionId: string; sectionLabel: string; kind: string; code: string }[] {
  const keys = new Set(c.modules.map((m) => m.key));
  const out: { sectionId: string; sectionLabel: string; kind: string; code: string }[] = [];
  for (const section of c.sections) {
    if (!section.enabled) continue;
    const strings: string[] = [];
    collectStrings(section.data, strings);
    for (const str of strings) {
      for (const m of Array.from(str.matchAll(MARKER_RE))) {
        if (m[2] && !keys.has(m[2])) out.push({ sectionId: section.id, sectionLabel: SECTION_DEFS[section.type].label, kind: m[1], code: m[2] });
      }
    }
  }
  return out;
}

/** Text that still holds a marker after the real ones were replaced: a misspelling such as {Dates} or {dates:Module 1}. */
export function leftoverMarkers(c: LandingContent): { sectionId: string; sectionLabel: string; fragment: string }[] {
  const resolved = applyAutoDates(c, { moduleKey: null });
  const out: { sectionId: string; sectionLabel: string; fragment: string }[] = [];
  for (const section of resolved.sections) {
    if (!section.enabled) continue;
    const strings: string[] = [];
    collectStrings(section.data, strings);
    for (const str of strings) {
      const m = ANY_MARKER_RE.exec(str);
      if (m) out.push({ sectionId: section.id, sectionLabel: SECTION_DEFS[section.type].label, fragment: m[0] });
    }
  }
  return out;
}

/** True when text holds anything that looks like a date marker (used for SEO text, where markers never resolve). */
export function hasMarkerText(s: string): boolean {
  return ANY_MARKER_RE.test(s);
}
