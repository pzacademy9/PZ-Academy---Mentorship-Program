import { z } from "zod";

export const bookSessionsSchema = z.object({
  bookingId: z.string().uuid(),
  slots: z.array(z.string().datetime()).min(1).max(20),
});
export type BookSessionsInput = z.infer<typeof bookSessionsSchema>;

export const scheduleSessionSchema = z.object({
  bookingId: z.string().uuid(),
  scheduledAt: z.string().datetime(),
});
export type ScheduleSessionInput = z.infer<typeof scheduleSessionSchema>;

export const sessionStatusUpdateSchema = z.object({
  status: z.enum(["completed", "cancelled"]),
});
export type SessionStatusUpdateInput = z.infer<typeof sessionStatusUpdateSchema>;

export const updateMentorNotesSchema = z.object({
  notes: z.string().max(5000),
});
export type UpdateMentorNotesInput = z.infer<typeof updateMentorNotesSchema>;
