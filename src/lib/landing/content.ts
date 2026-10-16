// src/lib/landing/content.ts
import { z } from "zod";
import { isSafeUrl } from "./simple-text";
import { validateSlug } from "./slug";
import {
  normalizeRegistration, registrationConfigSchema, registrationProblems, type RegistrationConfig,
} from "./registration/config";
import { registrationTarget } from "./registration/setup-steps";
import {
  SECTION_DEFS, SECTION_TYPES, defaultSectionData, normalizeSectionData, sectionDataSchema,
  type FieldDef, type SectionType,
} from "./sections";
import { MAX_MODULES, MODULE_KEY_RE, type ModuleDef } from "./variants";

export type PageKind = "course" | "workshop" | "webinar";
export type PageStatus = "draft" | "published" | "closed";

export interface LandingSettings {
  registerUrl: string;
  registerLabel: string;
  whatsappNumber: string;
  countdownTo: string;
  countdownLabel: string;
}
export interface LandingSeo { title: string; description: string; ogImage: string }
export interface LandingSection { id: string; type: SectionType; enabled: boolean; data: Record<string, unknown> }
export interface LandingContent {
  settings: LandingSettings;
  seo: LandingSeo;
  sections: LandingSection[];
  /**
   * Fields a template seeded with details that go stale (dates, Early Bird prices), as
   * "<sectionId>:<fieldPath>" (fieldPath like "dateLine" or "items.0.when"). Each blocks publishing
   * until the admin edits that field or chooses Keep. Never rendered on the public page.
   */
  needsReview: string[];
  /** Built-in registration settings; DEFAULT_REGISTRATION (disabled) when the page has none. */
  registration: RegistrationConfig;
  /** Courses sold as separate modules (landing variants); [] for a normal page. Max 12. */
  modules: ModuleDef[];
}

export const MAX_CONTENT_BYTES = 400_000;

export const KIND_SECTIONS: Record<PageKind, SectionType[]> = {
  course: ["hero", "stats", "feature_cards", "curriculum", "instructors", "pricing_cards", "schedule", "video_reviews", "testimonials", "faq", "final_cta"],
  workshop: ["hero", "stats", "rich_text", "feature_cards", "instructors", "curriculum", "pricing_cards", "schedule", "testimonials", "faq", "final_cta"],
  webinar: ["hero", "rich_text", "schedule", "instructors", "pricing_cards", "faq", "final_cta"],
};

const DEFAULT_SETTINGS: LandingSettings = {
  registerUrl: "", registerLabel: "Register now", whatsappNumber: "", countdownTo: "", countdownLabel: "",
};
const DEFAULT_SEO: LandingSeo = { title: "", description: "", ogImage: "" };

const safeUrlOrEmpty = z.string().max(1000).refine((v) => v === "" || isSafeUrl(v), "Enter a full link starting with https://");

const moduleSchema = z.object({
  key: z.string().max(40).regex(MODULE_KEY_RE, "Module code must be lowercase letters, numbers and dashes"),
  title: z.string().max(120),
  format: z.string().max(60),
  days: z.number().int().min(0).max(60),
  optionKey: z.string().max(32),
});

export const contentSchema = z
  .object({
    settings: z.object({
      registerUrl: safeUrlOrEmpty,
      registerLabel: z.string().max(40),
      whatsappNumber: z.string().max(30),
      countdownTo: z.string().max(40),
      countdownLabel: z.string().max(80),
    }),
    seo: z.object({
      title: z.string().max(120),
      description: z.string().max(300),
      ogImage: safeUrlOrEmpty,
    }),
    sections: z
      .array(z.object({
        id: z.string().min(1).max(64),
        type: z.enum(SECTION_TYPES),
        enabled: z.boolean(),
        data: z.record(z.string(), z.unknown()),
      }))
      .max(40),
    needsReview: z.array(z.string().max(200)).max(200).optional(),
    // Optional so a Phase 1 editor payload without it still saves; normalizeContent fills the default.
    registration: registrationConfigSchema.optional(),
    modules: z.array(moduleSchema).max(MAX_MODULES).optional(),
  })
  .superRefine((c, ctx) => {
    const seen = new Set<string>();
    c.sections.forEach((s, i) => {
      if (seen.has(s.id)) ctx.addIssue({ code: "custom", path: ["sections", i, "id"], message: "Duplicate section id" });
      seen.add(s.id);
      const r = sectionDataSchema(s.type).safeParse(s.data);
      if (!r.success) ctx.addIssue({ code: "custom", path: ["sections", i, "data"], message: r.error.issues[0]?.message ?? "Invalid section" });
    });
  });

function normalizeModules(raw: unknown): ModuleDef[] {
  const out: ModuleDef[] = [];
  for (const m of Array.isArray(raw) ? raw : []) {
    if (!isRecord(m) || typeof m.key !== "string" || !MODULE_KEY_RE.test(m.key) || m.key.length > 40) continue;
    if (out.some((x) => x.key === m.key)) continue;
    const days = typeof m.days === "number" && Number.isFinite(m.days) ? Math.min(60, Math.max(0, Math.round(m.days))) : 0;
    out.push({ key: m.key, title: str(m.title, "", 120), format: str(m.format, "", 60), days, optionKey: str(m.optionKey, "", 32) });
    if (out.length >= MAX_MODULES) break;
  }
  return out;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
const str = (v: unknown, fallback: string, max: number) => (typeof v === "string" ? v.slice(0, max) : fallback);
const newId = () => globalThis.crypto.randomUUID();

/** Tolerant loader for anything read from the database or a snapshot. Never throws. */
export function normalizeContent(raw: unknown): LandingContent {
  const r = isRecord(raw) ? raw : {};
  const s = isRecord(r.settings) ? r.settings : {};
  const seo = isRecord(r.seo) ? r.seo : {};
  const settings: LandingSettings = {
    registerUrl: safeUrlOrEmpty.safeParse(s.registerUrl).success ? str(s.registerUrl, "", 1000) : "",
    registerLabel: str(s.registerLabel, DEFAULT_SETTINGS.registerLabel, 40),
    whatsappNumber: str(s.whatsappNumber, "", 30),
    countdownTo: str(s.countdownTo, "", 40),
    countdownLabel: str(s.countdownLabel, "", 80),
  };
  const seoOut: LandingSeo = {
    title: str(seo.title, "", 120),
    description: str(seo.description, "", 300),
    ogImage: safeUrlOrEmpty.safeParse(seo.ogImage).success ? str(seo.ogImage, "", 1000) : "",
  };
  const used = new Set<string>();
  const sections: LandingSection[] = [];
  for (const item of Array.isArray(r.sections) ? r.sections.slice(0, 40) : []) {
    if (!isRecord(item)) continue;
    if (!(SECTION_TYPES as readonly string[]).includes(item.type as string)) continue;
    const type = item.type as SectionType;
    let id = typeof item.id === "string" && item.id.length > 0 && item.id.length <= 64 ? item.id : newId();
    if (used.has(id)) id = newId();
    used.add(id);
    sections.push({ id, type, enabled: item.enabled !== false, data: normalizeSectionData(type, item.data) });
  }
  const needsReview = Array.isArray(r.needsReview)
    ? r.needsReview.filter((p): p is string => typeof p === "string" && p.length > 0 && p.length <= 200).slice(0, 200)
    : [];
  return { settings, seo: seoOut, sections, needsReview, registration: normalizeRegistration(r.registration), modules: normalizeModules(r.modules) };
}

export function newSection(type: SectionType, id: string = newId()): LandingSection {
  return { id, type, enabled: true, data: defaultSectionData(type) };
}

export function emptyContent(kind: PageKind): LandingContent {
  return {
    settings: { ...DEFAULT_SETTINGS },
    seo: { ...DEFAULT_SEO },
    sections: KIND_SECTIONS[kind].map((t) => newSection(t)),
    needsReview: [],
    registration: normalizeRegistration(undefined),
    modules: [],
  };
}

export function addSection(c: LandingContent, type: SectionType, index?: number): LandingContent {
  const sections = [...c.sections];
  sections.splice(index === undefined ? sections.length : Math.max(0, Math.min(index, sections.length)), 0, newSection(type));
  return { ...c, sections };
}
export function removeSection(c: LandingContent, id: string): LandingContent {
  return { ...c, sections: c.sections.filter((s) => s.id !== id) };
}
export function moveSection(c: LandingContent, id: string, dir: -1 | 1): LandingContent {
  const i = c.sections.findIndex((s) => s.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= c.sections.length) return c;
  const sections = [...c.sections];
  [sections[i], sections[j]] = [sections[j], sections[i]];
  return { ...c, sections };
}
export function toggleSection(c: LandingContent, id: string): LandingContent {
  return { ...c, sections: c.sections.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)) };
}
/** Reads a "dateLine" / "items.0.when" style path inside section data; undefined once the path is gone. */
function valueAt(data: unknown, path: string): unknown {
  let cur: unknown = data;
  for (const part of path.split(".")) {
    if (Array.isArray(cur)) cur = cur[Number(part)];
    else if (isRecord(cur)) cur = cur[part];
    else return undefined;
  }
  return cur;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** For each old list item, the index of the first unmatched JSON-equal new item, or -1 if it was removed. */
function matchItems(oldList: unknown[], newList: unknown[]): number[] {
  const used = new Set<number>();
  return oldList.map((o) => {
    const j = newList.findIndex((n, k) => !used.has(k) && same(o, n));
    if (j >= 0) used.add(j);
    return j;
  });
}

/**
 * Where a flagged path lives after an edit: the same path (untouched), a remapped path (a list item
 * moved: delete/insert/reorder, matched by the item's old content), or null (value edited in place, or
 * its item removed). Remaps by the outermost list whose structure changed.
 */
function trackFlag(oldV: unknown, newV: unknown, parts: string[]): string[] | null {
  if (parts.length === 0) return same(oldV, newV) ? [] : null;
  const [head, ...rest] = parts;
  if (Array.isArray(oldV)) {
    if (!Array.isArray(newV)) return null;
    const i = Number(head);
    const match = matchItems(oldV, newV);
    const structural = oldV.length !== newV.length || match.some((j, k) => j !== -1 && j !== k);
    if (structural) {
      const j = match[i];
      return j === undefined || j < 0 ? null : [String(j), ...rest];
    }
    const r = trackFlag(oldV[i], newV[i], rest);
    return r ? [head, ...r] : null;
  }
  if (isRecord(oldV)) {
    const r = trackFlag(oldV[head], isRecord(newV) ? newV[head] : undefined, rest);
    return r ? [head, ...r] : null;
  }
  return null;
}

export function updateSectionData(c: LandingContent, id: string, data: Record<string, unknown>): LandingContent {
  const target = c.sections.find((s) => s.id === id);
  const nextData = target ? normalizeSectionData(target.type, data) : null;
  // Editing a flagged field counts as reviewing it: drop the flag of every path whose value changed.
  const prefix = `${id}:`;
  const needsReview = (c.needsReview ?? []).flatMap((p) => {
    if (!target || !p.startsWith(prefix)) return [p];
    // Compare against the normalized old data so items saved before the module tag existed match.
    const moved = trackFlag(normalizeSectionData(target.type, target.data), nextData, p.slice(prefix.length).split("."));
    return moved ? [prefix + moved.join(".")] : [];
  });
  return {
    ...c,
    needsReview,
    sections: c.sections.map((s) => (s.id === id && nextData ? { ...s, data: nextData } : s)),
  };
}

/** "Keep": the admin checked these flagged fields and the template's values are right. */
export function clearReview(c: LandingContent, paths: string[]): LandingContent {
  return { ...c, needsReview: (c.needsReview ?? []).filter((p) => !paths.includes(p)) };
}
export function updateSettings(c: LandingContent, patch: Partial<LandingSettings>): LandingContent {
  return { ...c, settings: { ...c.settings, ...patch } };
}
export function updateSeo(c: LandingContent, patch: Partial<LandingSeo>): LandingContent {
  return { ...c, seo: { ...c.seo, ...patch } };
}

export function updateRegistration(c: LandingContent, patch: Partial<RegistrationConfig>): LandingContent {
  return { ...c, registration: { ...c.registration, ...patch } };
}

// ------------------------------------------------------------- readiness

/** field: where Fix puts the cursor, as a FieldInput path ("headline", a list key "items", or "items.0.q"). */
export interface Problem { message: string; sectionId?: string; field?: string; review?: string[] }

function isBlank(v: unknown): boolean {
  return typeof v !== "string" || v.trim() === "";
}

function fieldProblems(section: LandingSection, fields: FieldDef[], data: Record<string, unknown>, out: Problem[]) {
  const label = SECTION_DEFS[section.type].label;
  for (const f of fields) {
    if (!f.required) continue;
    if (f.kind === "list") {
      const items = Array.isArray(data[f.key]) ? (data[f.key] as Record<string, unknown>[]) : [];
      if (items.length === 0) {
        out.push({ message: `Add at least one ${(f.itemLabel ?? "item").toLowerCase()} in "${label}".`, sectionId: section.id, field: f.key });
        continue;
      }
      items.forEach((item, n) => {
        for (const sub of f.itemFields ?? []) {
          if (sub.required && isBlank(item[sub.key])) {
            out.push({ message: `${f.itemLabel ?? "Item"} ${n + 1} in "${label}" needs "${sub.label}".`, sectionId: section.id, field: `${f.key}.${n}.${sub.key}` });
          }
        }
      });
    } else if (isBlank(data[f.key])) {
      out.push({ message: `Fill in "${f.label}" in "${label}".`, sectionId: section.id, field: f.key });
    }
  }
}

function reviewProblems(c: LandingContent, out: Problem[]) {
  for (const s of c.sections) {
    if (!s.enabled) continue;
    const prefix = `${s.id}:`;
    const paths = (c.needsReview ?? []).filter((p) => p.startsWith(prefix) && valueAt(s.data, p.slice(prefix.length)) !== undefined);
    if (paths.length === 0) continue;
    const label = SECTION_DEFS[s.type].label;
    const count = paths.length === 1 ? "1 field still shows" : `${paths.length} fields still show`;
    out.push({
      message: `Update the event dates and prices in "${label}": ${count} the template's old details. Edit them, or choose Keep if they are right.`,
      sectionId: s.id,
      field: paths[0].slice(prefix.length),
      review: paths,
    });
  }
}

function moduleProblems(c: LandingContent, out: Problem[]) {
  const name = (m: ModuleDef) => (m.title.trim() === "" ? m.key : m.title);
  const seen = new Set<string>();
  for (const m of c.modules ?? []) {
    if (seen.has(m.key)) out.push({ message: `Two modules use the same code "${m.key}". Give each module its own code.` });
    seen.add(m.key);
    if (m.optionKey === "") continue;
    const opt = c.registration.options.find((o) => o.key === m.optionKey);
    if (!opt) {
      out.push({ message: `${name(m)} is linked to a registration option that no longer exists. Choose its option again (Registration setup).` });
      continue;
    }
    const row = c.registration.prices[opt.key] ?? {};
    for (const g of c.registration.regions) {
      if (!opt.free && row[g.key] === undefined) out.push({ message: `${name(m)} has no price for ${g.label.trim() === "" ? g.key : g.label}.` });
    }
  }
}

export function computeReadiness(c: LandingContent, page: { title: string; slug: string }): { ready: boolean; problems: Problem[] } {
  const problems: Problem[] = [];
  if (page.title.trim() === "") problems.push({ message: "Give the page a name." });
  const slug = validateSlug(page.slug);
  if (!slug.ok) problems.push({ message: slug.message });
  if (c.seo.description.trim() === "") problems.push({ message: "Add a short description for Google and WhatsApp previews (Page settings)." });
  if (c.registration.enabled) {
    // The built-in registration form replaces the external Register link.
    for (const p of registrationProblems(c.registration)) problems.push({ message: p.message, sectionId: registrationTarget(p.step) });
  } else if (!(/^https?:\/\//i.test(c.settings.registerUrl.trim()) && isSafeUrl(c.settings.registerUrl))) {
    problems.push({ message: "Add the link the Register button should open (Page settings). It must start with https://." });
  }
  if (c.settings.whatsappNumber.trim() !== "") {
    const digits = c.settings.whatsappNumber.replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) problems.push({ message: "The WhatsApp number looks wrong. Include the country code, for example 923001234567." });
  }
  if (c.settings.countdownTo.trim() !== "" && Number.isNaN(Date.parse(c.settings.countdownTo))) {
    problems.push({ message: "The countdown date is not a valid date and time." });
  }
  const enabled = c.sections.filter((s) => s.enabled);
  if (enabled.length === 0) problems.push({ message: "Turn on at least one section." });
  for (const s of enabled) fieldProblems(s, SECTION_DEFS[s.type].fields, s.data, problems);
  reviewProblems(c, problems);
  moduleProblems(c, problems);
  return { ready: problems.length === 0, problems };
}

export function hasUnpublishedChanges(draft: LandingContent, published: LandingContent | null): boolean {
  if (!published) return true;
  return JSON.stringify(draft) !== JSON.stringify(published);
}
