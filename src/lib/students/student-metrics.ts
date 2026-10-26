// Pure helpers for student progress and attention items. No I/O.

export function progressPercent(totalLessons: number, completedLessons: number): number {
  if (!Number.isFinite(totalLessons) || totalLessons <= 0) return 0;
  if (!Number.isFinite(completedLessons) || completedLessons <= 0) return 0;
  return Math.min(100, Math.round((completedLessons / totalLessons) * 100));
}

export function countFinishedCourses(
  courses: { courseId: string; lessonIds: string[] }[],
  completedLessonIds: Set<string>,
): number {
  return courses.filter(
    (c) => c.lessonIds.length > 0 && c.lessonIds.every((id) => completedLessonIds.has(id)),
  ).length;
}

export function sessionsAttended(
  attended: number,
  held: number,
): { attended: number; held: number; label: string } {
  const a = Number.isFinite(attended) && attended > 0 ? attended : 0;
  const h = Math.max(Number.isFinite(held) && held > 0 ? held : 0, a);
  return { attended: a, held: h, label: h === 0 || held <= 0 ? `${a}` : `${a} of ${h}` };
}

export function averageRating(stars: (number | null)[]): number | null {
  const nums = stars.filter((s): s is number => typeof s === "number" && Number.isFinite(s));
  if (nums.length === 0) return null;
  const avg = nums.reduce((sum, n) => sum + n, 0) / nums.length;
  return Math.round(avg * 10) / 10;
}

export type AttentionItem = { key: string; title: string; detail: string };

export function needsAttention(input: {
  enrollments: { id?: string; courseTitle: string; status: string }[];
  finishedCourses: number;
  issuedGeneralCerts: number;
}): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const e of input.enrollments) {
    if (e.status === "pending" || e.status === "reserved") {
      items.push({
        key: `pending:${e.id ?? e.courseTitle}`,
        title: `Payment pending for ${e.courseTitle}`,
        detail: "Waiting for the payment to be checked.",
      });
    } else if (e.status === "rejected") {
      items.push({
        key: `rejected:${e.id ?? e.courseTitle}`,
        title: `Payment rejected for ${e.courseTitle}`,
        detail: "The payment was not accepted.",
      });
    }
  }
  const n = input.finishedCourses - input.issuedGeneralCerts;
  if (n > 0) {
    items.push({
      key: "certs-pending",
      title: n === 1 ? "1 certificate is not yet issued" : `${n} certificates are not yet issued`,
      detail: "Finished courses without a certificate yet.",
    });
  }
  return items;
}
