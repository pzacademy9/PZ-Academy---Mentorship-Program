import type { CourseType } from "@/lib/data/lms";
import type { Json } from "@/lib/supabase/database.types";
import { PROGRAM_COPY } from "@/lib/program-copy";

/** The movable sections of the course page's main column, in their normal order. */
export const SECTION_KEYS = ["about", "learn", "curriculum", "teacher", "certificate", "faq"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export type PageSection = { key: SectionKey; visible: boolean; title?: string };

export const SECTION_TITLE_MAX = 80;

/** Name of each section in the admin editor. */
export const SECTION_LABEL: Record<SectionKey, string> = {
  about: "About (description)",
  learn: "What you'll learn",
  curriculum: "Modules / agenda",
  teacher: "Meet your teacher",
  certificate: "Certificate",
  faq: "Questions and answers",
};

function isKey(v: unknown): v is SectionKey {
  return typeof v === "string" && (SECTION_KEYS as readonly string[]).includes(v);
}

/**
 * Turns whatever is saved in courses.page_sections into a clean list: saved
 * order first (unknown keys, repeats and junk dropped), then any section not
 * saved yet, shown, at the end. Nothing saved = the normal page.
 */
export function normalizeSections(raw: unknown): PageSection[] {
  const out: PageSection[] = [];
  const seen = new Set<SectionKey>();
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const { key, visible, title } = item as Record<string, unknown>;
      if (!isKey(key) || seen.has(key)) continue;
      seen.add(key);
      const t = typeof title === "string" ? title.trim().slice(0, SECTION_TITLE_MAX) : "";
      out.push(t ? { key, visible: visible !== false, title: t } : { key, visible: visible !== false });
    }
  }
  for (const key of SECTION_KEYS) if (!seen.has(key)) out.push({ key, visible: true });
  return out;
}

/** The heading shown on the page: the admin's own, else the normal one for this program type. */
export function sectionTitle(section: PageSection, type: CourseType): string {
  if (section.title) return section.title;
  const copy = PROGRAM_COPY[type];
  switch (section.key) {
    case "about":
      return `About this ${copy.noun}`;
    case "learn":
      return "What you'll learn";
    case "curriculum":
      return copy.curriculumHeading;
    case "teacher":
      return "Meet your teacher";
    case "certificate":
      return "Your certificate";
    case "faq":
      return "Frequently asked questions";
  }
}

export type PageFieldsInput = {
  publicVideoUrl?: string;
  certificateImageUrl?: string;
  pageSections?: PageSection[];
};

/**
 * Database columns for the public-page fields the admin actually sent.
 * Left out = leave alone (so a save before migration 0101 still works);
 * "" = clear the link.
 */
export function pageFieldsPatch(input: PageFieldsInput): {
  public_video_url?: string | null;
  certificate_image_url?: string | null;
  page_sections?: Json;
} {
  const patch: { public_video_url?: string | null; certificate_image_url?: string | null; page_sections?: Json } = {};
  if (input.publicVideoUrl !== undefined) patch.public_video_url = input.publicVideoUrl || null;
  if (input.certificateImageUrl !== undefined) patch.certificate_image_url = input.certificateImageUrl || null;
  if (input.pageSections !== undefined) patch.page_sections = normalizeSections(input.pageSections) as unknown as Json;
  return patch;
}

export type PublicPageFields = {
  publicVideoUrl: string;
  certificateImageUrl: string;
  outcomes: string[];
  features: string[];
  faqs: { question: string; answer: string }[];
  pageSections: PageSection[];
};

const cleanLines = (lines: string[]) => lines.map((l) => l.trim()).filter(Boolean);
const cleanFaqs = (faqs: PublicPageFields["faqs"]) =>
  faqs.map((f) => ({ question: f.question.trim(), answer: f.answer.trim() })).filter((f) => f.question && f.answer);

/**
 * What the course editor sends on Save: only the public-page parts that
 * changed since the page loaded, cleaned (blank lines and half-filled
 * questions dropped). Unchanged parts are left out so they are never touched.
 */
export function changedPageFields(before: PublicPageFields, now: PublicPageFields): Partial<PublicPageFields> {
  const out: Partial<PublicPageFields> = {};
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  if (now.publicVideoUrl.trim() !== before.publicVideoUrl.trim()) out.publicVideoUrl = now.publicVideoUrl.trim();
  if (now.certificateImageUrl.trim() !== before.certificateImageUrl.trim()) out.certificateImageUrl = now.certificateImageUrl.trim();
  if (!same(cleanLines(now.outcomes), cleanLines(before.outcomes))) out.outcomes = cleanLines(now.outcomes);
  if (!same(cleanLines(now.features), cleanLines(before.features))) out.features = cleanLines(now.features);
  if (!same(cleanFaqs(now.faqs), cleanFaqs(before.faqs))) out.faqs = cleanFaqs(now.faqs);
  if (!same(normalizeSections(now.pageSections), normalizeSections(before.pageSections))) out.pageSections = normalizeSections(now.pageSections);
  return out;
}
