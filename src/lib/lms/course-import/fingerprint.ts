import "server-only";
import { createHash } from "node:crypto";
import type { CurrentCurriculum, CurriculumChange } from "./compare";

/**
 * A short hash of a change row and the part of the program it touches. Check
 * hands it out, Apply works it out again: an id can stay the same while what
 * it points at changes (a lesson's quiz edited, a lesson added to a module).
 */
export function changeFingerprint(current: CurrentCurriculum, change: CurriculumChange): string {
  const lessons = current.modules.flatMap((m) => m.lessons);
  let touched: unknown = null;
  switch (change.kind) {
    case "update-session":
    case "remove-session":
      touched = lessons.find((l) => l.id === change.lessonId) ?? null;
      break;
    case "update-module-notes":
    case "remove-module":
      touched = current.modules.find((m) => m.id === change.moduleId) ?? null;
      break;
    default:
      touched = null;
  }
  return createHash("sha1").update(JSON.stringify({ change, touched })).digest("hex").slice(0, 16);
}
