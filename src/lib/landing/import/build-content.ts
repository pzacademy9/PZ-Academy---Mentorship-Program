// src/lib/landing/import/build-content.ts
// Turns a parsed pz-landing/1 file into validated page content plus the full list of possible links.
// Pure module (no database). Messages are plain words: page, section, country, module, link.
import {
  KIND_SECTIONS, contentSchema, emptyContent,
  type LandingContent, type LandingSection, type PageKind,
} from "../content";
import { SECTION_DEFS, SECTION_TYPES, sectionDataSchema, type FieldDef, type SectionType } from "../sections";
import { slugify, validateSlug } from "../slug";
import { MODULE_KEY_RE } from "../variants";
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
  const warn = (m: string) => warnings.push({ level: "warning", message: m });

  // ---- basics
  const kindText = text(front.kind);
  const kind = (KINDS as string[]).includes(kindText) ? (kindText as PageKind) : null;
  if (!kind) error(kindText === "" ? "The file does not say what kind of page this is. Add kind: course, workshop or webinar." : `"${kindText}" is not a page kind. Use course, workshop or webinar.`);
  const title = text(front.title);
  if (title === "") error("The page needs a title. Add title: at the top of the file.");
  let slug = text(front.slug);
  if (slug === "") slug = slugify(title);
  if (title !== "" || slug !== "") {
    const v = validateSlug(slug);
    if (!v.ok && (title !== "" || text(front.slug) !== "")) error(slug === "" ? "The page link could not be made from the title. Add slug: to the top of the file." : v.message);
  }

  // ---- registration + modules
  const reg = buildRegistration(front);
  for (const p of reg.problems) {
    if (p.level === "error") error(p.message);
    else warnings.push(p);
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
  if (text(seoIn.ogImage) !== "" || text(seoIn.og_image) !== "") sawPicture = true;

  // ---- sections
  const byType = new Map<SectionType, (typeof sections)[number]>();
  for (const s of sections) {
    const type = s.type as SectionType;
    if (byType.has(type)) { warn(`The "${SECTION_DEFS[type].label}" section appears twice. Only the first one is used.`); continue; }
    byType.set(type, s);
  }
  const standard = kind ? KIND_SECTIONS[kind] : [];
  const order: SectionType[] = [...standard, ...SECTION_TYPES.filter((t) => !standard.includes(t))];
  for (const type of order) {
    const s = byType.get(type);
    if (!s) continue;
    const label = SECTION_DEFS[type].label;
    const known = new Set([...SECTION_DEFS[type].fields.map((f) => f.key), "enabled"]);
    for (const k of Object.keys(s.data)) if (!known.has(k)) warn(`The "${label}" section has a field "${k}" that is not used. It was left out.`);
    const prepared = prepareItem(SECTION_DEFS[type].fields, s.data, {
      label, moduleKeys, warn, picture: () => { sawPicture = true; }, unknownKey: (k) => warn(`The "${label}" section has a field "${k}" that is not used. It was left out.`),
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
    if (s.type === "hero") review.push(`${s.id}:dateLine`);
    if (s.type === "schedule") (d.items as Rec[]).forEach((_, i) => review.push(`${s.id}:items.${i}.when`));
    if (s.type === "pricing_cards") {
      (d.items as Rec[]).forEach((it, i) => {
        if (text(it.price) !== "") review.push(`${s.id}:items.${i}.price`);
        if (text(it.oldPrice) !== "") review.push(`${s.id}:items.${i}.oldPrice`);
      });
      review.push(`${s.id}:note`);
    }
  }
  content.needsReview = review;

  // ---- warnings about gaps
  const schedule = content.sections.find((s) => s.type === "schedule");
  const dated = new Set(((schedule?.data.items as Rec[] | undefined) ?? []).map((it) => text(it.module)));
  for (const m of content.modules) if (!dated.has(m.key)) warn(`${m.title.trim() || m.key} has no dates.`);
  const faq = content.sections.find((s) => s.type === "faq");
  if (!faq || (faq.data.items as unknown[]).length === 0) warn("The page has no questions and answers (FAQ).");
  const hasEarly = Object.values(content.registration.prices).some((row) => Object.values(row).some((c) => c.earlyAmount !== undefined));
  if (hasEarly && content.registration.earlyBirdEndsAt.trim() === "") warn("An Early Bird price is given but there is no Early Bird end date.");

  // ---- links
  const regions = content.registration.regions;
  const links: ImportLink[] = [
    ...regions.map((r) => ({ regionKey: r.key, moduleKey: null as string | null, on: false })),
    ...content.modules.map((m) => ({ regionKey: null as string | null, moduleKey: m.key, on: false })),
    ...regions.flatMap((r) => content.modules.map((m) => ({ regionKey: r.key as string | null, moduleKey: m.key as string | null, on: false }))),
  ] as ImportLink[];
  const rawLinks = Array.isArray(front.links) ? front.links : [];
  rawLinks.forEach((entry, n) => {
    if (!isRecord(entry)) { error(`Link ${n + 1} in the file is not written correctly.`); return; }
    const c = text(entry.country);
    const m = text(entry.module);
    if (c === "" && m === "") { error(`Link ${n + 1} in the file names no country and no module.`); return; }
    const region = c === "" ? null : regions.find((r) => r.key.toLowerCase() === c.toLowerCase())?.key ?? null;
    if (c !== "" && !region) { error(`A link is listed for the country "${c}", which is not one of the countries.`); return; }
    if (m !== "" && !(MODULE_KEY_RE.test(m) && moduleKeys.has(m))) { error(`A link is listed for the module "${m}", which is not one of the modules.`); return; }
    const target = links.find((l) => l.regionKey === region && l.moduleKey === (m === "" ? null : m));
    if (!target) return;
    target.on = entry.on === true;
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
    else if (i.path[0] === "settings" || i.path[0] === "seo") error(`The page ${i.path[0] === "seo" ? "search preview" : "settings"} are not valid: ${i.message}.`);
    else error(`The page is not valid: ${i.message}.`);
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
  unknownKey: (k: string) => void;
}

/** Shapes raw file data to the fields of a section: unknown keys dropped, pictures emptied, module tags checked. */
function prepareItem(fields: FieldDef[], raw: Rec, ctx: PrepCtx): Rec {
  const out: Rec = {};
  for (const f of fields) {
    const v = raw[f.key];
    if (f.kind === "list") {
      const items = Array.isArray(v) ? v : [];
      const sub = f.itemFields ?? [];
      out[f.key] = items.map((it) => {
        const rec: Rec = isRecord(it) ? it : { [sub[0]?.key ?? ""]: it };
        if (isRecord(it)) {
          const subKeys = new Set(sub.map((x) => x.key));
          for (const k of Object.keys(it)) if (!subKeys.has(k)) ctx.unknownKey(`${f.key}.${k}`);
        }
        return prepareItem(sub, rec, ctx);
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
      out[f.key] = typeof v === "string" ? v : typeof v === "number" ? String(v) : (f.defaultValue ?? "");
    }
  }
  return out;
}

function sectionIssue(type: SectionType, issue: { path: PropertyKey[]; message: string; code?: string } | undefined): string {
  const def = SECTION_DEFS[type];
  const key = issue?.path.find((p) => typeof p === "string") as string | undefined;
  const field = def.fields.find((f) => f.key === key);
  const sub = issue?.path.length && issue.path.length >= 3 ? field?.itemFields?.find((f) => f.key === issue.path[2]) : undefined;
  const where = (sub ?? field)?.label;
  const n = field?.kind === "list" && typeof issue?.path[1] === "number" ? ` (${field.itemLabel ?? "item"} ${issue.path[1] + 1})` : "";
  const max = (sub ?? field)?.max;
  const what = issue?.code === "too_big" && max ? `is too long (at most ${max} characters)` : issue?.message.replace(/\.$/, "") ?? "has a problem";
  return `The "${def.label}" section${where ? `, "${where}"${n}` : ""}: ${where ? what : `has a problem: ${what}`}.`;
}
