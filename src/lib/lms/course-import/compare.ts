// Compares a parsed curriculum file with the program as it stands, and lists
// the changes the file would make. Pure and client-safe: types only from the
// server data module.
import type { LessonResourceLink, QuizQuestionInput } from "@/lib/data/admin-lms";
import type { ImportPlan, ImportSession } from "./analyze";

export type CurrentLesson = {
  id: string;
  title: string;
  videoUrl: string;
  videoUrl2: string;
  notes: LessonResourceLink[];
  questions: QuizQuestionInput[];
};

export type CurrentModule = {
  id: string;
  title: string;
  notes: LessonResourceLink[];
  lessons: CurrentLesson[];
};

export type CurrentCurriculum = { flat: boolean; modules: CurrentModule[] };

export type SessionPart = "video" | "video2" | "notes" | "quiz";

type Common = { id: string; label: string; defaultOn: boolean };

export type CurriculumChange =
  | (Common & { kind: "new-module"; moduleIndex: number; sessionCount: number })
  | (Common & {
      kind: "new-session";
      moduleIndex: number;
      sessionIndex: number;
      // Matched module id; null in flat programs (the hidden module is used).
      moduleId: string | null;
      note?: string;
    })
  | (Common & {
      kind: "update-session";
      lessonId: string;
      moduleIndex: number;
      sessionIndex: number;
      rows: { part: SessionPart; from: string; to: string }[];
    })
  | (Common & { kind: "update-module-notes"; moduleId: string; moduleIndex: number; from: string; to: string })
  | (Common & { kind: "remove-session"; lessonId: string })
  | (Common & { kind: "remove-module"; moduleId: string });

export function normalizeName(s: string): string {
  return s.replace(/[–—]/g, "-").replace(/\s+/g, " ").trim().toLowerCase();
}

function short(url: string): string {
  return url.length > 60 ? `${url.slice(0, 60)}...` : url;
}

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function sameLinks(a: LessonResourceLink[], b: LessonResourceLink[]): boolean {
  const flat = (ls: LessonResourceLink[]) => ls.map((l) => [l.label, l.url]);
  return JSON.stringify(flat(a)) === JSON.stringify(flat(b));
}

function sameQuiz(a: QuizQuestionInput[], b: QuizQuestionInput[]): boolean {
  const flat = (qs: QuizQuestionInput[]) => qs.map((x) => [x.question, x.options, x.correctIndex]);
  return JSON.stringify(flat(a)) === JSON.stringify(flat(b));
}

function sessionRows(cur: CurrentLesson, file: ImportSession) {
  const rows: { part: SessionPart; from: string; to: string }[] = [];
  // A part left empty in the file leaves the existing one alone.
  if (file.videoUrl && file.videoUrl !== cur.videoUrl) {
    rows.push({ part: "video", from: short(cur.videoUrl), to: short(file.videoUrl) });
  }
  if (file.videoUrl2 && file.videoUrl2 !== cur.videoUrl2) {
    rows.push({ part: "video2", from: short(cur.videoUrl2), to: short(file.videoUrl2) });
  }
  if (file.notes.length > 0 && !sameLinks(cur.notes, file.notes)) {
    rows.push({
      part: "notes",
      from: count(cur.notes.length, "link", "links"),
      to: count(file.notes.length, "link", "links"),
    });
  }
  if (file.questions.length > 0 && !sameQuiz(cur.questions, file.questions)) {
    rows.push({
      part: "quiz",
      from: count(cur.questions.length, "question", "questions"),
      to: count(file.questions.length, "question", "questions"),
    });
  }
  return rows;
}

type FileEntry = { session: ImportSession; moduleIndex: number; sessionIndex: number };

// Matches file sessions to program lessons by name (first unused match wins).
// Lessons left over are offered for removal.
function compareSessions(
  scope: CurrentLesson[],
  entries: FileEntry[],
  moduleId: string | null,
  out: CurriculumChange[],
): void {
  const used = new Set<string>();
  const seen = new Set<string>();
  for (const { session, moduleIndex, sessionIndex } of entries) {
    const name = normalizeName(session.title);
    const match = scope.find((l) => !used.has(l.id) && normalizeName(l.title) === name);
    if (match) {
      used.add(match.id);
      const rows = sessionRows(match, session);
      if (rows.length > 0) {
        out.push({
          id: `update-session:${match.id}`,
          label: `Update session: ${session.title}`,
          defaultOn: true,
          kind: "update-session",
          lessonId: match.id,
          moduleIndex,
          sessionIndex,
          rows,
        });
      }
    } else {
      out.push({
        id: `new-session:${moduleIndex}:${sessionIndex}`,
        label: `New session: ${session.title}`,
        defaultOn: true,
        kind: "new-session",
        moduleIndex,
        sessionIndex,
        moduleId,
        ...(seen.has(name) ? { note: `The name "${session.title}" is repeated in the file.` } : {}),
      });
    }
    seen.add(name);
  }
  for (const l of scope) {
    if (used.has(l.id)) continue;
    out.push({
      id: `remove-session:${l.id}`,
      label: `Not in the file: ${l.title}. Will stay unless removed.`,
      defaultOn: false,
      kind: "remove-session",
      lessonId: l.id,
    });
  }
}

export function compareCurriculum(current: CurrentCurriculum, plan: ImportPlan): CurriculumChange[] {
  const out: CurriculumChange[] = [];
  const entriesOf = (mi: number): FileEntry[] =>
    plan.modules[mi].sessions.map((session, sessionIndex) => ({ session, moduleIndex: mi, sessionIndex }));

  if (current.flat) {
    // One pool of sessions: module titles are ignored.
    const all = current.modules.flatMap((m) => m.lessons);
    const entries = plan.modules.flatMap((_, mi) => entriesOf(mi));
    compareSessions(all, entries, null, out);
    return out;
  }

  const usedModules = new Set<string>();
  plan.modules.forEach((fm, moduleIndex) => {
    const name = normalizeName(fm.title);
    const match = current.modules.find((m) => !usedModules.has(m.id) && normalizeName(m.title) === name);
    if (!match) {
      out.push({
        id: `new-module:${moduleIndex}`,
        label: `New module: ${fm.title} (${count(fm.sessions.length, "session", "sessions")})`,
        defaultOn: true,
        kind: "new-module",
        moduleIndex,
        sessionCount: fm.sessions.length,
      });
      return;
    }
    usedModules.add(match.id);
    if (fm.notes.length > 0 && !sameLinks(match.notes, fm.notes)) {
      out.push({
        id: `update-module-notes:${match.id}`,
        label: `Module notes: ${fm.title}`,
        defaultOn: true,
        kind: "update-module-notes",
        moduleId: match.id,
        moduleIndex,
        from: count(match.notes.length, "link", "links"),
        to: count(fm.notes.length, "link", "links"),
      });
    }
    compareSessions(match.lessons, entriesOf(moduleIndex), match.id, out);
  });
  for (const m of current.modules) {
    if (usedModules.has(m.id)) continue;
    out.push({
      id: `remove-module:${m.id}`,
      label: `Not in the file: ${m.title}. Will stay unless removed.`,
      defaultOn: false,
      kind: "remove-module",
      moduleId: m.id,
    });
  }
  return out;
}
