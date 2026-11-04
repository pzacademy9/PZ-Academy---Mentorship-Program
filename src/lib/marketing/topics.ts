// Pure: course topics (courses.topic, migration 0102) for the list-page buttons.

export const TOPIC_MAX = 40;

/** Trimmed, inner spaces collapsed; "" = no topic. */
export function cleanTopic(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\s+/g, " ").trim().slice(0, TOPIC_MAX);
}

const key = (t: string) => cleanTopic(t).toLowerCase();

/** The distinct topics of the given (published) courses, A to Z; a topic with no course is never listed. */
export function topicsOf(courses: { topic?: string | null }[]): string[] {
  const seen = new Map<string, string>();
  for (const c of courses) {
    const t = cleanTopic(c.topic);
    if (t && !seen.has(key(t))) seen.set(key(t), t);
  }
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
}

export function hasTopic(course: { topic?: string | null }, topic: string): boolean {
  return key(course.topic ?? "") === key(topic);
}
