// The "build a course from a file" layout: constants and the raw shapes the
// file reader produces. Shared by the reader, the checker and the AI prompt.

export const COURSE_IMPORT_FORMAT_ID = "pz-course/1";

export const COURSE_IMPORT_LIMITS = {
  maxChars: 400_000,
  maxModules: 12,
  maxSessions: 60,
  maxQuestionsPerSession: 200,
  maxQuestionsPerCourse: 2000,
  maxTitle: 200,
  maxLabel: 150,
  maxNotesPerSession: 20,
} as const;

export type ImportCourseType = "course" | "workshop" | "webinar";

export type RawNote = { label: string; url: string; line: number };

export type RawSession = {
  title: string;
  line: number;
  video: string;
  video2: string;
  notes: RawNote[];
  quizText: string;
  quizLine: number;
};

// Workshop and webinar files have exactly one module, with title "".
export type RawModule = {
  title: string;
  line: number;
  notes: RawNote[];
  sessions: RawSession[];
};

export type RawCourse = {
  title: string;
  type: ImportCourseType;
  modules: RawModule[];
  unassignedNotes: RawNote[];
};
