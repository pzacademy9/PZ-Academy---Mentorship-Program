// What "Import page from a file" would change in the course editor, in plain
// words, so the admin can check before filling the boxes. Pure and client-safe.
import { startsAtLabel } from "@/lib/marketing/batch-facts";
import { normalizeSections, type PageSection } from "@/lib/marketing/course-sections";
import { COURSE_DETAIL_FIELDS, type ImportDetails } from "./format";
import type { PageImport } from "./analyze";

/** The editor's current values (saved or not). */
export type EditorPage = {
  title: string;
  details: Required<ImportDetails>;
  pricePkr: number;
  topic: string;
  startsAt: string;
  publicVideoUrl: string;
  outcomes: string[];
  features: string[];
  faqs: { question: string; answer: string }[];
  pageSections: PageSection[];
};

export type PageChange = { label: string; from: string; to: string };

const short = (s: string, n = 70) => {
  const one = s.replace(/\s+/g, " ").trim();
  if (!one) return "(empty)";
  return one.length > n ? `${one.slice(0, n - 1)}…` : one;
};
const money = (n: number) => (n > 0 ? `PKR ${n.toLocaleString("en-US")}` : "Free");
const lines = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const filled = (xs: string[]) => xs.map((x) => x.trim()).filter(Boolean);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function pageImportChanges(now: EditorPage, plan: PageImport): PageChange[] {
  const out: PageChange[] = [];
  const text = (label: string, from: string, to: string | undefined) => {
    if (to !== undefined && to.trim() !== from.trim()) out.push({ label, from: short(from), to: short(to) });
  };
  text("Title", now.title, plan.title);
  for (const f of COURSE_DETAIL_FIELDS) text(f.label, now.details[f.field], plan.details[f.field]);

  const p = plan.page;
  if (p.pricePkr !== undefined && p.pricePkr !== now.pricePkr) out.push({ label: "Price", from: money(now.pricePkr), to: money(p.pricePkr) });
  text("Topic", now.topic, p.topic);
  if (p.startsAt !== undefined && Date.parse(p.startsAt) !== Date.parse(now.startsAt)) {
    out.push({ label: "Webinar date", from: now.startsAt ? startsAtLabel(now.startsAt) : "(empty)", to: startsAtLabel(p.startsAt) });
  }
  text("Preview video", now.publicVideoUrl, p.publicVideoUrl);

  const list = (label: string, from: string[], to: string[] | undefined) => {
    if (to === undefined || same(filled(from), to)) return;
    out.push({ label, from: lines(filled(from).length, "line"), to: lines(to.length, "line") });
  };
  list("What you'll learn", now.outcomes, p.outcomes);
  list("This course includes", now.features, p.features);

  if (p.faqs !== undefined) {
    const cur = now.faqs.filter((f) => f.question.trim() && f.answer.trim()).map((f) => ({ question: f.question.trim(), answer: f.answer.trim() }));
    if (!same(cur, p.faqs)) out.push({ label: "Questions and answers", from: lines(cur.length, "question"), to: lines(p.faqs.length, "question") });
  }
  if (p.pageSections !== undefined && !same(normalizeSections(now.pageSections), normalizeSections(p.pageSections))) {
    out.push({ label: "Page sections", from: "current order", to: "new order, shown or hidden, headings" });
  }
  return out;
}
