/**
 * A manual conversion's program reuses ConversionTag's course/label shape
 * (never "none" — a manual conversion always names a program) so the
 * concept of "which program" stays in one vocabulary across the automatic
 * and manual conversion systems. Pure translation only; no I/O — mirrors
 * toConversionTag/fromConversionTag in admin-crm-conversions.ts.
 */
export type ManualConversionProgram = { kind: "course"; courseId: string } | { kind: "label"; pattern: string };

export function toManualConversionProgram(courseId: string | null, programLabel: string | null): ManualConversionProgram | null {
  if (courseId !== null && programLabel !== null) return null;
  if (courseId !== null) return { kind: "course", courseId };
  if (programLabel !== null) return { kind: "label", pattern: programLabel };
  return null;
}

export function fromManualConversionProgram(program: ManualConversionProgram): { course_id: string | null; program_label: string | null } {
  if (program.kind === "course") return { course_id: program.courseId, program_label: null };
  return { course_id: null, program_label: program.pattern };
}
