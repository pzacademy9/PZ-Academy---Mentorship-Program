// src/lib/landing/content.ts
import { z } from "zod";
import { isSafeUrl } from "./simple-text";
import { validateSlug } from "./slug";
import {
  SECTION_DEFS, SECTION_TYPES, defaultSectionData, normalizeSectionData, sectionDataSchema,
  type FieldDef, type SectionType,
} from "./sections";

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
export interface LandingContent { settings: LandingSettings; seo: LandingSeo; sections: LandingSection[] }

export const MAX_CONTENT_BYTES = 200_000;

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
  return { settings, seo: seoOut, sections };
}

export function newSection(type: SectionType, id: string = newId()): LandingSection {
  return { id, type, enabled: true, data: defaultSectionData(type) };
}

export function emptyContent(kind: PageKind): LandingContent {
  return {
    settings: { ...DEFAULT_SETTINGS },
    seo: { ...DEFAULT_SEO },
    sections: KIND_SECTIONS[kind].map((t) => newSection(t)),
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
export function updateSectionData(c: LandingContent, id: string, data: Record<string, unknown>): LandingContent {
  return {
    ...c,
    sections: c.sections.map((s) => (s.id === id ? { ...s, data: normalizeSectionData(s.type, data) } : s)),
  };
}
export function updateSettings(c: LandingContent, patch: Partial<LandingSettings>): LandingContent {
  return { ...c, settings: { ...c.settings, ...patch } };
}
export function updateSeo(c: LandingContent, patch: Partial<LandingSeo>): LandingContent {
  return { ...c, seo: { ...c.seo, ...patch } };
}

// ------------------------------------------------------------- readiness

export interface Problem { message: string; sectionId?: string }

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
        out.push({ message: `Add at least one ${(f.itemLabel ?? "item").toLowerCase()} in "${label}".`, sectionId: section.id });
        continue;
      }
      items.forEach((item, n) => {
        for (const sub of f.itemFields ?? []) {
          if (sub.required && isBlank(item[sub.key])) {
            out.push({ message: `${f.itemLabel ?? "Item"} ${n + 1} in "${label}" needs "${sub.label}".`, sectionId: section.id });
          }
        }
      });
    } else if (isBlank(data[f.key])) {
      out.push({ message: `Fill in "${f.label}" in "${label}".`, sectionId: section.id });
    }
  }
}

export function computeReadiness(c: LandingContent, page: { title: string; slug: string }): { ready: boolean; problems: Problem[] } {
  const problems: Problem[] = [];
  if (page.title.trim() === "") problems.push({ message: "Give the page a name." });
  const slug = validateSlug(page.slug);
  if (!slug.ok) problems.push({ message: slug.message });
  if (c.seo.description.trim() === "") problems.push({ message: "Add a short description for Google and WhatsApp previews (Page settings)." });
  if (!isSafeUrl(c.settings.registerUrl)) problems.push({ message: "Add the link the Register button should open (Page settings). It must start with https://." });
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
  return { ready: problems.length === 0, problems };
}

export function hasUnpublishedChanges(draft: LandingContent, published: LandingContent | null): boolean {
  if (!published) return true;
  return JSON.stringify(draft) !== JSON.stringify(published);
}
