// Writes the course editor's current page (saved or not) as a course file with
// the page parts only, for "Download my page as a file". Reading the result back
// with analyzePageFile gives the same values. Pure and client-safe.
import { isoToPktInput } from "@/lib/attendance/rules";
import { normalizeSections, type PageSection } from "@/lib/marketing/course-sections";
import { COURSE_DETAIL_FIELDS, COURSE_IMPORT_FORMAT_ID, PAGE_LIST_HEADINGS, type ImportDetails } from "./format";

export type PageFileInput = {
  title: string;
  type: string;
  details: ImportDetails;
  pricePkr: number;
  topic: string;
  /** Webinar date, UTC ISO, or "". */
  startsAt: string;
  publicVideoUrl: string;
  outcomes: string[];
  features: string[];
  faqs: { question: string; answer: string }[];
  pageSections: PageSection[];
};

const oneLine = (s: string) => s.replace(/\s*\n\s*/g, " ").trim();

export function writePageFile(p: PageFileInput): string {
  const out: string[] = [`format: ${COURSE_IMPORT_FORMAT_ID}`];
  if (p.title.trim()) out.push(`title: ${oneLine(p.title)}`);
  if (p.type) out.push(`type: ${p.type}`);
  for (const f of COURSE_DETAIL_FIELDS) {
    const v = (p.details[f.field] ?? "").trim();
    // Long texts keep their paragraphs; short ones are one line.
    if (v) out.push(`${f.key}: ${f.multiline ? v.replace(/\n{2,}/g, "\n\n") : oneLine(v)}`);
  }
  out.push(`price: ${p.pricePkr > 0 ? p.pricePkr : "Free"}`);
  if (p.topic.trim()) out.push(`topic: ${oneLine(p.topic)}`);
  if (p.type === "webinar" && p.startsAt && !Number.isNaN(Date.parse(p.startsAt))) {
    out.push(`webinar_date: ${isoToPktInput(p.startsAt).replace("T", " ")}`);
  }
  if (p.publicVideoUrl.trim()) out.push(`preview_video: ${p.publicVideoUrl.trim()}`);

  const list = (heading: string, lines: string[]) => {
    out.push("", heading);
    for (const l of lines) if (l.trim()) out.push(`- ${oneLine(l)}`);
  };
  list(PAGE_LIST_HEADINGS.learn, p.outcomes);
  list(PAGE_LIST_HEADINGS.includes, p.features);

  out.push("", PAGE_LIST_HEADINGS.faqs);
  for (const f of p.faqs) {
    if (!f.question.trim() || !f.answer.trim()) continue;
    out.push(`Q: ${oneLine(f.question)}`, `A: ${f.answer.trim().replace(/\n\s*\n/g, "\n")}`);
  }

  out.push("", PAGE_LIST_HEADINGS.sections);
  for (const s of normalizeSections(p.pageSections)) {
    out.push(`${s.key} | ${s.visible ? "show" : "hide"}${s.title ? ` | ${oneLine(s.title)}` : ""}`);
  }
  return out.join("\n") + "\n";
}
