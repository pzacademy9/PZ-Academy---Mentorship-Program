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

export type PageChange = { key: string; label: string; from: string; to: string };

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
  const text = (key: string, label: string, from: string, to: string | undefined) => {
    if (to !== undefined && to.trim() !== from.trim()) out.push({ key, label, from: short(from), to: short(to) });
  };
  text("title", "Title", now.title, plan.title);
  for (const f of COURSE_DETAIL_FIELDS) text(f.field, f.label, now.details[f.field], plan.details[f.field]);

  const p = plan.page;
  if (p.pricePkr !== undefined && p.pricePkr !== now.pricePkr) out.push({ key: "price", label: "Price", from: money(now.pricePkr), to: money(p.pricePkr) });
  text("topic", "Topic", now.topic, p.topic);
  if (p.startsAt !== undefined && Date.parse(p.startsAt) !== Date.parse(now.startsAt)) {
    out.push({ key: "startsAt", label: "Webinar date", from: now.startsAt ? startsAtLabel(now.startsAt) : "(empty)", to: startsAtLabel(p.startsAt) });
  }
  text("publicVideoUrl", "Preview video", now.publicVideoUrl, p.publicVideoUrl);

  const list = (key: string, label: string, from: string[], to: string[] | undefined) => {
    if (to === undefined || same(filled(from), to)) return;
    out.push({ key, label, from: lines(filled(from).length, "line"), to: lines(to.length, "line") });
  };
  list("outcomes", "What you'll learn", now.outcomes, p.outcomes);
  list("features", "This course includes", now.features, p.features);

  if (p.faqs !== undefined) {
    const cur = now.faqs.filter((f) => f.question.trim() && f.answer.trim()).map((f) => ({ question: f.question.trim(), answer: f.answer.trim() }));
    if (!same(cur, p.faqs)) out.push({ key: "faqs", label: "Questions and answers", from: lines(cur.length, "question"), to: lines(p.faqs.length, "question") });
  }
  if (p.pageSections !== undefined && !same(normalizeSections(now.pageSections), normalizeSections(p.pageSections))) {
    out.push({ key: "pageSections", label: "Page sections", from: "current order", to: "new order, shown or hidden, headings" });
  }
  return out;
}

/** A copy of the plan that keeps only the ticked parts (by change key). */
export function filterPageImport(plan: PageImport, keys: ReadonlySet<string>): PageImport {
  const details: ImportDetails = {};
  for (const f of COURSE_DETAIL_FIELDS) {
    const v = plan.details[f.field];
    if (keys.has(f.field) && v !== undefined) details[f.field] = v;
  }
  const page: PageImport["page"] = {};
  const take = <K extends keyof PageImport["page"]>(key: string, field: K) => {
    if (keys.has(key) && plan.page[field] !== undefined) page[field] = plan.page[field];
  };
  take("price", "pricePkr");
  take("topic", "topic");
  take("startsAt", "startsAt");
  take("publicVideoUrl", "publicVideoUrl");
  take("outcomes", "outcomes");
  take("features", "features");
  take("faqs", "faqs");
  take("pageSections", "pageSections");
  return { ...(keys.has("title") && plan.title !== undefined ? { title: plan.title } : {}), details, page };
}
