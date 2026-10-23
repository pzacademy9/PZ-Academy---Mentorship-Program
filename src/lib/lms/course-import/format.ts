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

// The course's basic settings that may sit in the file header. One table feeds
// the reader, the checker, the saver and the AI prompt, so they cannot drift.
// `max` matches courseConfigSchema in src/lib/validations/admin-lms.ts.
export const COURSE_DETAIL_FIELDS = [
  { field: "tagline", key: "tagline", column: "tagline", label: "Tagline", max: 300, multiline: false },
  { field: "description", key: "description", column: "description", label: "Description", max: 5000, multiline: true },
  { field: "level", key: "level", column: "level", label: "Level", max: 50, multiline: false },
  { field: "duration", key: "duration", column: "duration_text", label: "Duration", max: 50, multiline: false },
  { field: "timings", key: "timings", column: "timings", label: "Timings", max: 200, multiline: false },
  { field: "mentorName", key: "mentor_name", column: "mentor_name", label: "Mentor name", max: 120, multiline: false },
  { field: "mentorTitle", key: "mentor_title", column: "mentor_title", label: "Mentor designation", max: 120, multiline: false },
  { field: "mentorBio", key: "mentor_bio", column: "mentor_bio", label: "Mentor bio", max: 2000, multiline: true },
] as const;

export type CourseDetailField = (typeof COURSE_DETAIL_FIELDS)[number]["field"];

// What the reader found (may be empty strings) and what the checker keeps
// (only non-empty values that fit).
export type RawDetails = Record<CourseDetailField, string>;
export type ImportDetails = Partial<Record<CourseDetailField, string>>;

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
  details: RawDetails;
  modules: RawModule[];
  unassignedNotes: RawNote[];
};
