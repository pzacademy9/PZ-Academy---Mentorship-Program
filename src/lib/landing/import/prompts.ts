// src/lib/landing/import/prompts.ts
// The master prompts a teammate pastes into ChatGPT / Claude / Gemini. The AI interviews them and writes one
// pz-landing/1 file that the "Import .md" button turns into a draft page. Pure module (no database).
// The section lists are derived from SECTION_DEFS / KIND_SECTIONS so the prompt can never drift from the app.
import { KIND_SECTIONS, type PageKind } from "../content";
import { SECTION_DEFS, type FieldDef, type SectionType } from "../sections";

export const IMPORT_FORMAT_ID = "pz-landing/1";

const FENCE = "```";
const OUTER = "````";

// ---------------------------------------------------------------- sections (derived)

function fieldLine(f: FieldDef, kind: PageKind): string {
  if (f.kind === "image") return ""; // pictures are never in the file
  const req = f.required ? "*" : "";
  const defaultMax = f.kind === "textarea" ? 2000 : 200;
  const lim = f.max && f.max !== defaultMax && f.kind !== "module" ? ` (max ${f.max})` : "";
  if (f.kind === "list") {
    const subs = (f.itemFields ?? []).map((x) => fieldLine(x, kind)).filter((s) => s !== "").join(", ");
    return `${f.key}${req}: list (up to ${f.maxItems ?? 40}) of {${subs}}`;
  }
  if (f.kind === "module") return kind === "webinar" ? "" : `${f.key}: optional module code`;
  if (f.kind === "youtube") return `${f.key}${req}: full YouTube link`;
  if (f.kind === "url") return `${f.key}${req}: https:// link`;
  if (f.kind === "textarea") return `${f.key}${req}${lim}: text`;
  return `${f.key}${req}${lim}`;
}

function sectionBlock(type: SectionType, kind: PageKind): string {
  const def = SECTION_DEFS[type];
  const fields = def.fields.map((f) => fieldLine(f, kind)).filter((s) => s !== "");
  return [`## Section: ${type}`, `${def.description}`, ...fields.map((f) => `- ${f}`)].join("\n");
}

function sectionsText(kind: PageKind): string {
  return KIND_SECTIONS[kind].map((t) => sectionBlock(t, kind)).join("\n\n");
}

// ---------------------------------------------------------------- per-kind wording

interface KindInfo {
  noun: string; // "course", "workshop", "webinar"
  topics: string[]; // what to ask about, in order
  notes: string[]; // kind-specific advice for the AI
  frontExtra: string; // extra front-matter lines (modules) shown in the format guide
}

const KIND_INFO: Record<PageKind, KindInfo> = {
  course: {
    noun: "course",
    topics: [
      "the page name and the link name (the last part of the web address, small letters and dashes)",
      "the modules: name, format (for example 3-Day Workshop) and days of each; and whether students can buy single modules or mix them",
      "event dates for every module, and the class time for each country",
      "prices for each country: the full course and each module, the Early Bird price and the day it ends, group discounts, and Live versus Recorded",
      "the instructor or instructors (name, title, short bio)",
      "what is included, and what students learn in each module (benefit cards and course outline)",
      "real numbers for the numbers bar (for example students trained); skip if none",
      "frequently asked questions and their answers",
      "the WhatsApp number for the chat button, and the WhatsApp number where students send their payment screenshot (often the same)",
      "which countries should get their own link, and which modules should get their own link with its own top title",
    ],
    notes: [
      "A course has modules. List every module in modules, with one option per module (kind: module) and one for the full course (kind: bundle), each module pointing to its option. If students may mix modules, enable module_mix with the full-course option as bundle.",
      "In the outline show one entry per module (title \"Day N: name\"; topics as \"- \" lines, never day titles and topics in one flat list). In the schedule, give entries that belong to one module that module's code.",
      "Give each module link its own hero_title (for example \"Module 2: Therapeutics\") when the teammate wants one. Ask for it. If the document is silent on mixing modules or on which links to switch on, leave module_mix and links out and list them under \"Please check\".",
      "Only add the video reviews or written testimonials sections if the teammate gives you real YouTube links or real quotes. Otherwise leave those sections out and say so.",
    ],
    frontExtra: `modules:
  - { key: module-1, title: Module name, format: 3-Day Workshop, days: 3, option: m1 }`,
  },
  workshop: {
    noun: "workshop",
    topics: [
      "the page name (for example \"Mastering Dose Calculation – MDC 3\") and the link name (the last part of the web address, small letters and dashes)",
      "the dates: a short day-by-day agenda with date and time; and the class time for each country",
      "prices for each country: the normal price, the Early Bird price and the day it ends, group discounts, and Live versus Recorded if offered",
      "the instructor or instructors (name, title, short bio)",
      "who the workshop is for, what students will learn, and what is included",
      "the workshop outline (topics for each day)",
      "numbers that are really true for the numbers bar; skip it if there are none",
      "frequently asked questions and their answers",
      "the WhatsApp number for the chat button, and the WhatsApp number where students send their payment screenshot (often the same)",
      "which countries should get their own link",
      "only if the workshop is split into several parts students can buy separately: the modules, and which get their own link and top title",
    ],
    notes: [
      "A workshop is usually one event. Keep dates short, for example \"Fri 30 Oct · 7:30 PM\". Do not add a modules list unless the workshop really has separately sold parts.",
      "Use one option of kind bundle for the workshop. Add an Early Bird price and end date only when the teammate gives them.",
      "Only add written testimonials if the teammate gives you real quotes. Otherwise leave that section out and say so.",
    ],
    frontExtra: `modules:
  - { key: module-1, title: Module name, format: 3-Day Workshop, days: 3, option: m1 }`,
  },
  webinar: {
    noun: "webinar",
    topics: [
      "the page name (for example \"Diabetes Pharmacotherapy Webinar\") and the link name (the last part of the web address, small letters and dashes)",
      "the date, and the start time and time zone for each country",
      "whether it is free or paid, and the price for each country if paid",
      "the speaker or speakers (name, title, short bio)",
      "what attendees will explore or learn, and who it is for",
      "frequently asked questions and their answers (for example how to join, whether there is a recording)",
      "the WhatsApp number for the chat button, and (if paid) the WhatsApp number where students send their payment screenshot",
      "which countries should get their own link",
    ],
    notes: [
      "A webinar is a single event: one date, one speaker group, no modules and no course outline. Do not add a modules list and do not ask about modules.",
      "A single plan: write one option of kind bundle. A free webinar: free: true on the option AND a price of amount: 0 for every country that can register. A Free plan plus a paid (for example Pro) plan: write TWO options, one with free: true and amount: 0 in every country, and one paid option with its price per country. Do not put Free and Pro in one option.",
      "In the schedule, list the date and time and any short agenda lines. Use the text block for what attendees will explore.",
    ],
    frontExtra: "",
  },
};

// ---------------------------------------------------------------- worked examples

const heroBlock = (kind: PageKind): string => {
  if (kind === "course") {
    return `eyebrow: LIVE COURSE · 2 MODULES
headline: Practical Pharmacology Course
subheadline: "A hands-on course, built for pharmacists who want to use drugs with confidence."
primaryCtaLabel: Register now
dateLine: Starts 15 November 2026
badges:
  - { text: Live classes }
  - { text: Certificate }`;
  }
  if (kind === "workshop") {
    return `eyebrow: LIVE WORKSHOP · 3 DAYS
headline: Mastering Dose Calculation
subheadline: Learn to calculate doses safely, step by step.
primaryCtaLabel: Register now
dateLine: 4 to 6 November 2026 · 7:30 PM
badges:
  - { text: Hands-on practice }`;
  }
  return `eyebrow: FREE LIVE WEBINAR
headline: Choosing the Right Drug for Diabetes
subheadline: One evening, one clear way to choose therapy for your patient.
primaryCtaLabel: Save my seat
dateLine: Friday, 6 November 2026 · 7:30 PM`;
};

const SAMPLE_BLOCKS: Record<SectionType, (kind: PageKind) => string> = {
  hero: heroBlock,
  stats: (kind) => `items:
  - { value: "500+", label: Pharmacists trained }
  - { value: "${kind === "course" ? "2" : "3"}", label: ${kind === "course" ? "Modules" : "Days of practice"} }`,
  rich_text: (kind) => `heading: ${kind === "webinar" ? "What you will explore" : "Who is this for?"}
body: |
  ${kind === "webinar" ? "In one evening you will see how to match the drug to the patient." : "This is for pharmacists who want practical skills."}
  - Clinical pharmacists
  - Community pharmacists`,
  feature_cards: () => `heading: What you will get
items:
  - { title: Live classes, text: "Learn with an expert, and ask questions." }
  - { title: Practice cases, text: "Work through real patient cases, step by step." }`,
  curriculum: (kind) => {
    const tag = (m: string) => (kind === "course" ? `
    module: ${m}` : "");
    return `heading: What you will learn
items:
  - title: "${kind === "course" ? "Module 1: Foundations" : "Day 1: Basics"}"
    subtitle: ${kind === "course" ? "3 days" : "Morning session"}${tag("module-1")}
    points: |
      - How drugs work
      - Reading a prescription
  - title: "${kind === "course" ? "Module 2: Therapeutics" : "Day 2: Practice"}"${tag("module-2")}
    points: |
      - Choosing a drug
      - Checking doses`;
  },
  instructors: (kind) => `heading: ${kind === "webinar" ? "Meet your speaker" : "Meet your instructor"}
items:
  - { name: Dr. Sample Name, role: Clinical Pharmacist, bio: "Teaches pharmacology to pharmacists." }`,
  pricing_cards: (kind) => kind === "webinar"
    ? `heading: Choose your plan
items:
  - name: Free Plan
    price: Free
    features: |
      - Live webinar
  - name: Pro Plan
    price: See price for your country

    features: |
      - Live webinar
      - Recording for registered people`
    : `heading: Choose your plan
note: Early Bird ends 25 October 2026
items:
  - name: ${kind === "course" ? "Full course" : "Workshop seat"}
    price: See price for your country
    features: |
      - Live classes
      - Certificate`,
  schedule: (kind) => `heading: Schedule
items:
  - { when: "${kind === "course" ? "15 Nov · 7:30 PM" : "Fri 6 Nov · 7:30 PM"}", title: ${kind === "course" ? "Module 1 begins" : "Session starts"}${kind === "course" ? ", module: module-1" : ""} }
  - { when: "${kind === "course" ? "22 Nov · 7:30 PM" : "Fri 6 Nov · 9:00 PM"}", title: ${kind === "course" ? "Module 2 begins" : "Questions and answers"}${kind === "course" ? ", module: module-2" : ""} }`,
  video_reviews: () => `heading: What students say
items:
  - { url: "https://www.youtube.com/watch?v=aqz-KE-bpKQ", caption: "A student shares their result" }`,
  testimonials: () => `heading: Loved by pharmacists
items:
  - { quote: "A very clear, practical course.", name: Sample Student, role: Pharmacist }`,
  faq: () => `items:
  - { q: Will I get a recording?, a: "Yes. Registered students get the recording." }
  - { q: Can I pay in my own currency?, a: "Yes. Pick your country when you register." }`,
  final_cta: () => `headline: Ready to join?
text: Seats are limited. Reserve yours today.
buttonLabel: Register now`,
};

function exampleFront(kind: PageKind): string {
  const free = kind === "webinar";
  const regions = `    - { code: UAE, name: UAE, currency: AED, class_time: "7:30 PM – 9:00 PM", timezone: UAE time }
    - { code: PK, name: Pakistan, currency: PKR, class_time: "8:30 PM – 10:00 PM", timezone: Pakistan time }`;
  const title = kind === "course" ? "Practical Pharmacology Course – Batch 3" : kind === "workshop" ? "Mastering Dose Calculation" : "Choosing the Right Drug for Diabetes";
  const slug = kind === "course" ? "ppc-batch-3" : kind === "workshop" ? "mdc-3" : "diabetes-webinar";
  const label = kind === "course" ? "Full Course (2 Modules)" : kind === "workshop" ? "Workshop Seat" : "Webinar Seat";
  const options = kind === "course"
    ? `    - { key: full, name: ${label}, kind: bundle }
    - { key: m1, name: Module 1, kind: module }
    - { key: m2, name: Module 2, kind: module }`
    : free
      ? `    - { key: free, name: Free Plan, kind: bundle, free: true }
    - { key: pro, name: Pro Plan, kind: bundle }`
      : `    - { key: seat, name: ${label}, kind: bundle }`;
  const prices = free ? `  prices:
    free:
      UAE: { amount: 0 }
      PK: { amount: 0 }
    pro:
      UAE: { amount: 80, early: 60 }
      PK: { amount: 3500, early: 2700 }
` : kind === "course"
    ? `  tiers:
    - { key: g3, label: Group of 3, size: 3, percent_off: 20 }
    - { key: g5, label: Group of 5 or more, min: 5, max: 10, percent_off: 25 }
  prices:
    full:
      UAE: { amount: 200, early: 160, group_totals: { g3: 480 }, early_group_totals: { g3: 384 } }
      PK: { amount: 15000, early: 12000 }
    m1:
      UAE: { amount: 100, early: 80 }
      PK: { amount: 8000, early: 6500 }
    m2:
      UAE: { amount: 100, early: 80 }
      PK: { amount: 8000, early: 6500 }
`
    : `  prices:
    seat:
      UAE: { amount: 80, early: 60 }
      PK: { amount: 3500, early: 2700 }
`;
  const modules = kind === "course"
    ? `modules:
  - { key: module-1, title: Foundations, format: 3-Day Workshop, days: 3, option: m1 }
  - { key: module-2, title: Therapeutics, format: 3-Day Workshop, days: 3, option: m2 }
`
    : "";
  const links = kind === "course"
    ? `links:
  - { country: UAE, on: true }
  - { module: module-2, on: true, hero_title: "Module 2: Therapeutics", hero_subtitle: "Choose the right drug for the patient" }
  - { country: UAE, module: module-2, on: true }
`
    : `links:
  - { country: UAE, on: true }
`;
  const early = "  early_bird_ends: 2026-10-25T23:59:00+04:00\n";
  const mix = kind === "course" ? "  module_mix: { enabled: true, bundle: full }\n" : "";
  return `format: ${IMPORT_FORMAT_ID}
kind: ${kind}
title: ${title}
slug: ${slug}
seo: { title: "${title}", description: "A practical PZ Academy ${kind} for pharmacists." }
settings:
  register_label: Register now
  whatsapp: "923001234567"
registration:
  modes: ${kind === "course" ? "[live, recorded]" : "[live]"}
${kind === "course" ? "  recorded_percent: 60\n" : ""}  default_region: UAE
${early}  event_label: ${title}
  ref_prefix: ${kind === "course" ? "PPC" : kind === "workshop" ? "MDC" : "WEB"}
  verify_whatsapp: "923001234567"
  regions:
${regions}
  options:
${options}
${mix}${prices}${modules}${links}`;
}

export function exampleFile(kind: PageKind): string {
  const sections = KIND_SECTIONS[kind]
    .map((t) => `## Section: ${t}\n${FENCE}yml\n${SAMPLE_BLOCKS[t](kind)}\n${FENCE}`)
    .join("\n\n");
  return `---\n${exampleFront(kind)}---\n\n${sections}\n`;
}

export const EXAMPLE_FILE_BY_KIND: Record<PageKind, string> = {
  course: exampleFile("course"),
  workshop: exampleFile("workshop"),
  webinar: exampleFile("webinar"),
};

// ---------------------------------------------------------------- the prompt

function formatGuide(kind: PageKind, info: KindInfo): string {
  const hasModules = info.frontExtra !== "";
  const modulesLine = hasModules ? `\n${info.frontExtra}          # days is a plain number, not in quotes; key: small letters, digits, single dashes` : "";
  const options = hasModules
    ? "    - { key: full, name: Full Course, kind: bundle }\n    - { key: m1, name: Module 1, kind: module }"
    : `    - { key: full, name: ${kind === "webinar" ? "Webinar Seat" : "Workshop Seat"}, kind: bundle }`;
  const mix = hasModules ? "\n  module_mix: { enabled: true, bundle: full }   # only if students can mix modules" : "";
  const linkLines = "  - { country: UAE, on: true }" + (hasModules ? '\n  - { module: module-1, on: true, hero_title: "Module 1: Foundations", hero_subtitle: "..." }\n  - { country: UAE, module: module-1, on: true }' : "");
  return `# The file you must write

The file opens with a top part between two lines of three dashes (--- ... ---), written as key: value lines (indent with spaces, never tabs). The page sections follow.

${FENCE}yml
format: ${IMPORT_FORMAT_ID}
kind: ${kind}
title: Page name
slug: link-name-in-small-letters-and-dashes
seo: { title: "...", description: "..." }
settings:
  register_label: Register now
  whatsapp: "923001234567"      # chat button; digits only, in quotes, with country code
  countdown_to: 2026-10-25T23:59:00+04:00   # optional, with time zone
  countdown_label: Early Bird ends in
registration:
  modes: [live, recorded]       # leave out if only Live
  recorded_percent: 60          # Recorded price as a percent of Live; only if the teammate says so
  default_region: UAE
  early_bird_ends: 2026-10-25T23:59:00+04:00
  verify_whatsapp: "923001234567"   # where students send their payment screenshot
  event_label: Short event name
  ref_prefix: ABC               # 2 to 6 capital letters or digits
  regions:                      # one line per country
    - { code: UAE, name: UAE, currency: AED, class_time: "6:30 PM – 7:30 PM", timezone: UAE time }
  options:                      # what people can buy
${options}${mix}
  tiers:                        # group discounts, only if given (min/max instead of size for "N or more")
    - { key: g3, label: Group of 3, size: 3, percent_off: 20 }
    - { key: g5, label: Group of 5 or more, min: 5, max: 10, percent_off: 25 }
  prices:
    full:
      UAE: { amount: 200, early: 160, group_totals: { g3: 480 }, early_group_totals: { g3: 384 } }${modulesLine}
links:                          # which links to switch on
${linkLines}
${FENCE}

Rules for that top part:
- Every price is a plain number: 200, not "AED 200" and not "1,200". Put the currency in the country line only. Group discounts: if the document gives only a percentage ("Group of 3 or more: 20% off"), write the tier with percent_off and NO group_totals; the page calculates the price. Write group_totals (the total for the whole group, not per person; early_group_totals for the Early Bird price) only when the document states that exact total, only for a tier with one fixed size, and a stated total beats a calculated one. For "N or more" use min: N and a top size as max. Use whole numbers only.
- Country codes are 2 to 6 capital letters (UAE, PK). Option keys: small letters, digits or _.
- Every country used in prices or links must be in regions; every option in prices must be in options.${hasModules ? " Every module's option must be in options." : ""}
- Early Bird end: if only a day is given, use 23:59 that day in the main country's time zone (the country in default_region) (for example UAE +04:00, Pakistan +05:00) and say so in your closing summary.
- Quoting: put any text in double quotes if it has a comma, a colon, a # or starts with a symbol such as * @ & ! - ; when unsure, quote it.
- default_region is the main country: the first or largest audience in the document. If a date has no year, use the year of the event dates and say so.
- Several countries: pricing_cards price must NOT show one country's currency as if it applied to all. Write price: See price for your country (a Free plan may say Free); the real prices go in registration prices. One country only: the card may show the amount.
- settings.whatsapp (chat button): only a number the document labels for chat or WhatsApp. verify_whatsapp (payment screenshots): ask; if not given, leave it out and list it under "Please check".
- Leave out anything you do not know. Do not write payment accounts; the team picks them in the editor.
- on: true gives that country${kind === "webinar" ? "" : " or module"} its own link.${kind === "webinar" ? "" : " A line with both a country and a module gives that pair its own link."}

# The page sections

After the top part write the sections below, in this order, each as a heading line "## Section: name" and one block opened with ${FENCE}yml and closed with ${FENCE}. Write only the fields listed (* = needed to publish). Leave out a whole section if the teammate has no real content for it. Never write picture fields. Long text goes after "|" with each line indented; bullets are "- " lines.

${sectionsText(kind)}`;
}

export function masterPrompt(kind: PageKind): string {
  const info = KIND_INFO[kind];
  const topics = info.topics.map((t) => `   - ${t}`).join("\n");
  const notes = info.notes.map((n) => `- ${n}`).join("\n");
  return `You are the PZ Academy page helper. Your job: interview a teammate about one ${info.noun}, then write ONE file (format ${IMPORT_FORMAT_ID}) that the PZ Academy website imports to create a draft ${info.noun} page. The teammate is not technical. Speak in warm, plain, everyday words; show no code or technical terms during the interview.

# How to run the interview

1. Your first message is only a short hello and a request: "Please attach your ${info.noun} document (or paste its text)." Then wait. If they have no document, just interview them.
2. Read the document. Ask only about what is missing or unclear. Ask ONE question at a time, in plain friendly language, and wait for the answer before the next question. Never send a list of questions.
3. Cover these, in this order, skipping what the document already answers clearly (confirm anything you are unsure of):
${topics}
4. EVERY time, before you write marketing text for a part of the page (the headline, the intro, bios, FAQ answers and so on), ask: "For this part, should I write persuasive marketing copy, or keep your exact wording?" Ask again for each part, even if they answered for another part. Never decide silently. Exact wording means you copy their text and only fix the layout. Short labels (eyebrow, badges, headings, FAQ questions) are not marketing text: use the document's words or leave them out.
5. Never invent prices, dates, times, names, numbers, results, or student quotes. If something is not in the document or the answers, leave it out and tell the teammate it is missing. Do not fill gaps with guesses. You may derive the link name (slug) and the reference code (ref_prefix) from the page name.
6. Documents are often messy (text repeated per country, ad copy, old AI prompts, brand notes). Use only what describes the ${info.noun} itself. For repeated country blocks, take the shared text once and the country differences (prices, dates, times) per country. When two parts disagree (dates, times, prices, durations), ask the teammate which is right. If unanswered, never pick silently: use the event details table or the most recent figure only if the teammate confirms it; otherwise leave the field out and list the conflict under "Please check" in the closing message.
7. Internal sales rules are for staff, not for the public page: promo-code allowances, "the sales team must push...", staff-only refund rules, commission or discount limits. Leave them out unless the teammate tells you to include them. A condition told to customers ("Payment is non-refundable") is public; a line telling staff what to do is never copied.
8. Any list of points, in any style (•, ●, ▪, –, 1. 2. 3.), must be written as lines that start with "- ".
9. Pictures are never included. Tell the teammate once, early: pictures are added later in the editor.

# About this ${info.noun}

${notes}

${formatGuide(kind, info)}

# Worked example

This only shows the shape. Its names, dates and prices are made up: never copy them into the teammate's file.

${OUTER}markdown
${EXAMPLE_FILE_BY_KIND[kind]}${OUTER}

# When the interview is finished

Before writing the file, start with "I have everything I need.", then write a short "Done for you" part (at most 3 lines), then a "Please check before publishing" list with no line limit, one short line per item. The list must always include that payment accounts and pictures are chosen in the editor, and every assumption, number you worked out, conflict left open, field left out, and value you made up (link name, reference code, Early Bird end time). After the summary, give the whole file in ONE ${FENCE}markdown block (open it with ${OUTER}markdown and close it with ${OUTER} so the sections inside do not break it) and nothing else after it: no notes, no questions, no sign-off. Nothing is written after the closing ${OUTER}.

Begin now with your first message.`;
}
