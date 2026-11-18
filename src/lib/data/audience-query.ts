import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { buildMetaRows, type AudienceContact } from "@/lib/crm/meta-audience";
import { AUDIENCE_MAX_PEOPLE, type AudienceFilter } from "@/lib/crm/audience-filter";
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
  ignoredChoices: string[];
};

type Registration = {
  contactId: string;
  courseKey: string;
  mode: "live" | "recorded" | null;
  /** YYYY-MM-DD (UTC date part) or null when unknown. */
  date: string | null;
  paid: boolean;
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

function isMissingSchema(e: unknown): boolean {
  return e instanceof ReadError && e.missingSchema;
}

/**
 * Reads every registration. `withNew` selects the 0116 columns (recorded/live,
 * registration time); without them only course and purchase dates are known,
 * which is enough for the facets before the update is pasted.
 */
async function loadRegistrations(withNew: boolean): Promise<Registrations> {
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
      withNew
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
      mode: modeOf(p.reg_mode),
      date: datePart(p.purchased_at ?? p.created_at),
      paid: true,
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
      mode: modeOf(r.reg_mode),
      date: datePart(r.registered_at),
      paid: false,
    });
  }

  return { regs, courseNames, batches };
}

/** id -> country (upper case, or null) for every contact. Narrow, paged. */
async function loadCountries(): Promise<Map<string, string | null>> {
  const admin = createAdminSupabase();
  const rows = await pageAll<{ id: string; country: string | null }>("contacts", (from, to) =>
    admin.from("contacts").select("id, country").order("id", { ascending: true }).range(from, to),
  );
  return new Map(rows.map((r) => [r.id, r.country?.trim() ? r.country.trim().toUpperCase() : null]));
}

export async function resolveAudienceContactIds(
  f: AudienceFilter,
): Promise<{ ids: string[]; needsUpdate: boolean; ignoredChoices: string[] }> {
  let data: Registrations;
  try {
    data = await loadRegistrations(true);
  } catch (e) {
    if (isMissingSchema(e)) return { ids: [], needsUpdate: true, ignoredChoices: [] };
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
    if (f.who === "paid" && !r.paid) continue;
    if (f.who === "unpaid" && r.paid) continue;
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
    const countries = await loadCountries();
    ids = ids.filter((id) => {
      const c = countries.get(id) ?? null;
      return c === null ? wanted.has("unknown") : wanted.has(c);
    });
  }
  ids.sort();

  return { ids, needsUpdate: false, ignoredChoices };
}

export async function countAudience(f: AudienceFilter): Promise<AudienceCount> {
  const r = await resolveAudienceContactIds(f);
  const base = { tooLarge: false, needsUpdate: r.needsUpdate, ignoredChoices: r.ignoredChoices };
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
  ignoredChoices: string[];
  /** Courses were chosen and none of them exists any more: nothing is read. */
  allCoursesGone: boolean;
};

export async function loadAudienceFile(f: AudienceFilter): Promise<AudienceFile> {
  const r = await resolveAudienceContactIds(f);
  const ignoredChoices = r.ignoredChoices;
  const none = { contacts: [], tooLarge: false, needsUpdate: false, ignoredChoices, allCoursesGone: false };
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
  needsUpdate: boolean;
};

export async function audienceFacets(): Promise<AudienceFacets> {
  let needsUpdate = false;
  let data: Registrations;
  try {
    data = await loadRegistrations(true);
  } catch (e) {
    if (!isMissingSchema(e)) throw e;
    // Before 0116 is pasted the old columns still name every course.
    needsUpdate = true;
    data = await loadRegistrations(false);
  }

  const people = new Map<string, Set<string>>();
  const everyone = new Set<string>();
  for (const r of data.regs) {
    everyone.add(r.contactId);
    let set = people.get(r.courseKey);
    if (!set) people.set(r.courseKey, (set = new Set()));
    set.add(r.contactId);
  }
  const courses = Array.from(people, ([key, set]) => ({ name: data.courseNames.get(key) ?? key, count: set.size })).sort(
    (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );

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

  return { courses, countries, unknownCountry, landingPages, needsUpdate };
}
