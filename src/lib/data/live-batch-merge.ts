import type { CourseCard } from "@/lib/data/lms";

/** Attach an open live batch (if any) to each card by course id. */
export function attachLiveBatches(
  courses: CourseCard[],
  batches: Map<string, { startsOn: string; href: string }>,
): CourseCard[] {
  if (batches.size === 0) return courses;
  return courses.map((c) => {
    const b = batches.get(c.id);
    return b ? { ...c, liveBatch: { startsOn: b.startsOn, href: b.href } } : c;
  });
}
