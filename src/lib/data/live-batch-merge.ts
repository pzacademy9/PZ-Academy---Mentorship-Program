import type { CourseCard } from "@/lib/data/lms";

type MergeBatch = { startsOn: string; href: string; seatsLeft?: number | null; earlyBird?: unknown };

/** Attach an open live batch (if any) to each card by course id. */
export function attachLiveBatches(courses: CourseCard[], batches: Map<string, MergeBatch>): CourseCard[] {
  if (batches.size === 0) return courses;
  return courses.map((c) => {
    const b = batches.get(c.id);
    return b
      ? { ...c, liveBatch: { startsOn: b.startsOn, href: b.href, seatsLeft: b.seatsLeft ?? null, earlyBird: Boolean(b.earlyBird) } }
      : c;
  });
}
