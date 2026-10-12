// src/lib/landing/sections.ts
import { z } from "zod";
import { isSafeUrl, youtubeId } from "./simple-text";

/**
 * The single source of truth for landing-page sections. The editor form, the
 * save-time schema, the defaults, the tolerant render-time normalizer and the
 * publish-readiness checks are ALL derived from these descriptors, so adding a
 * field or a section type is a one-place change.
 *
 * "required" means "needed to publish" (see computeReadiness), NOT "needed to
 * save": drafts are allowed to be incomplete.
 */

export const SECTION_TYPES = [
  "hero", "stats", "rich_text", "feature_cards", "curriculum", "instructors",
  "pricing_cards", "schedule", "video_reviews", "testimonials", "faq", "final_cta",
] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

export type FieldKind = "text" | "textarea" | "image" | "youtube" | "url" | "list";

export interface FieldDef {
  key: string;
  label: string;
  kind: FieldKind;
  help?: string;
  example?: string;
  required?: boolean;
  max?: number;
  defaultValue?: string;
  itemFields?: FieldDef[];
  itemLabel?: string;
  maxItems?: number;
}

export interface SectionDef {
  type: SectionType;
  label: string;
  description: string;
  /** Short label for the page's top navigation anchor, when this section is enabled. */
  navLabel?: string;
  fields: FieldDef[];
}

const MARKUP_HELP = "Tip: put **two stars** around words to make them bold, start a line with - for a bullet.";

const text = (key: string, label: string, o: Partial<FieldDef> = {}): FieldDef => ({ key, label, kind: "text", max: 200, ...o });
const area = (key: string, label: string, o: Partial<FieldDef> = {}): FieldDef => ({ key, label, kind: "textarea", max: 2000, ...o });
const image = (key: string, label: string, o: Partial<FieldDef> = {}): FieldDef => ({ key, label, kind: "image", ...o });
const link = (key: string, label: string, o: Partial<FieldDef> = {}): FieldDef => ({ key, label, kind: "url", ...o });
const list = (key: string, label: string, itemFields: FieldDef[], o: Partial<FieldDef> = {}): FieldDef => ({
  key, label, kind: "list", itemFields, maxItems: 40, ...o,
});

export const SECTION_DEFS: Record<SectionType, SectionDef> = {
  hero: {
    type: "hero", label: "Hero (top of page)", description: "The big opening: headline, short text, picture and the Register button.",
    fields: [
      text("eyebrow", "Small line above the headline", { example: "LIVE WORKSHOP · 4–7 SEPTEMBER" }),
      text("headline", "Headline", { required: true, max: 120, example: "Master Diabetes Pharmacotherapy" }),
      area("subheadline", "Short description", { max: 400, help: "One or two sentences under the headline." }),
      image("image", "Picture", { help: "Best at least 1200 px wide. It is resized for phones automatically." }),
      text("primaryCtaLabel", "Main button text", { defaultValue: "Register now", max: 40 }),
      text("secondaryCtaLabel", "Second button text (optional)", { max: 40, example: "Watch preview" }),
      link("secondaryCtaUrl", "Second button link (optional)", { help: "Starts with https://" }),
      text("dateLine", "Date and time line", { example: "Wednesday, 16 September · 7:30 PM PKT" }),
      list("badges", "Highlights under the buttons", [text("text", "Highlight", { max: 60 })], { itemLabel: "Highlight", maxItems: 6 }),
    ],
  },
  stats: {
    type: "stats", label: "Numbers bar", description: "A strip of big numbers, like '500+ students'.",
    fields: [list("items", "Numbers", [text("value", "Number", { required: true, max: 20, example: "500+" }), text("label", "What it means", { required: true, max: 60, example: "Pharmacists trained" })], { required: true, itemLabel: "Number", maxItems: 6 })],
  },
  rich_text: {
    type: "rich_text", label: "Text block", description: "A heading with paragraphs and bullets. Good for the problem, the story or 'who is this for'.",
    navLabel: "About",
    fields: [text("heading", "Heading", { required: true }), area("body", "Text", { required: true, max: 6000, help: MARKUP_HELP }), image("image", "Picture (optional)")],
  },
  feature_cards: {
    type: "feature_cards", label: "Benefit cards", description: "A grid of cards: what you will learn, what you get, why it matters.",
    navLabel: "Benefits",
    fields: [
      text("heading", "Heading", { required: true }),
      text("subheading", "Line under the heading", { max: 300 }),
      list("items", "Cards", [text("title", "Card title", { required: true, max: 80 }), area("text", "Card text", { max: 400 })], { required: true, itemLabel: "Card", maxItems: 12 }),
    ],
  },
  curriculum: {
    type: "curriculum", label: "Curriculum / outline", description: "Modules or days, each with a short list of topics.",
    navLabel: "Curriculum",
    fields: [
      text("heading", "Heading", { required: true, example: "What you will learn" }),
      list("items", "Modules or days", [
        text("title", "Title", { required: true, max: 100, example: "Day 1 — Basics" }),
        text("subtitle", "Small line (optional)", { max: 120 }),
        area("points", "Topics", { max: 1500, help: "One topic per line starting with -. " + MARKUP_HELP }),
      ], { required: true, itemLabel: "Module", maxItems: 20 }),
    ],
  },
  instructors: {
    type: "instructors", label: "Instructors", description: "Who is teaching, with photo and a short bio.",
    navLabel: "Instructor",
    fields: [
      text("heading", "Heading", { defaultValue: "Meet your instructor" }),
      list("items", "People", [
        text("name", "Name", { required: true, max: 80 }),
        text("role", "Title / credentials", { max: 160 }),
        area("bio", "Short bio", { max: 1200, help: MARKUP_HELP }),
        image("photo", "Photo"),
      ], { required: true, itemLabel: "Person", maxItems: 8 }),
    ],
  },
  pricing_cards: {
    type: "pricing_cards", label: "Prices", description: "Plans or options with their price. (Shown for information; registration opens through the Register button.)",
    navLabel: "Pricing",
    fields: [
      text("heading", "Heading", { defaultValue: "Choose your plan" }),
      text("note", "Note under the heading", { max: 300, example: "Early Bird ends 15 October" }),
      list("items", "Plans", [
        text("name", "Plan name", { required: true, max: 80 }),
        text("price", "Price", { required: true, max: 40, example: "PKR 4,800" }),
        text("oldPrice", "Crossed-out old price (optional)", { max: 40 }),
        text("badge", "Badge (optional)", { max: 30, example: "Best value" }),
        area("features", "What is included", { max: 1200, help: "One per line starting with -." }),
      ], { required: true, itemLabel: "Plan", maxItems: 8 }),
    ],
  },
  schedule: {
    type: "schedule", label: "Schedule / agenda", description: "When things happen: dates, times, session topics.",
    navLabel: "Schedule",
    fields: [
      text("heading", "Heading", { defaultValue: "Schedule" }),
      list("items", "Entries", [
        text("when", "When", { required: true, max: 80, example: "Fri 30 Oct · 7:30 PM" }),
        text("title", "What", { required: true, max: 120 }),
        text("detail", "Extra detail (optional)", { max: 300 }),
      ], { required: true, itemLabel: "Entry", maxItems: 30 }),
    ],
  },
  video_reviews: {
    type: "video_reviews", label: "Video reviews", description: "Student video feedback from YouTube or YouTube Shorts.",
    navLabel: "Reviews",
    fields: [
      text("heading", "Heading", { defaultValue: "What students say" }),
      list("items", "Videos", [
        { key: "url", label: "YouTube link", kind: "youtube", required: true, help: "Paste the YouTube or Shorts link." },
        text("caption", "Caption (optional)", { max: 120 }),
      ], { required: true, itemLabel: "Video", maxItems: 12 }),
    ],
  },
  testimonials: {
    type: "testimonials", label: "Written testimonials", description: "Quotes from past students.",
    navLabel: "Testimonials",
    fields: [
      text("heading", "Heading", { defaultValue: "Loved by pharmacists" }),
      list("items", "Quotes", [
        area("quote", "Quote", { required: true, max: 600 }),
        text("name", "Name", { required: true, max: 80 }),
        text("role", "Role (optional)", { max: 120 }),
        image("photo", "Photo (optional)"),
      ], { required: true, itemLabel: "Quote", maxItems: 20 }),
    ],
  },
  faq: {
    type: "faq", label: "Questions and answers", description: "Common questions, answered.",
    navLabel: "FAQ",
    fields: [
      text("heading", "Heading", { defaultValue: "Frequently asked questions" }),
      list("items", "Questions", [text("q", "Question", { required: true, max: 200 }), area("a", "Answer", { required: true, max: 1500, help: MARKUP_HELP })], { required: true, itemLabel: "Question", maxItems: 40 }),
    ],
  },
  final_cta: {
    type: "final_cta", label: "Closing call to action", description: "A last push to register, near the bottom.",
    fields: [
      text("headline", "Headline", { required: true, max: 120, example: "Ready to join?" }),
      area("text", "Text", { max: 400 }),
      text("buttonLabel", "Button text", { defaultValue: "Register now", max: 40 }),
    ],
  },
};

// ---------------------------------------------------------------- derived

function defaultForField(f: FieldDef): unknown {
  if (f.kind === "list") return [];
  return f.defaultValue ?? "";
}

function itemSchema(f: FieldDef) {
  return z.object(Object.fromEntries((f.itemFields ?? []).map((i) => [i.key, fieldSchema(i)])));
}

export function fieldSchema(f: FieldDef): z.ZodTypeAny {
  switch (f.kind) {
    case "text":
    case "textarea":
      return z.string().max(f.max ?? 500);
    case "image":
      return z.string().max(1000).refine((v) => v === "" || isSafeUrl(v), "Enter a full link starting with https://");
    case "url":
      return z.string().max(1000).refine((v) => v === "" || isSafeUrl(v), "Enter a full link starting with https://");
    case "youtube":
      return z.string().max(300).refine((v) => v === "" || youtubeId(v) !== null, "Paste a YouTube or YouTube Shorts link.");
    case "list":
      return z.array(itemSchema(f)).max(f.maxItems ?? 40);
  }
}

export function defaultSectionData(type: SectionType): Record<string, unknown> {
  return Object.fromEntries(SECTION_DEFS[type].fields.map((f) => [f.key, defaultForField(f)]));
}

export function sectionDataSchema(type: SectionType) {
  return z.object(Object.fromEntries(SECTION_DEFS[type].fields.map((f) => [f.key, fieldSchema(f)])));
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function normalizeField(f: FieldDef, raw: unknown): unknown {
  if (f.kind === "list") {
    if (!Array.isArray(raw)) return [];
    return raw.slice(0, f.maxItems ?? 40).map((item) => normalizeItem(f.itemFields ?? [], item));
  }
  const parsed = fieldSchema(f).safeParse(raw);
  return parsed.success ? parsed.data : defaultForField(f);
}

function normalizeItem(fields: FieldDef[], raw: unknown): Record<string, unknown> {
  const src = isRecord(raw) ? raw : {};
  return Object.fromEntries(fields.map((f) => [f.key, normalizeField(f, src[f.key])]));
}

/** Tolerant: per-field fallback to defaults, unknown keys dropped, never throws. */
export function normalizeSectionData(type: SectionType, raw: unknown): Record<string, unknown> {
  return normalizeItem(SECTION_DEFS[type].fields, raw);
}
