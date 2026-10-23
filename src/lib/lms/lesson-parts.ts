import type { CourseType, LessonContentType } from "@/lib/validations/admin-lms";

export function deriveContentType(p: {
  videoUrl?: string | null;
  videoUrl2?: string | null;
  pdfFileId?: string | null;
}): LessonContentType {
  if (p.videoUrl?.trim() || p.videoUrl2?.trim()) return "video";
  if (p.pdfFileId?.trim()) return "pdf";
  return "text";
}

export type SessionReadiness = { ready: boolean; missing: ("video" | "quiz")[] };

export function sessionReadiness(
  courseType: CourseType,
  s: { hasVideo: boolean; quizCount: number },
): SessionReadiness | null {
  if (courseType === "mentorship") return null;
  const missing: ("video" | "quiz")[] = [];
  if (!s.hasVideo) missing.push("video");
  const needsQuiz = courseType === "course" || courseType === "workshop";
  if (needsQuiz && s.quizCount < 1) missing.push("quiz");
  return { ready: missing.length === 0, missing };
}

export function courseReadiness(
  courseType: CourseType,
  sessions: { hasVideo: boolean; quizCount: number }[],
): { readyCount: number; total: number; label: string } {
  const total = sessions.length;
  if (courseType === "mentorship") return { readyCount: 0, total, label: "" };
  const readyCount = sessions.filter((s) => sessionReadiness(courseType, s)?.ready).length;
  const label = total === 0 ? "No sessions yet" : `Ready: ${readyCount} of ${total} sessions`;
  return { readyCount, total, label };
}

export function missingSummary(
  courseType: CourseType,
  sessions: { title: string; hasVideo: boolean; quizCount: number }[],
): string[] {
  const lines: string[] = [];
  for (const s of sessions) {
    const r = sessionReadiness(courseType, s);
    if (!r || r.ready) continue;
    lines.push(`${s.title}: no ${r.missing.join(" and no ")}`);
  }
  return lines;
}
