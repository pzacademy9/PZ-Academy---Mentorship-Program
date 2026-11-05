// Checks the public page parts of a course file (price, topic, webinar date,
// preview video, the lists and the page sections). Pure and client-safe: the
// course editor runs it in the browser, the import route on the server.
import { checkVideoLink } from "@/lib/video-link";
import { pktToIso } from "@/lib/attendance/rules";
import { PAGE_LIMITS } from "@/lib/marketing/page-limits";
import { cleanTopic, TOPIC_MAX } from "@/lib/marketing/topics";
import { SECTION_KEYS, SECTION_LABEL, SECTION_TITLE_MAX, normalizeSections, type PageSection, type SectionKey } from "@/lib/marketing/course-sections";
import type { RawLine, RawPage } from "./format";

/** The page parts found in a file. A part left out (undefined) was not in the file and is left alone. */
export type PagePlan = {
  pricePkr?: number;
  topic?: string;
  /** Webinar date, UTC ISO. */
  startsAt?: string;
  publicVideoUrl?: string;
  outcomes?: string[];
  features?: string[];
  faqs?: { question: string; answer: string }[];
  pageSections?: PageSection[];
};

/** Plain-word names of the page parts a plan fills in. */
export function pagePartLabels(p: PagePlan): string[] {
  const out: string[] = [];
  if (p.pricePkr !== undefined) out.push("Price");
  if (p.topic !== undefined) out.push("Topic");
  if (p.startsAt !== undefined) out.push("Webinar date");
  if (p.publicVideoUrl !== undefined) out.push("Preview video");
  if (p.outcomes !== undefined) out.push("What you'll learn");
  if (p.features !== undefined) out.push("This course includes");
  if (p.faqs !== undefined) out.push("Questions and answers");
  if (p.pageSections !== undefined) out.push("Page sections");
  return out;
}

/** "PKR 9,000", "Rs. 9000", "9,000/-", "Free" -> whole PKR, or null when not a plain whole amount. */
export function readPrice(raw: string): number | null {
  const v = raw.trim().toLowerCase();
  if (v === "free") return 0;
  const bare = v.replace(/^(?:pkr|rs\.?|rupees)\s*/, "").replace(/\s*(?:\/-|pkr|rupees)$/, "").replace(/[,\s]/g, "");
  if (!/^\d+$/.test(bare)) return null;
  const n = Number(bare);
  return Number.isSafeInteger(n) ? n : null;
}

/** "2026-11-10 19:00" or "2026-11-10T19:00" in Pakistan time -> UTC ISO, or null. */
export function readWebinarDate(raw: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  return pktToIso(`${m[1]}T${m[2].padStart(2, "0")}:${m[3]}`);
}

const SHOW = new Set(["", "show", "shown", "yes", "visible", "on", "true"]);
const HIDE = new Set(["hide", "hidden", "no", "off", "false"]);

function sectionKeyOf(raw: string): SectionKey | null {
  const v = raw.trim().toLowerCase();
  for (const k of SECTION_KEYS) {
    if (v === k || v === SECTION_LABEL[k].toLowerCase()) return k;
  }
  if (v === "faqs" || v === "questions and answers") return "faq";
  return null;
}

function cleanList(raw: RawLine[], name: string, warnings: string[]): string[] {
  const out: string[] = [];
  for (const l of raw) {
    const t = l.text.trim();
    if (!t) continue;
    if (t.length > PAGE_LIMITS.maxLine) {
      warnings.push(`${name}: the line at line ${l.line} is longer than ${PAGE_LIMITS.maxLine} letters, so it was left out.`);
      continue;
    }
    out.push(t);
  }
  if (out.length > PAGE_LIMITS.maxLines) {
    warnings.push(`${name}: has more than ${PAGE_LIMITS.maxLines} lines, so only the first ${PAGE_LIMITS.maxLines} were kept.`);
    return out.slice(0, PAGE_LIMITS.maxLines);
  }
  return out;
}

export function checkPageParts(page: RawPage, courseType: string, warnings: string[]): PagePlan {
  const plan: PagePlan = {};
  const h = page.header;

  if (h.price.trim()) {
    const n = readPrice(h.price);
    if (n === null) warnings.push(`The price "${h.price.trim()}" is not a plain whole amount in PKR, so it was left out.`);
    else if (n > PAGE_LIMITS.maxPricePkr) warnings.push(`The price is higher than ${PAGE_LIMITS.maxPricePkr.toLocaleString("en-US")} PKR, so it was left out.`);
    else plan.pricePkr = n;
  }

  if (h.topic.trim()) {
    const t = cleanTopic(h.topic);
    if (h.topic.replace(/\s+/g, " ").trim().length > TOPIC_MAX) warnings.push(`The topic is longer than ${TOPIC_MAX} letters, so it was left out.`);
    else plan.topic = t;
  }

  if (h.webinarDate.trim()) {
    if (courseType !== "webinar") {
      warnings.push("A webinar date is only used on webinars, so it was left out.");
    } else {
      const iso = readWebinarDate(h.webinarDate);
      if (!iso) warnings.push(`The webinar date "${h.webinarDate.trim()}" was left out. Write it like 2026-11-10 19:00 (Pakistan time).`);
      else plan.startsAt = iso;
    }
  }

  if (h.previewVideo.trim()) {
    const url = h.previewVideo.trim().split(/\s+/)[0];
    const check = checkVideoLink(url);
    if (check.status === "ok" && /^https:\/\//i.test(url)) plan.publicVideoUrl = url;
    else warnings.push(`The preview video (${url}) was left out. Use a YouTube or Vimeo link starting with https://.`);
  }

  if (page.learn) plan.outcomes = cleanList(page.learn, "What you'll learn", warnings);
  if (page.includes) plan.features = cleanList(page.includes, "This course includes", warnings);

  if (page.faqs) {
    const faqs: { question: string; answer: string }[] = [];
    for (const f of page.faqs) {
      const question = f.question.trim();
      const answer = f.answer.trim();
      if (!question || !answer) {
        warnings.push(`The question at line ${f.line} has no ${question ? "answer" : "text"}, so it was left out.`);
        continue;
      }
      if (question.length > PAGE_LIMITS.maxQuestion || answer.length > PAGE_LIMITS.maxAnswer) {
        warnings.push(`The question at line ${f.line} is too long (question ${PAGE_LIMITS.maxQuestion}, answer ${PAGE_LIMITS.maxAnswer} letters at most), so it was left out.`);
        continue;
      }
      faqs.push({ question, answer });
    }
    if (faqs.length > PAGE_LIMITS.maxFaqs) {
      warnings.push(`Questions and answers: more than ${PAGE_LIMITS.maxFaqs}, so only the first ${PAGE_LIMITS.maxFaqs} were kept.`);
      faqs.length = PAGE_LIMITS.maxFaqs;
    }
    plan.faqs = faqs;
  }

  if (page.sections) {
    const rows: PageSection[] = [];
    const seen = new Set<SectionKey>();
    for (const r of page.sections) {
      const key = sectionKeyOf(r.key);
      if (!key) {
        warnings.push(`Page sections, line ${r.line}: "${r.key}" is not a section name, so it was left out.`);
        continue;
      }
      if (seen.has(key)) {
        warnings.push(`Page sections, line ${r.line}: "${r.key}" is listed twice, so only the first was kept.`);
        continue;
      }
      const show = r.show.trim().toLowerCase();
      let visible = true;
      if (HIDE.has(show)) visible = false;
      else if (!SHOW.has(show)) warnings.push(`Page sections, line ${r.line}: "${r.show}" is not show or hide, so the section is shown.`);
      let title = r.title.trim();
      if (title.length > SECTION_TITLE_MAX) {
        warnings.push(`Page sections, line ${r.line}: the heading is longer than ${SECTION_TITLE_MAX} letters, so the normal heading is used.`);
        title = "";
      }
      seen.add(key);
      rows.push(title ? { key, visible, title } : { key, visible });
    }
    // Sections the file does not list keep the normal place, shown, at the end.
    if (rows.length > 0) plan.pageSections = normalizeSections(rows);
  }

  return plan;
}
