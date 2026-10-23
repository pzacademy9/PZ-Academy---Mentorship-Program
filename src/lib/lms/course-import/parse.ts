import {
  COURSE_IMPORT_FORMAT_ID,
  COURSE_IMPORT_LIMITS,
  type ImportCourseType,
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

const MODULE_RE = /^##\s+Module:\s*(.*)$/i;
const SESSION_RE = /^###\s+Session:\s*(.*)$/i;
const UNASSIGNED_RE = /^##\s+Unassigned notes\s*$/i;
const ANY_HEADING_RE = /^#{2,3}\s/;
const KEY_RE = /^(format|title|type|video|video2|notes|quiz)\s*:\s*(.*)$/i;

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
  if (idx === -1) return { label: "", url: value.trim(), line };
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
    firstKey[2].trim() !== COURSE_IMPORT_FORMAT_ID
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
  };

  // Type is needed to interpret headings, so read it up front.
  for (const l of lines) {
    const k = KEY_RE.exec(l.trim());
    if (k && k[1].toLowerCase() === "type") {
      typeValue = k[2].trim();
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

  let sawFormat = false;
  let headingSeen = false;
  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1 + offset;
    const raw = lines[i];
    const line = raw.trim();

    if (ANY_HEADING_RE.test(line)) {
      headingSeen = true;
      flushQuiz();
      inUnassigned = false;
      let m: RegExpExecArray | null;
      if ((m = MODULE_RE.exec(line))) {
        if (flat) {
          errors.push("Workshops and webinars have sessions only, no modules.");
          continue;
        }
        const t = m[1].trim();
        if (!t) errors.push(`The module at line ${lineNo} has no title.`);
        currentModule = { title: t, line: lineNo, notes: [], sessions: [] };
        currentSession = null;
        modules.push(currentModule);
        continue;
      }
      if ((m = SESSION_RE.exec(line))) {
        const t = m[1].trim();
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
      if (UNASSIGNED_RE.test(line)) {
        inUnassigned = true;
        currentSession = null;
        continue;
      }
      warnings.push(`Line ${lineNo} was not understood and was ignored.`);
      continue;
    }

    if (inQuiz) {
      quizLines.push(raw);
      continue;
    }

    if (line === "") continue;

    const k = KEY_RE.exec(line);
    if (!k) {
      warnings.push(`Line ${lineNo} was not understood and was ignored.`);
      continue;
    }
    const key = k[1].toLowerCase();
    const value = k[2].trim();

    if (key === "format") {
      if (!sawFormat) sawFormat = true;
      else warnings.push(`Line ${lineNo} was not understood and was ignored.`);
    } else if (key === "title") {
      if (!headingSeen && !title) title = value;
      else warnings.push(`Line ${lineNo} was not understood and was ignored.`);
    } else if (key === "type") {
      // already read up front
    } else if (key === "notes") {
      if (inUnassigned) unassignedNotes.push(splitNote(value, lineNo));
      else if (currentSession) currentSession.notes.push(splitNote(value, lineNo));
      else if (currentModule) currentModule.notes.push(splitNote(value, lineNo));
      else warnings.push(`Line ${lineNo} was not understood and was ignored.`);
    } else if (key === "video" || key === "video2") {
      if (currentSession) currentSession[key] = value;
      else warnings.push(`Line ${lineNo} was not understood and was ignored.`);
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
  return { ok: true, raw: { title, type, modules, unassignedNotes }, warnings };
}
