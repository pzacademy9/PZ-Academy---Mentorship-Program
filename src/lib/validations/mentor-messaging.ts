import { z } from "zod";

export const sendMessageSchema = z.object({
  body: z.string().trim().min(1).max(4000),
});
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const messageActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("hide"), messageId: z.string().uuid() }),
  z.object({ action: z.literal("delete"), messageId: z.string().uuid() }),
  z.object({ action: z.literal("clear") }),
]);
export type MessageActionInput = z.infer<typeof messageActionSchema>;
