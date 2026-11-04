import { z } from "zod";
import { AREAS } from "@/lib/team/areas";

const areaList = z.array(z.enum(AREAS)).max(AREAS.length);

export const teamAccessSchema = z.object({
  role: z.enum(["admin", "manager"]),
  extra: areaList,
  removed: areaList,
});

export const teamMemberSchema = teamAccessSchema.extend({
  email: z.string().trim().toLowerCase().email("Invalid email address").max(255),
  fullName: z.string().trim().min(1, "Name is required").max(120),
});

export type TeamAccessInput = z.infer<typeof teamAccessSchema>;
export type TeamMemberInput = z.infer<typeof teamMemberSchema>;
