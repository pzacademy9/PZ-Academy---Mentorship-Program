// Checks a parsed course file: blocks on hard problems, cleans what it can, and
// collects plain-words warnings. Pure and client-safe: types only from the
// server data module.
import type { LessonResourceLink, QuizQuestionInput } from "@/lib/data/admin-lms";
import { parseQuizPaste } from "@/lib/lms/quiz-paste";
import { checkVideoLink } from "@/lib/video-link";
import { parseCourseFile } from "./parse";
import { COURSE_IMPORT_LIMITS, type ImportCourseType, type RawNote } from "./format";

export type ImportSession = {
  title: string;
  videoUrl: string;
  videoUrl2: string;
  notes: LessonResourceLink[];
  questions: QuizQuestionInput[];
};

export type ImportModule = {
  title: string;
  notes: LessonResourceLink[];
  sessions: ImportSession[];
};

export type ImportPlan = {
  title: string;
  type: ImportCourseType;
  modules: ImportModule[];
};

export type ImportSummary = {
  modules: number;
  sessions: number;
  videos: number;
  questions: number;
  sessionList: { module: string; title: string; videoUrl: string; firstQuestion: string }[];
  unassignedNotes: LessonResourceLink[];
};

export type AnalyzeResult =
  | { ok: true; plan: ImportPlan; warnings: string[]; summary: ImportSummary }
  | { ok: false; errors: string[] };

const L = COURSE_IMPORT_LIMITS;

function siteName(url: string): string {
  return new URL(url).hostname.replace(/^www\./i, "");
}

function isWebLink(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

// Cleans a list of raw notes. `where` is the prefix for messages about the
// whole list; per-note messages name the file line.
function cleanNotes(raw: RawNote[], where: string, warnings: string[]): LessonResourceLink[] {
  const kept: LessonResourceLink[] = [];
  for (const n of raw) {
    const url = n.url.trim();
    const label = n.label.trim();
    if (!url) {
      warnings.push(`A notes link at line ${n.line} is empty and was left out.`);
      continue;
    }
    if (!isWebLink(url)) {
      warnings.push(`${where}: the notes link at line ${n.line} (${url}) is not a web link and was left out.`);
      continue;
    }
    if (label.length > L.maxLabel) {
      warnings.push(
        `${where}: the notes link at line ${n.line} was left out because its label is longer than ${L.maxLabel} characters.`,
      );
      continue;
    }
    kept.push({ label: label || siteName(url), url });
  }
  if (kept.length > L.maxNotesPerSession) {
    warnings.push(
      `${where}: has more than ${L.maxNotesPerSession} notes links, so only the first ${L.maxNotesPerSession} were kept.`,
    );
    return kept.slice(0, L.maxNotesPerSession);
  }
  return kept;
}

export function analyzeCourseFile(text: string): AnalyzeResult {
  const parsed = parseCourseFile(text);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  const { raw } = parsed;
  const warnings = [...parsed.warnings];
  const errors: string[] = [];
  const hasModules = raw.type === "course";

  if (raw.title.length > L.maxTitle) {
    errors.push(`The course title is longer than ${L.maxTitle} characters.`);
  }

  const totalSessions = raw.modules.reduce((n, m) => n + m.sessions.length, 0);
  if (totalSessions === 0) errors.push("The file has no sessions.");
  if (hasModules && raw.modules.length > L.maxModules) {
    errors.push(`The file has ${raw.modules.length} modules; the most allowed is ${L.maxModules}.`);
  }
  if (totalSessions > L.maxSessions) {
    errors.push(`The file has ${totalSessions} sessions; the most allowed is ${L.maxSessions}.`);
  }

  const unassigned: LessonResourceLink[] = [];
  const plan: ImportPlan = { title: raw.title, type: raw.type, modules: [] };
  const summary: ImportSummary = {
    modules: 0,
    sessions: 0,
    videos: 0,
    questions: 0,
    sessionList: [],
    unassignedNotes: unassigned,
  };

  for (const m of raw.modules) {
    const modLabel = hasModules ? `Module "${m.title}"` : "The file";
    if (m.title.length > L.maxTitle) {
      errors.push(`Module "${m.title.slice(0, 40)}...": the module title is longer than ${L.maxTitle} characters.`);
    }

    let moduleNotes: LessonResourceLink[] = [];
    if (hasModules) {
      moduleNotes = cleanNotes(m.notes, modLabel, warnings);
    } else if (m.notes.length > 0) {
      const lost = cleanNotes(m.notes, "Notes before the first session", warnings);
      unassigned.push(...lost);
      if (lost.length > 0) {
        warnings.push(
          `Notes before the first session cannot be saved on a ${raw.type}; they are listed as unassigned notes instead.`,
        );
      }
    }
    if (hasModules && m.sessions.length === 0) {
      warnings.push(`${modLabel} has no sessions.`);
    }

    const sessions: ImportSession[] = [];
    for (const s of m.sessions) {
      const label = hasModules ? `${s.title} (${m.title})` : s.title;
      if (s.title.length > L.maxTitle) {
        const shortTitle = `${s.title.slice(0, 40)}...`;
        errors.push(`Session "${shortTitle}"${hasModules ? ` (${m.title.slice(0, 40)})` : ""}: the session title is longer than ${L.maxTitle} characters.`);
      }

      const kept = { video: "", video2: "" };
      for (const key of ["video", "video2"] as const) {
        const url = s[key].trim();
        if (!url) continue;
        const check = checkVideoLink(url);
        if (check.status === "ok") kept[key] = url;
        else if (check.status === "invalid" || check.status === "unsupported") {
          warnings.push(
            `${label}: the ${key === "video" ? "video link" : "second video link"} (${url}) was left out. ${check.message}`,
          );
        }
      }
      if (!s.video.trim()) warnings.push(`${label}: needs a video link.`);

      const notes = cleanNotes(s.notes, label, warnings);

      let questions: QuizQuestionInput[] = [];
      if (!s.quizText.trim()) {
        warnings.push(`${label}: has no quiz.`);
      } else {
        const q = parseQuizPaste(s.quizText);
        questions = q.questions.map((x) => ({
          question: x.question,
          options: x.options,
          correctIndex: x.correctIndex,
        }));
        for (const e of q.errors) {
          warnings.push(`${label}, question ${e.questionNumber}: left out (${e.message.replace(/^Question \d+:\s*/i, "")}).`);
        }
        if (questions.length === 0) warnings.push(`${label}: the quiz has no usable questions.`);
      }
      if (questions.length > L.maxQuestionsPerSession) {
        errors.push(
          `${label}: has ${questions.length} quiz questions; the most allowed in one session is ${L.maxQuestionsPerSession}.`,
        );
      }

      sessions.push({ title: s.title, videoUrl: kept.video, videoUrl2: kept.video2, notes, questions });
      summary.sessions += 1;
      summary.questions += questions.length;
      summary.videos += (kept.video ? 1 : 0) + (kept.video2 ? 1 : 0);
      summary.sessionList.push({
        module: hasModules ? m.title : "",
        title: s.title,
        videoUrl: kept.video,
        firstQuestion: questions[0]?.question ?? "",
      });
    }

    plan.modules.push({ title: m.title, notes: moduleNotes, sessions });
  }

  summary.modules = plan.modules.length;
  if (summary.questions > L.maxQuestionsPerCourse) {
    errors.push(
      `The file has ${summary.questions.toLocaleString("en-US")} quiz questions; the most allowed in one course is ${L.maxQuestionsPerCourse.toLocaleString("en-US")}.`,
    );
  }

  for (const n of raw.unassignedNotes) {
    const url = n.url.trim();
    if (!url) {
      warnings.push(`A notes link at line ${n.line} is empty and was left out.`);
      continue;
    }
    unassigned.push({ label: n.label.trim() || (isWebLink(url) ? siteName(url) : ""), url });
  }
  if (unassigned.length > 0) {
    warnings.push(
      `${unassigned.length} notes link${unassigned.length === 1 ? " was" : "s were"} not placed on a session. They are not saved; copy them in by hand.`,
    );
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, plan, warnings, summary };
}
