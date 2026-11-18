import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { buildMetaRows, type AudienceContact } from "@/lib/crm/meta-audience";
import { AUDIENCE_MAX_PEOPLE, type AudienceFilter, type AudienceStatus } from "@/lib/crm/audience-filter";
import { courseNameFromLabel } from "@/lib/crm/product-label";
import { chunk, loadAudienceContacts, mapPool, pageAll, READ_POOL, ReadError } from "@/lib/data/cohort-export";

/**
 * Audience engine for the Meta Audiences page.
 *
 * Every registration a person has (each purchase, and each "interested" row
 * of a person with no purchase at all) is read once with narrow columns and
 * filtered in memory. A person is in the audience when ONE registration of
 * theirs passes course, recorded/live, paid/unpaid and dates together;
 * country is checked on the person. Nothing here returns or throws an email
 * or a phone number except loadAudienceFile, which feeds the download.
 */

export type AudienceCount = {
  total: number;
  inFile: number;
  leftOut: { noContact: number; doNotContact: number };
  tooLarge: boolean;
  needsUpdate: boolean;
  /** 0117 is not pasted: every interested person counts as Pending. */
  statusNeedsUpdate: boolean;
  ignoredChoices: string[];
};

type Registration = {
  contactId: string;
  courseKey: string;
  mode: "live" | "recorded" | null;
  /** YYYY-MM-DD (UTC date part) or null when unknown. */
  date: string | null;
  status: AudienceStatus;
};

type Registrations = {
  regs: Registration[];
  /** course key (trimmed, lower case) -> first seen spelling */
  courseNames: Map<string, string>;
  batches: BatchRow[];
};

type PurchaseRow = {
  id: string;
  contact_id: string;
  import_batch_id: string | null;
  product_label: string | null;
  course_id: string | null;
  reg_mode?: string | null;
  purchased_at: string | null;
  created_at: string | null;
};
type InterestedRow = {
  import_batch_id: string;
  contact_id: string;
  reg_mode?: string | null;
  registered_at?: string | null;
  reg_status?: string | null;
};
type BatchRow = { id: string; sheet_id: string; sheet_name: string; course_id: string | null; kind: string };

const UNNAMED = "Unnamed";

export type CourseNameInput =
  | {
      kind: "purchase";
      courseTitle: string | null;
      productLabel: string | null;
      /** The purchase's import batch: its course title and sheet name. */
      batchCourseTitle?: string | null;
      batchSheetName?: string | null;
      /** The batch came from a landing page (sheet_id "landing:<page id>"). */
      batchIsLanding?: boolean;
    }
  | { kind: "interested"; courseTitle: string | null; sheetName: string | null };

const sheetCourse = (sheetName: string | null | undefined) =>
  (sheetName ?? "").replace(/\s*\((?:interested|paid)\)\s*$/i, "").trim();

/**
 * The one course-name rule shared by the filter and the facets.
 * Purchase: course title, else the label's course part, else the import
 * batch's course title, else the batch's sheet name, else "Unnamed".
 * Interested: the batch's course title, else its sheet name.
 * A landing-page batch with no linked course is named after its page title
 * (the sheet name without " (paid)"), the same name its interested people get.
 */
export function courseNameOf(input: CourseNameInput): string {
  const title = input.courseTitle?.trim();
  if (title) return title;
  if (input.kind === "purchase") {
    const batchTitle = input.batchCourseTitle?.trim();
    if (input.batchIsLanding && !batchTitle) {
      const page = sheetCourse(input.batchSheetName);
      if (page) return page;
    }
    return (
      courseNameFromLabel(input.productLabel) ||
      input.batchCourseTitle?.trim() ||
      sheetCourse(input.batchSheetName) ||
      UNNAMED
    );
  }
  return sheetCourse(input.sheetName) || UNNAMED;
}

const courseKey = (name: string) => name.trim().toLowerCase();

function datePart(ts: string | null | undefined): string | null {
  if (!ts) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(ts);
  return m ? m[1] : null;
}

function modeOf(v: string | null | undefined): "live" | "recorded" | null {
  return v === "live" || v === "recorded" ? v : null;
}

/** "Live" or "Recorded" written in free text; both or neither gives null. */
export function modeFromLabel(text: string | null | undefined): "live" | "recorded" | null {
  if (!text) return null;
  const live = /\blive\b/i.test(text);
  const recorded = /\brecorded\b/i.test(text);
  if (live === recorded) return null;
  return live ? "live" : "recorded";
}

/** Landing registration status text -> audience status; unknown or blank is Pending. */
function statusOf(v: string | null | undefined): AudienceStatus {
  switch (v?.trim().toLowerCase()) {
    case "paid": return "paid";
    case "reserved": return "reserved";
    case "underpaid": return "part_paid";
    case "free": return "free";
    default: return "pending";
  }
}

function isMissingSchema(e: unknown): boolean {
  return e instanceof ReadError && e.missingSchema;
}

/**
 * Reads every registration. `withNew` selects the 0116 columns (recorded/live,
 * registration time); without them only course and purchase dates are known,
 * which is enough for the facets before the update is pasted. `withStatus`
 * also selects the 0117 reg_status column of the interested rows.
 */
async function loadRegistrations(withNew: boolean, withStatus = false): Promise<Registrations> {
  const admin = createAdminSupabase();

  const courses = await pageAll<{ id: string; title: string }>("courses", (from, to) =>
    admin.from("courses").select("id, title").order("id", { ascending: true }).range(from, to),
  );
  const courseTitle = new Map(courses.map((c) => [c.id, c.title]));

  const purchases = await pageAll<PurchaseRow>("contact_purchases", (from, to) =>
    withNew
      ? admin
          .from("contact_purchases")
          .select("id, contact_id, import_batch_id, product_label, course_id, reg_mode, purchased_at, created_at")
          .order("id", { ascending: true })
          .range(from, to)
      : admin
          .from("contact_purchases")
          .select("id, contact_id, import_batch_id, product_label, course_id, purchased_at, created_at")
          .order("id", { ascending: true })
          .range(from, to),
  );

  const batches = await pageAll<BatchRow>("import_batches", (from, to) =>
    admin
      .from("import_batches")
      .select("id, sheet_id, sheet_name, course_id, kind")
      .order("id", { ascending: true })
      .range(from, to),
  );
  const batchById = new Map(batches.map((b) => [b.id, b]));
  const interestedBatches = new Map(batches.filter((b) => b.kind === "closed_interested").map((b) => [b.id, b]));

  const interestedParts = await mapPool(chunk(Array.from(interestedBatches.keys())), READ_POOL, (part) =>
    pageAll<InterestedRow>("import_batch_contacts", (from, to) =>
      withNew && withStatus
        ? admin
            .from("import_batch_contacts")
            .select("import_batch_id, contact_id, reg_mode, registered_at, reg_status")
            .in("import_batch_id", part)
            .order("import_batch_id", { ascending: true })
            .order("contact_id", { ascending: true })
            .range(from, to)
        : withNew
        ? admin
            .from("import_batch_contacts")
            .select("import_batch_id, contact_id, reg_mode, registered_at")
            .in("import_batch_id", part)
            .order("import_batch_id", { ascending: true })
            .order("contact_id", { ascending: true })
            .range(from, to)
        : admin
            .from("import_batch_contacts")
            .select("import_batch_id, contact_id")
            .in("import_batch_id", part)
            .order("import_batch_id", { ascending: true })
            .order("contact_id", { ascending: true })
            .range(from, to),
    ),
  );
  const interestedRows: InterestedRow[] = interestedParts.flat();

  const courseNames = new Map<string, string>();
  const named = (name: string) => {
    const key = courseKey(name);
    if (!courseNames.has(key)) courseNames.set(key, name.trim());
    return key;
  };

  const regs: Registration[] = [];
  const buyers = new Set<string>();
  for (const p of purchases) {
    buyers.add(p.contact_id);
    const b = p.import_batch_id ? batchById.get(p.import_batch_id) : undefined;
    const name = courseNameOf({
      kind: "purchase",
      courseTitle: p.course_id ? courseTitle.get(p.course_id) ?? null : null,
      productLabel: p.product_label,
      batchCourseTitle: b?.course_id ? courseTitle.get(b.course_id) ?? null : null,
      batchSheetName: b?.sheet_name ?? null,
      batchIsLanding: !!b?.sheet_id?.startsWith("landing:"),
    });
    regs.push({
      contactId: p.contact_id,
      courseKey: named(name),
      mode: modeOf(p.reg_mode) ?? modeFromLabel(p.product_label),
      date: datePart(p.purchased_at ?? p.created_at),
      status: "paid",
    });
  }

  // "Registered, not paid" = no purchase at all, in any course.
  for (const r of interestedRows) {
    if (buyers.has(r.contact_id)) continue;
    const b = interestedBatches.get(r.import_batch_id);
    const name = courseNameOf({
      kind: "interested",
      courseTitle: b?.course_id ? courseTitle.get(b.course_id) ?? null : null,
      sheetName: b?.sheet_name ?? null,
    });
    regs.push({
      contactId: r.contact_id,
      courseKey: named(name),
      mode: modeOf(r.reg_mode) ?? modeFromLabel(b?.sheet_name),
      date: datePart(r.registered_at),
      status: statusOf(r.reg_status),
    });
  }

  return { regs, courseNames, batches };
}

/**
 * Short in-memory cache (per server instance) of the two reads every filter
 * change shares: the registrations and the contact country map. Only a fully
 * successful read is kept; an error, a missing-schema result and the
 * "0117 not pasted" fallback are never kept, so pasting a migration works at
 * once. Contact details (consent, email) are never cached. Callers must treat
 * cached values as read-only. Downloads pass `fresh` and skip the cache.
 */
export const AUDIENCE_CACHE_MS = 60_000;

type Cached<T> = { at: number; value: T };
type Pending<T> = { gen: number; promise: Promise<T> };
type RegResult = { data: Registrations; statusNeedsUpdate: boolean };
let clock: () => number = () => Date.now();
/** Bumped by every clear: a read that began under an older value never stores its result. */
let generation = 0;
let regCache: Cached<RegResult> | null = null;
let countryCache: Cached<Map<string, string | null>> | null = null;
let regPending: Pending<RegResult> | null = null;
let countryPending: Pending<Map<string, string | null>> | null = null;

/** Tests only: replace the clock; null restores the real one. */
export function setAudienceClock(fn: (() => number) | null): void {
  clock = fn ?? (() => Date.now());
}

export function clearAudienceCache(): void {
  generation++;
  regCache = null;
  countryCache = null;
  regPending = null;
  countryPending = null;
}

const isLive = (c: Cached<unknown> | null): boolean => !!c && clock() - c.at >= 0 && clock() - c.at < AUDIENCE_CACHE_MS;

/** Full read first; if only 0117 is missing, retry without reg_status. `cacheable` is false for that fallback. */
async function readRegistrationsTiered(): Promise<{ value: RegResult; cacheable: boolean }> {
  try {
    const data = await loadRegistrations(true, true);
    data.regs.forEach((r) => Object.freeze(r));
    const value = Object.freeze({
      data: Object.freeze({ ...data, regs: Object.freeze(data.regs) as Registration[] }),
      statusNeedsUpdate: false,
    });
    return { value, cacheable: true };
  } catch (e) {
    if (!isMissingSchema(e)) throw e;
  }
  return { value: { data: await loadRegistrations(true, false), statusNeedsUpdate: true }, cacheable: false };
}

/**
 * Cached read. Concurrent callers on a cold cache share one in-flight read; a
 * rejected read is dropped so the next call retries. A download (`fresh`)
 * neither joins nor feeds the cache.
 */
function cachedRead<T>(
  fresh: boolean,
  get: () => Cached<T> | null,
  set: (c: Cached<T> | null) => void,
  getPending: () => Pending<T> | null,
  setPending: (p: Pending<T> | null) => void,
  read: () => Promise<{ value: T; cacheable: boolean }>,
): Promise<T> {
  if (fresh) return read().then((r) => r.value);
  const hit = get();
  if (hit && isLive(hit)) return Promise.resolve(hit.value);
  const joined = getPending();
  if (joined && joined.gen === generation) return joined.promise;
  const startedUnder = generation;
  const promise = read().then((r) => {
    if (startedUnder === generation && r.cacheable) set({ at: clock(), value: r.value });
    return r.value;
  });
  const entry: Pending<T> = { gen: startedUnder, promise };
  setPending(entry);
  const done = () => {
    if (getPending() === entry) setPending(null);
  };
  promise.then(done, done);
  return promise;
}

function loadRegistrationsTiered(fresh = false): Promise<RegResult> {
  return cachedRead(fresh, () => regCache, (c) => (regCache = c), () => regPending, (p) => (regPending = p), readRegistrationsTiered);
}

/** id -> country (upper case, or null) for every contact. Narrow, paged. */
function loadCountries(fresh = false): Promise<Map<string, string | null>> {
  return cachedRead(
    fresh,
    () => countryCache,
    (c) => (countryCache = c),
    () => countryPending,
    (p) => (countryPending = p),
    async () => {
      const admin = createAdminSupabase();
      const rows = await pageAll<{ id: string; country: string | null }>("contacts", (from, to) =>
        admin.from("contacts").select("id, country").order("id", { ascending: true }).range(from, to),
      );
      const value = new Map(rows.map((r): [string, string | null] => [r.id, r.country?.trim() ? r.country.trim().toUpperCase() : null]));
      return { value, cacheable: true };
    },
  );
}

export async function resolveAudienceContactIds(
  f: AudienceFilter,
  opts: { fresh?: boolean } = {},
): Promise<{ ids: string[]; needsUpdate: boolean; statusNeedsUpdate: boolean; ignoredChoices: string[] }> {
  let data: Registrations;
  let statusNeedsUpdate: boolean;
  try {
    ({ data, statusNeedsUpdate } = await loadRegistrationsTiered(opts.fresh));
  } catch (e) {
    if (isMissingSchema(e)) return { ids: [], needsUpdate: true, statusNeedsUpdate: false, ignoredChoices: [] };
    throw e;
  }

  // A chosen course that no registration has (deleted, renamed) is reported
  // and dropped, so it never shrinks the audience to nobody on its own.
  const ignoredChoices: string[] = [];
  const chosen = new Set<string>();
  for (const c of f.courses) {
    const key = courseKey(c);
    if (data.courseNames.has(key)) chosen.add(key);
    else ignoredChoices.push(c);
  }

  const dated = !!(f.from || f.to);
  const matched = new Set<string>();
  for (const r of data.regs) {
    if (matched.has(r.contactId)) continue;
    if (f.statuses.length > 0 && !f.statuses.includes(r.status)) continue;
    if (chosen.size > 0 && !chosen.has(r.courseKey)) continue;
    if (f.mode !== "either" && r.mode !== f.mode) continue;
    if (dated) {
      if (!r.date) continue;
      if (f.from && r.date < f.from) continue;
      if (f.to && r.date > f.to) continue;
    }
    matched.add(r.contactId);
  }

  let ids = Array.from(matched);
  if (f.countries.length > 0) {
    const wanted = new Set(f.countries);
    const countries = await loadCountries(opts.fresh);
    ids = ids.filter((id) => {
      const c = countries.get(id) ?? null;
      return c === null ? wanted.has("unknown") : wanted.has(c);
    });
  }
  ids.sort();

  return { ids, needsUpdate: false, statusNeedsUpdate, ignoredChoices };
}

export async function countAudience(f: AudienceFilter): Promise<AudienceCount> {
  const r = await resolveAudienceContactIds(f);
  const base = { tooLarge: false, needsUpdate: r.needsUpdate, statusNeedsUpdate: r.statusNeedsUpdate, ignoredChoices: r.ignoredChoices };
  const none = { noContact: 0, doNotContact: 0 };
  if (r.needsUpdate) return { ...base, total: 0, inFile: 0, leftOut: none };
  // Over the limit nobody's details are read: the page only says it is too many.
  if (r.ids.length > AUDIENCE_MAX_PEOPLE) {
    return { ...base, tooLarge: true, total: r.ids.length, inFile: 0, leftOut: none };
  }

  const contacts = await loadAudienceContacts(r.ids);
  const { rows, leftOut } = buildMetaRows(contacts);
  // A person counts once: two contact records sharing an email or phone are
  // one line in the file, so total is built from what the file would hold.
  const total = rows.length + leftOut.noContact + leftOut.doNotContact;
  return {
    ...base,
    total,
    inFile: total - leftOut.noContact - leftOut.doNotContact,
    leftOut: { noContact: leftOut.noContact, doNotContact: leftOut.doNotContact },
  };
}

export type AudienceFile = {
  contacts: AudienceContact[];
  tooLarge: boolean;
  needsUpdate: boolean;
  statusNeedsUpdate: boolean;
  ignoredChoices: string[];
  /** Courses were chosen and none of them exists any more: nothing is read. */
  allCoursesGone: boolean;
};

export async function loadAudienceFile(f: AudienceFilter): Promise<AudienceFile> {
  // A download always reads fresh: a file never uses cached data.
  const r = await resolveAudienceContactIds(f, { fresh: true });
  const ignoredChoices = r.ignoredChoices;
  const none = { contacts: [], tooLarge: false, needsUpdate: false, statusNeedsUpdate: r.statusNeedsUpdate, ignoredChoices, allCoursesGone: false };
  if (r.needsUpdate) return { ...none, needsUpdate: true };
  const ignoredKeys = new Set(ignoredChoices.map(courseKey));
  const allCoursesGone = f.courses.length > 0 && f.courses.every((c) => ignoredKeys.has(courseKey(c)));
  // A download never widens to everyone because the chosen courses are gone.
  if (allCoursesGone) return { ...none, allCoursesGone: true };
  if (r.ids.length > AUDIENCE_MAX_PEOPLE) return { ...none, tooLarge: true };
  return { ...none, contacts: await loadAudienceContacts(r.ids) };
}

export type AudienceFacets = {
  courses: { name: string; count: number }[];
  countries: { code: string; count: number }[];
  unknownCountry: number;
  landingPages: { id: string; title: string; registrations: number; alreadyBrought: boolean }[];
  /** People (distinct contacts) per status, ignoring every other filter. */
  statusCounts: Partial<Record<AudienceStatus, number>>;
  needsUpdate: boolean;
  statusNeedsUpdate: boolean;
};

export async function audienceFacets(): Promise<AudienceFacets> {
  let needsUpdate = false;
  let statusNeedsUpdate = false;
  let data: Registrations;
  try {
    ({ data, statusNeedsUpdate } = await loadRegistrationsTiered());
  } catch (e) {
    if (!isMissingSchema(e)) throw e;
    // Before 0116 is pasted the old columns still name every course.
    needsUpdate = true;
    data = await loadRegistrations(false);
  }

  const people = new Map<string, Set<string>>();
  const everyone = new Set<string>();
  const byStatus = new Map<AudienceStatus, Set<string>>();
  for (const r of data.regs) {
    everyone.add(r.contactId);
    let st = byStatus.get(r.status);
    if (!st) byStatus.set(r.status, (st = new Set()));
    st.add(r.contactId);
    let set = people.get(r.courseKey);
    if (!set) people.set(r.courseKey, (set = new Set()));
    set.add(r.contactId);
  }
  const courses = Array.from(people, ([key, set]) => ({ name: data.courseNames.get(key) ?? key, count: set.size })).sort(
    (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );

  const statusCounts: Partial<Record<AudienceStatus, number>> = {};
  for (const [k, set] of Array.from(byStatus)) statusCounts[k] = set.size;

  const countryOf = await loadCountries();
  const byCountry = new Map<string, number>();
  let unknownCountry = 0;
  for (const id of Array.from(everyone)) {
    if (!countryOf.has(id)) continue;
    const c = countryOf.get(id) ?? null;
    if (c === null) unknownCountry++;
    // Only two-letter codes become chips; the filter rejects anything else.
    else if (/^[A-Z]{2}$/.test(c)) byCountry.set(c, (byCountry.get(c) ?? 0) + 1);
  }
  const countries = Array.from(byCountry, ([code, count]) => ({ code, count })).sort((a, b) =>
    a.code.localeCompare(b.code),
  );

  const admin = createAdminSupabase();
  const pages = await pageAll<{ id: string; title: string; created_at: string }>("landing_pages", (from, to) =>
    admin
      .from("landing_pages")
      .select("id, title, created_at")
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to),
  );
  const regRows = await pageAll<{ id: string; page_id: string }>("landing_registrations", (from, to) =>
    admin
      .from("landing_registrations")
      .select("id, page_id")
      .eq("is_test", false)
      .order("id", { ascending: true })
      .range(from, to),
  );
  const regCount = new Map<string, number>();
  for (const r of regRows) regCount.set(r.page_id, (regCount.get(r.page_id) ?? 0) + 1);
  const brought = new Set(data.batches.filter((b) => b.kind === "closed_paid").map((b) => b.sheet_id));

  const landingPages = pages.map((p) => ({
    id: p.id,
    title: p.title,
    registrations: regCount.get(p.id) ?? 0,
    alreadyBrought: brought.has(`landing:${p.id}`),
  }));

  return { courses, countries, unknownCountry, landingPages, statusCounts, needsUpdate, statusNeedsUpdate };
}
