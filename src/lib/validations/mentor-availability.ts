import { z } from "zod";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const weeklyRangeSchema = z
  .object({
    day: z.number().int().min(0).max(6),
    start: z.string().regex(TIME_RE, "Expected HH:MM"),
    end: z.string().regex(TIME_RE, "Expected HH:MM"),
  })
  .refine((r) => r.start < r.end, { message: "end must be after start", path: ["end"] });

export const mentorAvailabilitySchema = z.object({
  timezone: z.string().trim().min(1).max(100),
  weeklyRanges: z.array(weeklyRangeSchema).max(70), // 7 days * up to 10 ranges/day, generous ceiling
});

export type MentorAvailabilityInput = z.infer<typeof mentorAvailabilitySchema>;
