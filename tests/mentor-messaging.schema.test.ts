import { describe, it, expect } from "vitest";
import { sendMessageSchema } from "@/lib/validations/mentor-messaging";

describe("sendMessageSchema", () => {
  it("accepts a normal message body", () => {
    const r = sendMessageSchema.safeParse({ body: "Hey, quick question about Thursday's session." });
    expect(r.success).toBe(true);
  });

  it("trims and rejects an empty body", () => {
    const r = sendMessageSchema.safeParse({ body: "   " });
    expect(r.success).toBe(false);
  });

  it("rejects a missing body", () => {
    const r = sendMessageSchema.safeParse({});
    expect(r.success).toBe(false);
  });

  it("rejects a body over 4000 characters", () => {
    const r = sendMessageSchema.safeParse({ body: "a".repeat(4001) });
    expect(r.success).toBe(false);
  });

  it("accepts a body at exactly 4000 characters", () => {
    const r = sendMessageSchema.safeParse({ body: "a".repeat(4000) });
    expect(r.success).toBe(true);
  });
});
