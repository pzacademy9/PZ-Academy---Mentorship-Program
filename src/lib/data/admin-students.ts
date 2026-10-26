import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { resolveEmails } from "@/lib/data/admin-enrollments";
import { CertSourceError, getAllCerts } from "@/lib/certs/cert-source";
import { isIssuedForStudent, normEmail, type CertRecord } from "@/lib/certs/cert-model";
import {
  averageRating,
  countFinishedCourses,
  needsAttention,
  progressPercent,
  sessionsAttended,
  type AttentionItem,
} from "@/lib/students/student-metrics";

// Error policy: any failed query throws a plain Error (never a truncated or wrong list).
// The page's error boundary shows it. Only the certificate source degrades gracefully.

const PAGE = 1000;
const CHUNK = 200;
const PAGE_SIZE = 25;
const LOAD_ERROR = "Could not load students. Please try again.";
const RECORD_ERROR = "Could not load this student. Please try again.";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type StudentFilter = "all" | "active" | "payment-pending" | "finished";
export type CertChip = "issued" | "pending" | "none" | "unknown";

export type StudentListRow = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  joinedAt: string;
  courses: { title: string; status: string }[];
  progress: number;
  attended: string;
  certificate: CertChip;
};

export type StudentTiles = {
  courses: number;
  progress: number;
  attended: string;
  averageFeedback: number | null;
  certificate: CertChip;
};

export type StudentEnrollmentRow = {
  id: string;
  courseId: string;
  courseTitle: string;
  status: string;
  enrolledAt: string;
  paymentAmountPkr: number | null;
};
export type StudentProgressRow = {
  courseId: string;
  courseTitle: string;
  totalLessons: number;
  completedLessons: number;
  percent: number;
};
export type StudentAttendanceRow = {
  id: string;
  courseTitle: string;
  sessionDate: string;
  markedAt: string;
};
export type StudentFeedbackRow = {
  id: string;
  submittedAt: string;
  comments: string;
  rating: number | null;
};
export type StudentMentorshipRow = {
  id: string;
  mentorName: string;
  packageName: string;
  status: string;
  sessionsTotal: number | null;
  createdAt: string;
};
export type StudentActivityItem = { at: string; text: string };

export type StudentRecordData = {
  profile: {
    id: string;
    fullName: string;
    email: string | null;
    phone: string | null;
    joinedAt: string;
    city?: string;
    profession?: string;
  };
  tiles: StudentTiles;
  enrollments: StudentEnrollmentRow[];
  progressByCourse: StudentProgressRow[];
  attendance: StudentAttendanceRow[];
  feedback: StudentFeedbackRow[];
  mentorship: StudentMentorshipRow[];
  certs:
    | { state: "ok"; certs: CertRecord[]; pendingCount: number }
    | { state: "unavailable" }
    | { state: "no-email" };
  recentActivity: StudentActivityItem[];
  attention: AttentionItem[];
};

// ---------- query helpers ----------

type Admin = ReturnType<typeof createAdminSupabase>;
type Page<T> = PromiseLike<{ data: T[] | null; error: unknown }>;

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/** Reads every page; throws on any error so a truncated 1000-row read can never pass as complete. */
async function fetchAll<T>(build: (from: number, to: number) => Page<T>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error || !data) throw new Error(LOAD_ERROR);
    out.push(...data);
    if (data.length < PAGE) return out;
  }
}

type EnrollRaw = {
  id: string;
  student_id: string;
  course_id: string;
  status: string;
  enrolled_at: string;
  payment_amount_pkr?: number | null;
};

async function fetchEnrollments(admin: Admin, studentIds?: string[]): Promise<EnrollRaw[]> {
  const cols = "id, student_id, course_id, status, enrolled_at, payment_amount_pkr";
  if (!studentIds) {
    return fetchAll<EnrollRaw>((from, to) => admin.from("enrollments").select(cols).order("id").range(from, to));
  }
  const out: EnrollRaw[] = [];
  for (const ids of chunk(studentIds, CHUNK)) {
    out.push(
      ...(await fetchAll<EnrollRaw>((from, to) =>
        admin.from("enrollments").select(cols).in("student_id", ids).order("id").range(from, to),
      )),
    );
  }
  return out;
}

async function fetchCourseTitles(admin: Admin, courseIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const ids of chunk(Array.from(new Set(courseIds)), CHUNK)) {
    const rows = await fetchAll<{ id: string; title: string }>((from, to) =>
      admin.from("courses").select("id, title").in("id", ids).order("id").range(from, to),
    );
    for (const r of rows) map.set(r.id, r.title);
  }
  return map;
}

type Progress = {
  total: number;
  completed: number;
  finished: number;
  byCourse: StudentProgressRow[];
};

/** Lesson metrics for the given students, from their ACTIVE enrollments only. Set-based. */
async function loadProgress(
  admin: Admin,
  studentIds: string[],
  enrollments: EnrollRaw[],
  titles: Map<string, string>,
): Promise<Map<string, Progress>> {
  const wanted = new Set(studentIds);
  const active = enrollments.filter((e) => e.status === "active" && wanted.has(e.student_id));
  const courseIds = Array.from(new Set(active.map((e) => e.course_id)));

  const lessonsByCourse = new Map<string, string[]>(courseIds.map((id) => [id, []]));
  if (courseIds.length > 0) {
    const moduleCourse = new Map<string, string>();
    for (const ids of chunk(courseIds, CHUNK)) {
      const modules = await fetchAll<{ id: string; course_id: string }>((from, to) =>
        admin.from("modules").select("id, course_id").in("course_id", ids).order("id").range(from, to),
      );
      for (const m of modules) moduleCourse.set(m.id, m.course_id);
    }
    for (const ids of chunk(Array.from(moduleCourse.keys()), CHUNK)) {
      const lessons = await fetchAll<{ id: string; module_id: string }>((from, to) =>
        admin.from("lessons").select("id, module_id").in("module_id", ids).order("id").range(from, to),
      );
      for (const l of lessons) {
        const cid = moduleCourse.get(l.module_id);
        if (cid) lessonsByCourse.get(cid)?.push(l.id);
      }
    }
  }

  const doneByStudent = new Map<string, Set<string>>();
  for (const ids of chunk(studentIds, CHUNK)) {
    const rows = await fetchAll<{ id: string; student_id: string; lesson_id: string }>((from, to) =>
      admin
        .from("lesson_progress")
        .select("id, student_id, lesson_id")
        .in("student_id", ids)
        .eq("status", "completed")
        .order("id")
        .range(from, to),
    );
    for (const r of rows) {
      const set = doneByStudent.get(r.student_id) ?? new Set<string>();
      set.add(r.lesson_id);
      doneByStudent.set(r.student_id, set);
    }
  }

  const out = new Map<string, Progress>();
  for (const sid of studentIds) {
    const done = doneByStudent.get(sid) ?? new Set<string>();
    const courses = Array.from(new Set(active.filter((e) => e.student_id === sid).map((e) => e.course_id)));
    const byCourse: StudentProgressRow[] = courses.map((courseId) => {
      const lessonIds = lessonsByCourse.get(courseId) ?? [];
      const completedLessons = lessonIds.filter((id) => done.has(id)).length;
      return {
        courseId,
        courseTitle: titles.get(courseId) ?? "Course",
        totalLessons: lessonIds.length,
        completedLessons,
        percent: progressPercent(lessonIds.length, completedLessons),
      };
    });
    out.set(sid, {
      total: byCourse.reduce((s, c) => s + c.totalLessons, 0),
      completed: byCourse.reduce((s, c) => s + c.completedLessons, 0),
      finished: countFinishedCourses(
        courses.map((courseId) => ({ courseId, lessonIds: lessonsByCourse.get(courseId) ?? [] })),
        done,
      ),
      byCourse,
    });
  }
  return out;
}

type AttendRaw = { id: string; student_id: string; course_id: string; session_date: string; marked_at: string };

async function fetchAttendance(admin: Admin, studentIds: string[]): Promise<AttendRaw[]> {
  const out: AttendRaw[] = [];
  for (const ids of chunk(studentIds, CHUNK)) {
    out.push(
      ...(await fetchAll<AttendRaw>((from, to) =>
        admin
          .from("attendance")
          .select("id, student_id, course_id, session_date, marked_at")
          .in("student_id", ids)
          .order("id")
          .range(from, to),
      )),
    );
  }
  return out;
}

/** Distinct (course, date) sessions held, across all students, per course. */
async function fetchHeld(admin: Admin, courseIds: string[]): Promise<Map<string, Set<string>>> {
  const held = new Map<string, Set<string>>();
  for (const ids of chunk(Array.from(new Set(courseIds)), CHUNK)) {
    const rows = await fetchAll<{ id: string; course_id: string; session_date: string }>((from, to) =>
      admin
        .from("attendance")
        .select("id, course_id, session_date")
        .in("course_id", ids)
        .order("id")
        .range(from, to),
    );
    for (const r of rows) {
      const s = held.get(r.course_id) ?? new Set<string>();
      s.add(r.session_date);
      held.set(r.course_id, s);
    }
  }
  return held;
}

function heldCount(held: Map<string, Set<string>>, courseIds: string[]): number {
  let n = 0;
  for (const id of Array.from(new Set(courseIds))) n += held.get(id)?.size ?? 0;
  return n;
}

// ---------- certificates ----------

type CertIndex = Map<string, CertRecord[]> | null;

async function loadCertIndex(): Promise<CertIndex> {
  try {
    const all = await getAllCerts();
    const idx = new Map<string, CertRecord[]>();
    for (const c of all) {
      const key = normEmail(c.email);
      if (!key) continue;
      const list = idx.get(key) ?? [];
      list.push(c);
      idx.set(key, list);
    }
    return idx;
  } catch (e) {
    if (e instanceof CertSourceError) return null;
    throw e;
  }
}

function certInfo(certs: CertRecord[], finished: number) {
  const issued = certs.filter(isIssuedForStudent);
  const issuedGeneral = issued.filter((c) => c.category === "General").length;
  // Only General certificates answer for finished courses; Official ones never count here.
  const chip: CertChip = finished > issuedGeneral ? "pending" : issuedGeneral > 0 ? "issued" : "none";
  return { issued, issuedGeneral, chip, pendingCount: Math.max(0, finished - issuedGeneral) };
}

// ---------- list ----------

export async function listStudents(q: {
  search?: string;
  filter?: StudentFilter;
  page?: number;
}): Promise<{ rows: StudentListRow[]; total: number; page: number; pageCount: number }> {
  try {
    return await loadStudents(q);
  } catch {
    // Any failure (query or strict email lookup) is the same plain message; never a wrong list.
    throw new Error(LOAD_ERROR);
  }
}

async function loadStudents(q: {
  search?: string;
  filter?: StudentFilter;
  page?: number;
}): Promise<{ rows: StudentListRow[]; total: number; page: number; pageCount: number }> {
  const admin = createAdminSupabase();
  const filter = q.filter ?? "all";

  const [profiles, enrollments] = await Promise.all([
    fetchAll<{ id: string; full_name: string; phone: string | null; role: string; created_at: string }>(
      (from, to) =>
        admin.from("profiles").select("id, full_name, phone, role, created_at").order("id").range(from, to),
    ),
    fetchEnrollments(admin),
  ]);

  const enrolledIds = new Set(enrollments.map((e) => e.student_id));
  const candidates = profiles
    .filter((p) => p.role === "student" || enrolledIds.has(p.id))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));

  const emails = await resolveEmails(candidates.map((p) => p.id), { strict: true });
  const enrollByStudent = new Map<string, EnrollRaw[]>();
  for (const e of enrollments) {
    const list = enrollByStudent.get(e.student_id) ?? [];
    list.push(e);
    enrollByStudent.set(e.student_id, list);
  }

  const needle = (q.search ?? "").trim().toLowerCase();
  let matched = candidates.filter((p) => {
    if (!needle) return true;
    const hay = `${p.full_name}\n${emails.get(p.id) ?? ""}\n${p.phone ?? ""}`.toLowerCase();
    return hay.includes(needle);
  });

  if (filter === "active") {
    matched = matched.filter((p) => (enrollByStudent.get(p.id) ?? []).some((e) => e.status === "active"));
  } else if (filter === "payment-pending") {
    matched = matched.filter((p) => (enrollByStudent.get(p.id) ?? []).some((e) => e.status === "pending" || e.status === "reserved"));
  }

  let progress = new Map<string, Progress>();
  if (filter === "finished") {
    // The finished filter needs lesson metrics for every remaining candidate.
    progress = await loadProgress(admin, matched.map((p) => p.id), enrollments, new Map());
    matched = matched.filter((p) => (progress.get(p.id)?.finished ?? 0) >= 1);
  }

  const total = matched.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const wanted = Number.isFinite(q.page) ? Math.floor(q.page as number) : 1;
  const page = Math.min(Math.max(1, wanted), pageCount);
  const visible = matched.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const ids = visible.map((p) => p.id);

  if (filter !== "finished") {
    progress = await loadProgress(admin, ids, enrollments, new Map());
  }
  const visibleEnrollments = ids.flatMap((id) => enrollByStudent.get(id) ?? []);
  const titles = await fetchCourseTitles(admin, visibleEnrollments.map((e) => e.course_id));
  const attendance = await fetchAttendance(admin, ids);
  // One course set for both numbers: every course the student has an enrollment row for.
  const held = await fetchHeld(admin, visibleEnrollments.map((e) => e.course_id));
  const certIndex = await loadCertIndex();

  const rows: StudentListRow[] = visible.map((p) => {
    const mine = enrollByStudent.get(p.id) ?? [];
    const prog = progress.get(p.id);
    const email = emails.get(p.id) ?? null;
    const myCourses = mine.map((e) => e.course_id);
    const mySet = new Set(myCourses);
    const attended = attendance.filter((a) => a.student_id === p.id && mySet.has(a.course_id)).length;
    const finished = prog?.finished ?? 0;
    return {
      id: p.id,
      fullName: p.full_name,
      email,
      phone: p.phone,
      joinedAt: p.created_at,
      courses: mine.map((e) => ({ title: titles.get(e.course_id) ?? "Course", status: e.status })),
      progress: progressPercent(prog?.total ?? 0, prog?.completed ?? 0),
      attended: sessionsAttended(attended, heldCount(held, myCourses)).label,
      certificate: certIndex && email
        ? certInfo(certIndex.get(normEmail(email)) ?? [], finished).chip
        : "unknown",
    };
  });

  return { rows, total, page, pageCount };
}

// ---------- record ----------

function fmtDate(s: string): string {
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return s;
  return new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export async function getStudentRecord(id: string): Promise<StudentRecordData | null> {
  if (!UUID_RE.test(id)) return null;
  try {
    return await loadRecord(id);
  } catch {
    throw new Error(RECORD_ERROR);
  }
}

async function loadRecord(id: string): Promise<StudentRecordData | null> {
  const admin = createAdminSupabase();

  const profiles = await fetchAll<{
    id: string;
    full_name: string;
    phone: string | null;
    role: string;
    created_at: string;
    city: string | null;
    profession: string | null;
  }>((from, to) =>
    admin
      .from("profiles")
      .select("id, full_name, phone, role, created_at, city, profession")
      .eq("id", id)
      .order("id")
      .range(from, to),
  );
  const prof = profiles[0];
  if (!prof) return null;

  const enrollRaw = await fetchEnrollments(admin, [id]);
  if (prof.role !== "student" && enrollRaw.length === 0) return null;

  const emails = await resolveEmails([id], { strict: true });
  const email = emails.get(id) ?? null;

  const titles = await fetchCourseTitles(admin, enrollRaw.map((e) => e.course_id));
  const progressMap = await loadProgress(admin, [id], enrollRaw, titles);
  const prog = progressMap.get(id) ?? { total: 0, completed: 0, finished: 0, byCourse: [] };
  const enrolledCourses = Array.from(new Set(enrollRaw.map((e) => e.course_id)));
  const enrolledSet = new Set(enrolledCourses);
  const attendanceRaw = (await fetchAttendance(admin, [id]))
    .filter((a) => enrolledSet.has(a.course_id))
    .sort((a, b) =>
      a.session_date < b.session_date ? 1 : a.session_date > b.session_date ? -1 : 0,
  );
  const held = await fetchHeld(admin, enrolledCourses);

  // Feedback: by profile id, plus responses left under the student's email.
  type RespRaw = { id: string; submitted_at: string; comments: string; participant_email: string | null };
  const respCols = "id, submitted_at, comments, participant_email";
  const responses = new Map<string, RespRaw>();
  for (const r of await fetchAll<RespRaw>((from, to) =>
    admin.from("feedback_responses").select(respCols).eq("participant_profile_id", id).order("id").range(from, to),
  )) {
    responses.set(r.id, r);
  }
  if (email) {
    const pattern = normEmail(email).replace(/[\\%_*]/g, (ch) => "\\" + ch);
    for (const r of await fetchAll<RespRaw>((from, to) =>
      admin.from("feedback_responses").select(respCols).ilike("participant_email", pattern).order("id").range(from, to),
    )) {
      // Defence in depth: the pattern match is only a prefilter; keep exact matches only.
      if (normEmail(r.participant_email) === normEmail(email)) responses.set(r.id, r);
    }
  }
  const starsByResponse = new Map<string, (number | null)[]>();
  for (const ids of chunk(Array.from(responses.keys()), CHUNK)) {
    const answers = await fetchAll<{ id: string; response_id: string; star_value: number | null }>((from, to) =>
      admin
        .from("feedback_answers")
        .select("id, response_id, star_value")
        .in("response_id", ids)
        .order("id")
        .range(from, to),
    );
    for (const a of answers) {
      const list = starsByResponse.get(a.response_id) ?? [];
      list.push(a.star_value);
      starsByResponse.set(a.response_id, list);
    }
  }
  const feedback: StudentFeedbackRow[] = Array.from(responses.values())
    .map((r) => ({
      id: r.id,
      submittedAt: r.submitted_at,
      comments: r.comments ?? "",
      rating: averageRating(starsByResponse.get(r.id) ?? []),
    }))
    .sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : a.submittedAt > b.submittedAt ? -1 : 0));
  const averageFeedback = averageRating(Array.from(starsByResponse.values()).flat());

  const bookings = await fetchAll<{
    id: string;
    mentor_name: string;
    package_name: string;
    status: string;
    sessions_total: number | null;
    created_at: string;
  }>((from, to) =>
    admin
      .from("mentorship_bookings")
      .select("id, mentor_name, package_name, status, sessions_total, created_at")
      .eq("student_id", id)
      .order("id")
      .range(from, to),
  );
  const mentorship: StudentMentorshipRow[] = bookings.map((b) => ({
    id: b.id,
    mentorName: b.mentor_name,
    packageName: b.package_name,
    status: b.status,
    sessionsTotal: b.sessions_total,
    createdAt: b.created_at,
  }));

  // Certificates: admins see every status; unavailable when the source is down.
  const certIndex = await loadCertIndex();
  let certs: StudentRecordData["certs"] = email ? { state: "unavailable" } : { state: "no-email" };
  let chip: CertChip = "unknown";
  let issuedGeneral = prog.finished; // when unknown, assume none pending so no false alert
  let issued: CertRecord[] = [];
  if (certIndex && email) {
    const mine = certIndex.get(normEmail(email)) ?? [];
    const info = certInfo(mine, prog.finished);
    certs = { state: "ok", certs: mine, pendingCount: info.pendingCount };
    chip = info.chip;
    issuedGeneral = info.issuedGeneral;
    issued = info.issued;
  }

  const enrollments: StudentEnrollmentRow[] = enrollRaw
    .map((e) => ({
      id: e.id,
      courseId: e.course_id,
      courseTitle: titles.get(e.course_id) ?? "Course",
      status: e.status,
      enrolledAt: e.enrolled_at,
      paymentAmountPkr: e.payment_amount_pkr ?? null,
    }))
    .sort((a, b) => (a.enrolledAt < b.enrolledAt ? 1 : a.enrolledAt > b.enrolledAt ? -1 : 0));

  const attendance: StudentAttendanceRow[] = attendanceRaw.map((a) => ({
    id: a.id,
    courseTitle: titles.get(a.course_id) ?? "Course",
    sessionDate: a.session_date,
    markedAt: a.marked_at,
  }));

  const activity: { ms: number; at: string; text: string }[] = [];
  const push = (at: string, text: string) => {
    const ms = Date.parse(at);
    if (Number.isFinite(ms)) activity.push({ ms, at, text });
  };
  for (const e of enrollments) push(e.enrolledAt, `Enrolled in ${e.courseTitle}`);
  for (const a of attendance) push(a.markedAt || a.sessionDate, `Attended a session on ${fmtDate(a.sessionDate)}`);
  for (const f of feedback) push(f.submittedAt, "Left feedback");
  for (const c of issued) push(c.issueDate, `Received a certificate for ${c.topic || c.batchName || "a course"}`);
  activity.sort((a, b) => b.ms - a.ms);

  return {
    profile: {
      id: prof.id,
      fullName: prof.full_name,
      email,
      phone: prof.phone,
      joinedAt: prof.created_at,
      ...(prof.city ? { city: prof.city } : {}),
      ...(prof.profession ? { profession: prof.profession } : {}),
    },
    tiles: {
      courses: enrollments.filter((e) => e.status === "active").length,
      progress: progressPercent(prog.total, prog.completed),
      attended: sessionsAttended(attendance.length, heldCount(held, enrolledCourses)).label,
      averageFeedback,
      certificate: chip,
    },
    enrollments,
    progressByCourse: prog.byCourse,
    attendance,
    feedback,
    mentorship,
    certs,
    recentActivity: activity.slice(0, 8).map(({ at, text }) => ({ at, text })),
    attention: needsAttention({
      enrollments: enrollments.map((e) => ({ id: e.id, courseTitle: e.courseTitle, status: e.status })),
      finishedCourses: prog.finished,
      issuedGeneralCerts: issuedGeneral,
    }),
  };
}
