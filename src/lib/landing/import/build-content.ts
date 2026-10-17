// src/lib/landing/import/build-content.ts
// Turns a parsed pz-landing/1 file into validated page content plus the full list of possible links.
// Pure module (no database). Messages are plain words: page, section, country, module, link.
import {
  KIND_SECTIONS, contentSchema, emptyContent,
  type LandingContent, type LandingSection, type PageKind,
} from "../content";
import { SECTION_DEFS, SECTION_TYPES, sectionDataSchema, type FieldDef, type SectionType } from "../sections";
import { slugify, validateSlug } from "../slug";
import { buildRegistration } from "./build-registration";
import { parseImportFile, type ImportProblem } from "./parse";

export interface ImportLink { regionKey: string | null; moduleKey: string | null; on: boolean; heroTitle?: string; heroSubtitle?: string }
export interface BuiltImport {
  kind: PageKind; title: string; slug: string;
  content: LandingContent;
  links: ImportLink[];
  warnings: ImportProblem[];
}

type Rec = Record<string, unknown>;
const isRecord = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
const KINDS: PageKind[] = ["course", "workshop", "webinar"];
const PICTURES_WARNING = "Pictures are added in the editor, not in the file.";

export function buildImport(raw: string): { ok: true; built: BuiltImport } | { ok: false; errors: string[] } {
  try {
    return build(raw);
  } catch {
    return { ok: false, errors: ["This file could not be turned into a page."] };
  }
}

function build(raw: string): { ok: true; built: BuiltImport } | { ok: false; errors: string[] } {
  const parsed = parseImportFile(raw);
  const problems: ImportProblem[] = parsed.ok ? [] : [...parsed.problems];
  if (!parsed.ok) return fail(problems);
  const { front, sections } = parsed.file;
  const errors: string[] = [];
  const warnings: ImportProblem[] = [];
  const error = (m: string) => errors.push(m);
  const warn = (m: string) => {
    if (!warnings.some((w) => w.message === m)) warnings.push({ level: "warning", message: m });
  };

  // ---- basics
  const kindText = text(front.kind);
  const kind = (KINDS as string[]).includes(kindText) ? (kindText as PageKind) : null;
  if (!kind) error(kindText === "" ? "The file does not say what kind of page this is. Add kind: course, workshop or webinar." : `"${kindText}" is not a page kind. Use course, workshop or webinar.`);
  const title = text(front.title);
  if (title === "") error("The page needs a title. Add title: at the top of the file.");
  let slug = text(front.slug);
  if (slug === "") slug = slugify(title);
  if (slug === "") {
    if (title !== "") error("The page link could not be made from the title. Add slug: to the top of the file.");
  } else {
    const v = validateSlug(slug);
    if (!v.ok) error(v.message);
  }

  // ---- registration + modules
  const reg = buildRegistration(front);
  for (const p of reg.problems) {
    if (p.level === "error") error(p.message);
    else warn(p.message);
  }
  // Module limits (the page would otherwise fail with a technical message).
  const rawMods = Array.isArray(front.modules) ? front.modules.filter(isRecord) : [];
  for (const rm of rawMods) {
    const name = text(rm.key) || "A module";
    if (text(rm.title).length > 120) error(`${name}: the title is too long (max 120 letters).`);
    if (text(rm.format).length > 60) error(`${name}: the format is too long (max 60 letters).`);
    const d = rm.days;
    if (d !== undefined && d !== null && d !== "" && !(typeof d === "number" && Number.isInteger(d) && d >= 0 && d <= 60)) {
      error(`${name}: the number of days must be a whole number from 0 to 60.`);
    }
  }
  const moduleKeys = new Set(reg.modules.map((m) => m.key));

  // ---- settings and seo
  const settings = isRecord(front.settings) ? front.settings : {};
  const seoIn = isRecord(front.seo) ? front.seo : {};
  let sawPicture = false;
  const base = emptyContent(kind ?? "course");
  const content: LandingContent = {
    ...base,
    settings: {
      registerUrl: "",
      registerLabel: text(settings.register_label) || base.settings.registerLabel,
      whatsappNumber: text(settings.whatsapp),
      countdownTo: text(settings.countdown_to),
      countdownLabel: text(settings.countdown_label),
    },
    seo: { title: text(seoIn.title), description: text(seoIn.description), ogImage: "" },
    registration: reg.registration,
    modules: reg.modules,
    sections: [],
    needsReview: [],
  };
  if (content.settings.countdownTo !== "") warn("Check the countdown date before publishing.");
  if (text(seoIn.ogImage) !== "" || text(seoIn.og_image) !== "") sawPicture = true;

  // ---- sections
  const byType = new Map<SectionType, (typeof sections)[number]>();
  for (const s of sections) {
    const type = s.type as SectionType;
    if (byType.has(type)) { warn(`The "${SECTION_DEFS[type].label}" section appears twice. Only the first one is used.`); continue; }
    byType.set(type, s);
  }
  const standard = kind ? KIND_SECTIONS[kind] : [];
  const extras = SECTION_TYPES.filter((t) => !standard.includes(t));
  const closing = standard.includes("final_cta") ? ["final_cta" as SectionType] : [];
  const order: SectionType[] = [...standard.filter((t) => t !== "final_cta"), ...extras, ...closing];
  for (const type of order) {
    const s = byType.get(type);
    if (!s) continue;
    const label = SECTION_DEFS[type].label;
    const known = new Set([...SECTION_DEFS[type].fields.map((f) => f.key), "enabled"]);
    for (const k of Object.keys(s.data)) if (!known.has(k)) warn(`The "${label}" section has a field "${k}" that is not used. It was left out.`);
    const prepared = prepareItem(SECTION_DEFS[type].fields, s.data, {
      label, moduleKeys, warn, picture: () => { sawPicture = true; },
    });
    const section: LandingSection = { id: globalThis.crypto.randomUUID(), type, enabled: s.data.enabled !== false, data: prepared };
    const check = sectionDataSchema(type).safeParse(prepared);
    if (!check.success) error(sectionIssue(type, check.error.issues[0]));
    content.sections.push(section);
  }
  if (sawPicture) warn(PICTURES_WARNING);

  // ---- stale-prone fields
  const review: string[] = [];
  for (const s of content.sections) {
    const d = s.data;
    if (s.type === "hero" && text(d.dateLine) !== "") review.push(`${s.id}:dateLine`);
    if (s.type === "schedule") (d.items as Rec[]).forEach((it, i) => { if (text(it.when) !== "") review.push(`${s.id}:items.${i}.when`); });
    if (s.type === "pricing_cards") {
      (d.items as Rec[]).forEach((it, i) => {
        if (text(it.price) !== "") review.push(`${s.id}:items.${i}.price`);
        if (text(it.oldPrice) !== "") review.push(`${s.id}:items.${i}.oldPrice`);
      });
      if (text(d.note) !== "") review.push(`${s.id}:note`);
    }
  }
  content.needsReview = review;

  // ---- warnings about gaps
  const schedule = content.sections.find((s) => s.type === "schedule");
  if (schedule && schedule.enabled) {
    const dated = new Set(((schedule.data.items as Rec[]) ?? []).map((it) => text(it.module)));
    if (!dated.has("")) for (const m of content.modules) if (!dated.has(m.key)) warn(`${m.title.trim() || m.key} has no dates.`);
  }
  const faq = content.sections.find((s) => s.type === "faq");
  if (!faq || (faq.data.items as unknown[]).length === 0) warn("The page has no questions and answers (FAQ).");

  // ---- links
  const regions = content.registration.regions;
  const links: ImportLink[] = [
    ...regions.map((r) => ({ regionKey: r.key, moduleKey: null as string | null, on: false })),
    ...content.modules.map((m) => ({ regionKey: null as string | null, moduleKey: m.key, on: false })),
    ...regions.flatMap((r) => content.modules.map((m) => ({ regionKey: r.key as string | null, moduleKey: m.key as string | null, on: false }))),
  ] as ImportLink[];
  if (front.links !== undefined && front.links !== null && !Array.isArray(front.links)) warn("The links list could not be read, so no links were switched on.");
  const rawLinks = Array.isArray(front.links) ? front.links : [];
  const seenLinks = new Set<string>();
  rawLinks.forEach((entry, n) => {
    if (!isRecord(entry)) { error(`Link ${n + 1} in the file is not written correctly.`); return; }
    const c = text(entry.country);
    const m = text(entry.module);
    if (c === "" && m === "") { error(`Link ${n + 1} in the file names no country and no module.`); return; }
    const region = c === "" ? null : regions.find((r) => r.key.toLowerCase() === c.toLowerCase())?.key ?? null;
    if (c !== "" && !region) { error(`A link is listed for the country "${c}", which is not one of the countries.`); return; }
    const mod = m === "" ? null : content.modules.find((x) => x.key.toLowerCase() === m.toLowerCase())?.key ?? null;
    if (m !== "" && !mod) { error(`A link is listed for the module "${m}", which is not one of the modules.`); return; }
    const target = links.find((l) => l.regionKey === region && l.moduleKey === mod);
    if (!target) return;
    const name = [region, mod].filter(Boolean).join(" / ");
    if (seenLinks.has(name)) warn(`${name} is listed twice; the last entry is used.`);
    seenLinks.add(name);
    target.on = entry.on === true;
    delete target.heroTitle;
    delete target.heroSubtitle;
    const ht = text(entry.hero_title);
    const hs = text(entry.hero_subtitle);
    if (ht !== "") target.heroTitle = ht;
    if (hs !== "") target.heroSubtitle = hs;
  });

  // ---- whole-page check
  const whole = contentSchema.safeParse(content);
  if (!whole.success && errors.length === 0) {
    const i = whole.error.issues[0];
    const idx = i.path[0] === "sections" && typeof i.path[1] === "number" ? i.path[1] : -1;
    if (idx >= 0) error(sectionIssue(content.sections[idx].type, i));
    else error(pageIssue(i));
  }

  if (errors.length > 0 || !kind) return fail(errors);
  return { ok: true, built: { kind, title, slug, content, links, warnings } };
}

function fail(errs: (string | ImportProblem)[]): { ok: false; errors: string[] } {
  return { ok: false, errors: errs.map((e) => (typeof e === "string" ? e : e.message)) };
}

interface PrepCtx {
  label: string;
  moduleKeys: Set<string>;
  warn: (m: string) => void;
  picture: () => void;
}

/** Shapes raw file data to the fields of a section: unknown keys dropped, pictures emptied, module tags checked. */
function prepareItem(fields: FieldDef[], raw: Rec, ctx: PrepCtx, parent?: FieldDef): Rec {
  const out: Rec = {};
  const unreadable = (f: FieldDef) => ctx.warn(`${ctx.label}: '${(parent ?? f).label}' could not be read and was left empty.`);
  for (const f of fields) {
    const v = raw[f.key];
    const present = v !== undefined && v !== null;
    if (f.kind === "list") {
      if (present && !Array.isArray(v)) unreadable(f);
      const items = Array.isArray(v) ? v : [];
      const sub = f.itemFields ?? [];
      out[f.key] = items.map((it) => {
        if (isRecord(it)) {
          const subKeys = new Set(sub.map((x) => x.key));
          for (const k of Object.keys(it)) if (!subKeys.has(k)) ctx.warn(`The "${ctx.label}" section: entries under "${f.label}" have a field "${k}" that is not used. It was left out.`);
          return prepareItem(sub, it, ctx, f);
        }
        if (typeof it === "string" || typeof it === "number") return prepareItem(sub, { [sub[0]?.key ?? ""]: it }, ctx, f);
        unreadable(f);
        return prepareItem(sub, {}, ctx, f);
      });
    } else if (f.kind === "image") {
      if (text(v) !== "") ctx.picture();
      out[f.key] = "";
    } else if (f.kind === "module") {
      const tag = text(v);
      if (tag !== "" && !ctx.moduleKeys.has(tag)) {
        ctx.warn(`In "${ctx.label}", an entry is tagged with the module "${tag}", which is not one of the modules. The tag was removed.`);
        out[f.key] = "";
      } else out[f.key] = tag;
    } else {
      if (present && typeof v !== "string" && typeof v !== "number") unreadable(f);
      out[f.key] = typeof v === "string" ? v : typeof v === "number" ? String(v) : (f.defaultValue ?? "");
    }
  }
  return out;
}

function sectionIssue(type: SectionType, issue: { path: PropertyKey[]; message: string; code?: string } | undefined): string {
  const def = SECTION_DEFS[type];
  const key = issue?.path.find((p) => typeof p === "string") as string | undefined;
  const field = def.fields.find((f) => f.key === key);
  const sub = issue && issue.path.length >= 3 ? field?.itemFields?.find((f) => f.key === issue.path[2]) : undefined;
  const target = sub ?? field;
  const n = field?.kind === "list" && typeof issue?.path[1] === "number" ? ` (${field.itemLabel ?? "item"} ${issue.path[1] + 1})` : "";
  if (issue?.code === "too_big") {
    if (field?.kind === "list" && !sub && issue.path.length === 1) return `${def.label}: too many items (max ${field.maxItems ?? 40}).`;
    if (target?.max) return `${def.label}, "${target.label}"${n}: too long (max ${target.max} letters).`;
  }
  const what = issue?.code === "custom" ? issue.message.replace(/\.$/, "") : "is not valid";
  return target ? `${def.label}, "${target.label}"${n}: ${what}.` : `${def.label}: something in this section is not valid.`;
}

const PAGE_FIELDS: Record<string, [string, number]> = {
  "settings.registerLabel": ["The Register button text", 40],
  "settings.whatsappNumber": ["The WhatsApp number", 30],
  "settings.countdownTo": ["The countdown date", 40],
  "settings.countdownLabel": ["The countdown text", 80],
  "seo.title": ["The search preview title", 120],
  "seo.description": ["The search preview description", 300],
};

function pageIssue(issue: { path: PropertyKey[]; code?: string }): string {
  const hit = PAGE_FIELDS[issue.path.slice(0, 2).map(String).join(".")];
  if (hit) return issue.code === "too_big" ? `${hit[0]} is too long (max ${hit[1]} letters).` : `${hit[0]} is not valid.`;
  return "The page could not be saved because something in the file is too big or not valid.";
}
