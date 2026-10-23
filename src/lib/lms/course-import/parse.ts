import {
  COURSE_DETAIL_FIELDS,
  COURSE_IMPORT_FORMAT_ID,
  COURSE_IMPORT_LIMITS,
  type CourseDetailField,
  type ImportCourseType,
  type RawDetails,
  type RawCourse,
  type RawModule,
  type RawNote,
  type RawSession,
} from "./format";

export type ParseResult =
  | { ok: true; raw: RawCourse; warnings: string[] }
  | { ok: false; errors: string[] };

const BAD_FORMAT =
  "This file is not in the right layout. The first line must say format: " +
  COURSE_IMPORT_FORMAT_ID +
  ".";

// Headings are matched on the line with bold markers already removed.
const MODULE_RE = /^##\s+module\s*(?:\d+\s*)?[:\-–—]\s*(.*)$/i;
const SESSION_RE = /^###\s+session\s*(?:\d+\s*)?[:\-–—]\s*(.*)$/i;
const UNASSIGNED_RE = /^##\s+unassigned\s+notes(?:\s*:)?$/i;
const ANY_HEADING_RE = /^#{2,3}\s/;
const KEY_RE = /^(?:\*\*|__)?(format|title|type|video|video2|notes|quiz)(?:\*\*|__)?\s*:(?:\*\*|__)?\s*(.*)$/i;

// Course detail keys (header block only). The key list comes from the shared table.
const DETAIL_RE = new RegExp(
  "^(?:\\*\\*|__)?(" +
    COURSE_DETAIL_FIELDS.map((f) => f.key).join("|") +
    ")(?:\\*\\*|__)?\\s*:(?:\\*\\*|__)?(.*)$",
  "i",
);
const DETAIL_BY_KEY = new Map<string, (typeof COURSE_DETAIL_FIELDS)[number]>(
  COURSE_DETAIL_FIELDS.map((f) => [f.key, f]),
);

// Removes bold markers anywhere in a title.
function unbold(s: string): string {
  return s.replace(/\*\*|__/g, "").trim();
}

// Removes bold markers wrapped around a whole value (safe for links).
function trimBold(s: string): string {
  let a = 0;
  let b = s.length;
  while (b - a >= 2 && (s.startsWith("**", a) || s.startsWith("__", a))) a += 2;
  while (b - a >= 2 && (s.endsWith("**", b) || s.endsWith("__", b))) b -= 2;
  return s.slice(a, b).trim();
}

// If the text holds fenced blocks, take the first one that contains a format
// line (chat apps wrap files in code fences and add chat text around them).
function unfence(lines: string[]): { lines: string[]; offset: number } {
  const fences: number[] = [];
  lines.forEach((l, i) => {
    if (l.trimStart().startsWith("```")) fences.push(i);
  });
  for (let i = 0; i + 1 < fences.length; i += 2) {
    const block = lines.slice(fences[i] + 1, fences[i + 1]);
    if (block.some((l) => /^\s*format\s*:/i.test(l))) {
      return { lines: block, offset: fences[i] + 1 };
    }
  }
  return { lines, offset: 0 };
}

function splitNote(value: string, line: number): RawNote {
  const idx = value.indexOf(" | ");
  if (idx === -1) {
    // Also recover "Label - https://x", "Label: https://x" and "Label https://x".
    const h = value.search(/https?:\/\//i);
    if (h > 0) {
      const seps = "|-–—:";
      let a = 0;
      let b = h;
      while (a < b && (/\s/.test(value[a]) || seps.includes(value[a]))) a++;
      while (b > a && (/\s/.test(value[b - 1]) || seps.includes(value[b - 1]))) b--;
      const label = value.slice(a, b);
      return { label, url: value.slice(h).trim(), line };
    }
    return { label: "", url: value.trim(), line };
  }
  return { label: value.slice(0, idx).trim(), url: value.slice(idx + 3).trim(), line };
}

function newSession(title: string, line: number): RawSession {
  return { title, line, video: "", video2: "", notes: [], quizText: "", quizLine: 0 };
}

export function parseCourseFile(text: string): ParseResult {
  const cleaned = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  if (cleaned.trim() === "") return { ok: false, errors: ["The file is empty."] };
  if (cleaned.length > COURSE_IMPORT_LIMITS.maxChars) {
    return { ok: false, errors: ["The file is too long to import."] };
  }

  const { lines, offset } = unfence(cleaned.split("\n"));

  // The first non-blank line must be the format line.
  const first = lines.find((l) => l.trim() !== "") ?? "";
  const firstKey = KEY_RE.exec(first.trim());
  if (
    !firstKey ||
    firstKey[1].toLowerCase() !== "format" ||
    trimBold(firstKey[2]) !== COURSE_IMPORT_FORMAT_ID
  ) {
    return { ok: false, errors: [BAD_FORMAT] };
  }

  const errors: string[] = [];
  const warnings: string[] = [];
  let title = "";
  let typeValue = "";
  let type: ImportCourseType | null = null;
  const modules: RawModule[] = [];
  const unassignedNotes: RawNote[] = [];

  let currentModule: RawModule | null = null;
  let currentSession: RawSession | null = null;
  let inUnassigned = false;
  let inQuiz = false;
  let quizFrozen = false;
  let quizLines: string[] = [];
  let quizStart = 0;

  const flushQuiz = () => {
    if (currentSession && quizLines.length > 0) {
      let a = 0;
      let b = quizLines.length;
      while (a < b && quizLines[a].trim() === "") a++;
      while (b > a && quizLines[b - 1].trim() === "") b--;
      if (b > a) {
        currentSession.quizText = quizLines.slice(a, b).join("\n");
        currentSession.quizLine = quizStart + a;
      }
    }
    quizLines = [];
    inQuiz = false;
    quizFrozen = false;
  };

  // Type is needed to interpret headings, so read it up front.
  for (const l of lines) {
    const k = KEY_RE.exec(l.trim());
    if (k && k[1].toLowerCase() === "type") {
      typeValue = trimBold(k[2]);
      break;
    }
    if (ANY_HEADING_RE.test(l)) break;
  }
  const lowered = typeValue.toLowerCase();
  if (lowered === "course" || lowered === "workshop" || lowered === "webinar") {
    type = lowered;
  }
  const flat = type === "workshop" || type === "webinar";
  if (flat) {
    currentModule = { title: "", line: 0, notes: [], sessions: [] };
    modules.push(currentModule);
  }

  const details = Object.fromEntries(COURSE_DETAIL_FIELDS.map((f) => [f.field, ""])) as RawDetails;
  // The detail key whose value may run over the following header lines, and
  // how many blank lines have been seen since the last text line.
  let cont: { field: CourseDetailField; drop: boolean } | null = null;
  let pendingBlanks = 0;

  let sawFormat = false;
  let headingSeen = false;
  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1 + offset;
    const raw = lines[i];
    const line = raw.trim();

    if (ANY_HEADING_RE.test(line)) {
      headingSeen = true;
      cont = null;
      flushQuiz();
      inUnassigned = false;
      let m: RegExpExecArray | null;
      const heading = line.replace(/\*\*|__/g, "");
      if ((m = MODULE_RE.exec(heading))) {
        if (flat) {
          errors.push("Workshops and webinars have sessions only, no modules.");
          continue;
        }
        const t = unbold(m[1]);
        if (!t) errors.push(`The module at line ${lineNo} has no title.`);
        currentModule = { title: t, line: lineNo, notes: [], sessions: [] };
        currentSession = null;
        modules.push(currentModule);
        continue;
      }
      if ((m = SESSION_RE.exec(heading))) {
        const t = unbold(m[1]);
        if (!currentModule) {
          errors.push(`A session at line ${lineNo} is not inside a module.`);
          currentSession = null;
          continue;
        }
        if (!t) errors.push(`The session at line ${lineNo} has no title.`);
        currentSession = newSession(t, lineNo);
        currentModule.sessions.push(currentSession);
        continue;
      }
      if (UNASSIGNED_RE.test(heading)) {
        inUnassigned = true;
        currentSession = null;
        continue;
      }
      // An unknown heading ends the session it sits in, so the lines under it
      // can never be added to the session above.
      currentSession = null;
      if (!heading.startsWith("###") && !flat) currentModule = null;
      warnings.push(`Line ${lineNo} was not understood and was ignored.`);
      continue;
    }

    if (inQuiz) {
      // A second quiz: line in the same session: keep the first quiz only.
      if (/^(?:\*\*|__)?quiz(?:\*\*|__)?\s*:/i.test(line)) {
        if (!quizFrozen) {
          warnings.push(
            `Session "${currentSession?.title ?? ""}": the quiz appears more than once (line ${lineNo}), so only the first was kept.`,
          );
        }
        quizFrozen = true;
      }
      if (!quizFrozen) quizLines.push(raw);
      continue;
    }

    if (line === "") {
      if (cont) pendingBlanks++;
      continue;
    }

    if (!headingSeen) {
      const d = DETAIL_RE.exec(line);
      if (d) {
        const f = DETAIL_BY_KEY.get(d[1].toLowerCase());
        if (f) {
          const value = trimBold(d[2].trim());
          let drop = false;
          if (details[f.field] !== "" && value !== "") {
            drop = true;
            warnings.push(
              `The ${f.label.toLowerCase()} appears more than once (line ${lineNo}), so only the first was kept.`,
            );
          } else if (details[f.field] === "") {
            details[f.field] = value;
          } else {
            drop = true;
          }
          cont = f.multiline ? { field: f.field, drop } : null;
          pendingBlanks = 0;
          continue;
        }
      }
      if (cont && !KEY_RE.test(line)) {
        if (!cont.drop) {
          const cur = details[cont.field];
          details[cont.field] = cur === "" ? line : cur + "\n".repeat(pendingBlanks + 1) + line;
        }
        pendingBlanks = 0;
        continue;
      }
    }
    cont = null;

    const k = KEY_RE.exec(line);
    if (!k) {
      warnings.push(`Line ${lineNo} was not understood and was ignored.`);
      continue;
    }
    const key = k[1].toLowerCase();
    const value = trimBold(k[2]);

    if (key === "format") {
      if (!sawFormat) sawFormat = true;
      else warnings.push(`Line ${lineNo} was not understood and was ignored.`);
    } else if (key === "title") {
      if (!headingSeen && !title) title = unbold(value);
      else warnings.push(`Line ${lineNo} was not understood and was ignored.`);
    } else if (key === "type") {
      // already read up front
    } else if (key === "notes") {
      if (inUnassigned) unassignedNotes.push(splitNote(value, lineNo));
      else if (currentSession) currentSession.notes.push(splitNote(value, lineNo));
      else if (currentModule) currentModule.notes.push(splitNote(value, lineNo));
      else warnings.push(`Line ${lineNo} was not understood and was ignored.`);
    } else if (key === "video" || key === "video2") {
      if (currentSession) {
        if (currentSession[key] !== "" && value !== "") {
          warnings.push(
            `Session "${currentSession.title}": the ${key === "video" ? "video" : "second video"} link appears more than once (line ${lineNo}), so only the first was kept.`,
          );
        } else if (currentSession[key] === "") {
          currentSession[key] = value;
        }
      } else warnings.push(`Line ${lineNo} was not understood and was ignored.`);
    } else if (key === "quiz") {
      if (!currentSession) {
        warnings.push(`Line ${lineNo} was not understood and was ignored.`);
      } else {
        inQuiz = true;
        quizStart = lineNo + 1;
        if (value) {
          quizLines.push(value);
          quizStart = lineNo;
        }
      }
    }
  }
  flushQuiz();

  if (!title) errors.push("The course needs a title.");
  if (!type) errors.push("The type must be course, workshop or webinar.");

  if (errors.length > 0 || !type) return { ok: false, errors };
  return { ok: true, raw: { title, type, details, modules, unassignedNotes }, warnings };
}
