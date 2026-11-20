import { z } from "zod";

const id = z.string().uuid();
const label = z.string().trim().max(60).nullish().transform((v) => (v ? v : null));
const familyName = z.string().trim().max(60).nullish().transform((v) => (v ? v : null));
const familyId = id.nullish().transform((v) => v ?? null);

export const portalOverviewQuerySchema = z.object({ pageId: id });

export const duplicatePortalBodySchema = z.object({
  pageId: id,
  sourceCourseId: id,
  title: z.string().trim().min(1).max(120),
  familyId,
  newFamilyName: familyName,
  batchLabel: label,
});

export const moveQuerySchema = z.object({ pageId: id, toCourseId: id });
export const moveBodySchema = moveQuerySchema;

export const attachPortalBodySchema = z.object({ pageId: id, courseId: id });

export const groupPortalBodySchema = z.object({
  courseId: id,
  familyId,
  newFamilyName: familyName,
  batchLabel: label,
});
