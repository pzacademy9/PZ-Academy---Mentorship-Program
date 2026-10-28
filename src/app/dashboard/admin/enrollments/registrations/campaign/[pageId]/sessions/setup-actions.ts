"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { isoToPktInput } from "@/lib/attendance/rules";
import { createSession, deleteSession, updateSession } from "@/lib/data/attendance";
import {
  applyDefaultsToClasses,
  planClasses,
  type ClassDayInput,
  type ClassDefaults,
  type ClassOp,
  type ExistingClass,
} from "@/lib/classes/plan";
import {
  applyQuestionsToBatch,
  batchQuestionSet,
  createMissingFeedback,
  ensureClassFeedback,
  setBatchCover,
  type BatchFeedbackSetup,
} from "@/lib/data/batch-feedback";
import type { ActionResult } from "./actions";

type BatchType = "course" | "workshop" | "webinar";
type Question = BatchFeedbackSetup["questions"][number];

export type SetupClass = ExistingClass & {
  date: string;
  title: string;
  speaker: string;
  hasData: boolean;
  /** Only present when the class has its own time / link (HH:mm and zoom URL, PKT). */
  ownStart?: string;
  ownEnd?: string;
  ownZoom?: string;
};

export type SetupState = {
  title: string;
  defaults: ClassDefaults | null;
  coverUrl: string | null;
  classes: SetupClass[];
  questions: Question[];
  type: BatchType;
};

/** `type` is not here: the batch type is landing_pages.kind and setup never changes it. */
export type SetupForm = {
  days: ClassDayInput[];
  defaults: ClassDefaults;
  coverUrl: string | null;
  questions: Question[];
  confirmRemoveIds: string[];
};

const NOT_ALLOWED = "You do not have permission to do this.";
const SAVE_FAILED = "Something went wrong. Please try again.";
const NO_PAGE = "That batch was not found";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const isUrlOrEmpty = (v: string) => v.trim() === "" || /^https?:\/\/\S+$/i.test(v.trim());
const PAGE_SIZE = 1000;

function refresh(pageId: string) {
  revalidatePath(`/dashboard/admin/enrollments/registrations/campaign/${pageId}/sessions`);
}

const isBatchType = (v: unknown): v is BatchType => v === "course" || v === "workshop" || v === "webinar";
const hhmm = (v: string | null | undefined) => (v ?? "").slice(0, 5);

type PageRow = {
  title: string;
  kind: string;
  class_default_start: string | null;
  class_default_end: string | null;
  class_default_zoom: string;
  class_cover_url: string | null;
  feedback_program_id: string | null;
};

type ClassRow = {
  id: string;
  number: number;
  title: string;
  speaker: string;
  starts_at: string;
  ends_at: string | null;
  zoom_url: string;
  custom_time: boolean;
  custom_zoom: boolean;
  feedback_session_id: string | null;
};

async function readPage(pageId: string): Promise<PageRow | null> {
  const { data, error } = await createAdminSupabase()
    .from("landing_pages")
    .select("title, kind, class_default_start, class_default_end, class_default_zoom, class_cover_url, feedback_program_id")
    .eq("id", pageId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as PageRow | null) ?? null;
}

async function readClasses(pageId: string): Promise<ClassRow[]> {
  const { data, error } = await createAdminSupabase()
    .from("batch_sessions")
    .select("id, number, title, speaker, starts_at, ends_at, zoom_url, custom_time, custom_zoom, feedback_session_id")
    .eq("page_id", pageId)
    .order("number", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as ClassRow[];
}

const toExisting = (c: ClassRow): ExistingClass => ({
  id: c.id,
  number: c.number,
  startsAtIso: c.starts_at,
  endsAtIso: c.ends_at,
  zoom: c.zoom_url,
  customTime: c.custom_time,
  customZoom: c.custom_zoom,
});

type Page = PromiseLike<{ data: unknown; error: { message: string } | null }>;

/** Which of `ids` have at least one row; reads one kind of data for the whole batch, paging past the 1000-row cap. */
async function idsWithRows(ids: string[], column: string, build: (from: number, to: number) => Page): Promise<Set<string>> {
  const found = new Set<string>();
  if (ids.length === 0) return found;
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Record<string, string>[];
    for (const r of rows) found.add(r[column]);
    if (rows.length < PAGE_SIZE || ids.every((id) => found.has(id))) return found;
  }
}

/** Classes that hold attendance, quiz results or feedback responses: three queries for the whole batch. */
async function classesWithData(classes: ClassRow[]): Promise<Set<string>> {
  const admin = createAdminSupabase();
  const ids = classes.map((c) => c.id);
  const feedbackToClass = new Map<string, string>();
  for (const c of classes) if (c.feedback_session_id) feedbackToClass.set(c.feedback_session_id, c.id);
  const feedbackIds = Array.from(feedbackToClass.keys());

  const [marks, quizzes, responses] = await Promise.all([
    idsWithRows(ids, "session_id", (a, b) =>
      admin.from("batch_session_marks").select("session_id").in("session_id", ids).order("id", { ascending: true }).range(a, b),
    ),
    idsWithRows(ids, "session_id", (a, b) =>
      admin.from("batch_quiz_results").select("session_id").in("session_id", ids).order("id", { ascending: true }).range(a, b),
    ),
    idsWithRows(feedbackIds, "feedback_session_id", (a, b) =>
      admin.from("feedback_responses").select("feedback_session_id").in("feedback_session_id", feedbackIds).order("id", { ascending: true }).range(a, b),
    ),
  ]);

  const out = new Set<string>([...Array.from(marks), ...Array.from(quizzes)]);
  for (const fid of Array.from(responses)) {
    const id = feedbackToClass.get(fid);
    if (id) out.add(id);
  }
  return out;
}

export async function loadSetup(pageId: string): Promise<SetupState | null> {
  const auth = await requireAdmin();
  if (!auth.ok || !isUuid(pageId)) return null;
  const page = await readPage(pageId);
  if (!page) return null;
  const classes = await readClasses(pageId);
  const withData = await classesWithData(classes);

  const state: SetupClass[] = classes.map((c) => {
    const local = isoToPktInput(c.starts_at);
    const row: SetupClass = {
      ...toExisting(c),
      date: local.slice(0, 10),
      title: c.title ?? "",
      speaker: c.speaker ?? "",
      hasData: withData.has(c.id),
    };
    if (c.custom_time) {
      row.ownStart = local.slice(11, 16);
      if (c.ends_at) row.ownEnd = isoToPktInput(c.ends_at).slice(11, 16);
    }
    if (c.custom_zoom) row.ownZoom = c.zoom_url;
    return row;
  });
  state.sort((a, b) => a.date.localeCompare(b.date) || a.number - b.number);

  return {
    title: page.title,
    defaults:
      page.class_default_start && page.class_default_end
        ? { start: hhmm(page.class_default_start), end: hhmm(page.class_default_end), zoom: page.class_default_zoom ?? "" }
        : null,
    coverUrl: page.class_cover_url ?? null,
    classes: state,
    questions: await batchQuestionSet(pageId),
    type: isBatchType(page.kind) ? page.kind : "course",
  };
}

function checkDefaults(d: ClassDefaults): string | null {
  if (!d || !TIME.test(d.start) || !TIME.test(d.end)) return "Please enter a valid start and end time";
  if (d.end <= d.start) return "The end time must be after the start time";
  if (!isUrlOrEmpty(d.zoom ?? "")) return "The Zoom link must start with http:// or https://";
  return null;
}

async function storeDefaults(pageId: string, d: ClassDefaults): Promise<void> {
  const { error } = await createAdminSupabase()
    .from("landing_pages")
    .update({ class_default_start: d.start, class_default_end: d.end, class_default_zoom: d.zoom.trim() })
    .eq("id", pageId);
  if (error) throw new Error(error.message);
}

const dayLabel = (c: ClassRow) => `Day ${c.number}`;

function listWords(labels: string[]): string {
  if (labels.length <= 1) return labels.join("");
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

export async function saveSetup(pageId: string, form: SetupForm): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: NOT_ALLOWED };
  if (!isUuid(pageId)) return { ok: false, message: NO_PAGE };
  const bad = checkDefaults(form.defaults);
  if (bad) return { ok: false, message: bad };
  if (form.days.some((d) => !isUrlOrEmpty(d.zoom ?? ""))) {
    return { ok: false, message: "The Zoom link must start with http:// or https://" };
  }
  const defaults: ClassDefaults = { ...form.defaults, zoom: form.defaults.zoom.trim() };

  try {
    const page = await readPage(pageId);
    if (!page) return { ok: false, message: NO_PAGE };
    if (!isBatchType(page.kind)) return { ok: false, message: "This batch has no type yet. Set it on the batch first." };
    const type = page.kind;

    const classes = await readClasses(pageId);
    const existing = classes.map(toExisting);

    // A day sent without an id that matches an existing class's date is that class, so a retried save never duplicates.
    const claimed = new Set(form.days.flatMap((d) => (d.existingId ? [d.existingId] : [])));
    const byDate = new Map(classes.map((c) => [isoToPktInput(c.starts_at).slice(0, 10), c.id]));
    const days = form.days.map((d) => {
      if (d.existingId) return d;
      const id = byDate.get(d.date);
      if (!id || claimed.has(id)) return d;
      claimed.add(id);
      return { ...d, existingId: id };
    });

    const plan = planClasses(days, defaults, existing, type);
    if (!plan.ok) return { ok: false, message: plan.message };

    const removing = plan.ops.filter((o): o is Extract<ClassOp, { kind: "remove" }> => o.kind === "remove");
    if (removing.length > 0) {
      const withData = await classesWithData(classes.filter((c) => removing.some((r) => r.id === c.id)));
      const confirmed = new Set(form.confirmRemoveIds);
      const blocked = classes.filter((c) => withData.has(c.id) && !confirmed.has(c.id));
      if (blocked.length > 0) {
        const names = blocked.map(dayLabel);
        const them = names.length === 1 ? "it was" : "they were";
        return {
          ok: false,
          message: `${listWords(names)} ${names.length === 1 ? "has" : "have"} attendance, quiz results or feedback saved, so ${them} not removed. Tick ${names.length === 1 ? "it" : "them"} again or confirm removal.`,
        };
      }
    }

    // Removals first, then edits, then new classes.
    for (const op of plan.ops) {
      if (op.kind !== "remove") continue;
      const row = classes.find((c) => c.id === op.id);
      await deleteSession(op.id);
      if (row?.feedback_session_id) {
        // The class is gone; its feedback form goes with it (removal of data was confirmed above).
        const { error } = await createAdminSupabase().from("feedback_sessions").delete().eq("id", row.feedback_session_id);
        if (error) throw new Error(error.message);
      }
    }
    for (const op of plan.ops) {
      if (op.kind !== "update") continue;
      const res = await updateSession(op.id, {
        title: op.title,
        speaker: op.speaker,
        startsAt: op.startsAt,
        endsAt: op.endsAt,
        zoomUrl: op.zoom,
        customTime: op.customTime,
        customZoom: op.customZoom,
      });
      if (!res.ok) return { ok: false, message: res.message ?? SAVE_FAILED };
    }
    for (const op of plan.ops) {
      if (op.kind !== "create") continue;
      const res = await createSession(pageId, {
        number: op.number,
        title: op.title,
        speaker: op.speaker,
        startsAt: op.startsAt,
        endsAt: op.endsAt,
        zoomUrl: op.zoom,
        kahootUrl: "",
        includeKahoot: false,
        includeAttendanceLink: true,
        emailEnabled: true,
        emailLeadMinutes: 60,
        customTime: op.customTime,
        customZoom: op.customZoom,
      });
      if (!res.ok) return { ok: false, message: res.message };
    }

    await storeDefaults(pageId, defaults);

    const coverUrl = form.coverUrl && form.coverUrl.trim() !== "" ? form.coverUrl.trim() : null;
    const setup: BatchFeedbackSetup = { type, questions: form.questions, coverUrl };
    const before = await batchQuestionSet(pageId);
    for (const c of await readClasses(pageId)) {
      await ensureClassFeedback(pageId, c.id, setup, auth.user.id);
    }
    if (before.length > 0 && JSON.stringify(before) !== JSON.stringify(form.questions)) {
      await applyQuestionsToBatch(pageId, form.questions, auth.user.id);
    }
    await setBatchCover(pageId, coverUrl, auth.user.id);

    refresh(pageId);
    return { ok: true, message: "Classes saved" };
  } catch {
    return { ok: false, message: SAVE_FAILED };
  }
}

export async function saveDefaults(pageId: string, defaults: ClassDefaults): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: NOT_ALLOWED };
  if (!isUuid(pageId)) return { ok: false, message: NO_PAGE };
  const bad = checkDefaults(defaults);
  if (bad) return { ok: false, message: bad };
  const clean: ClassDefaults = { ...defaults, zoom: defaults.zoom.trim() };
  try {
    await storeDefaults(pageId, clean);
    const classes = await readClasses(pageId);
    for (const row of applyDefaultsToClasses(classes.map(toExisting), clean)) {
      const res = await updateSession(row.id, {
        ...(row.startsAt !== undefined ? { startsAt: row.startsAt } : {}),
        ...(row.endsAt !== undefined ? { endsAt: row.endsAt } : {}),
        ...(row.zoom !== undefined ? { zoomUrl: row.zoom } : {}),
      });
      if (!res.ok) return { ok: false, message: res.message ?? SAVE_FAILED };
    }
    refresh(pageId);
    return { ok: true, message: "Defaults saved" };
  } catch {
    return { ok: false, message: SAVE_FAILED };
  }
}

export async function createMissingFeedbackAction(pageId: string): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: NOT_ALLOWED };
  if (!isUuid(pageId)) return { ok: false, message: NO_PAGE };
  try {
    const { created } = await createMissingFeedback(pageId, auth.user.id);
    refresh(pageId);
    return {
      ok: true,
      message: created === 0 ? "Every class already has a feedback form" : `Created ${created} feedback ${created === 1 ? "form" : "forms"}`,
    };
  } catch {
    return { ok: false, message: SAVE_FAILED };
  }
}
