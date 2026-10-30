import { describe, it, expect } from "vitest";
import { emailStatusLine } from "@/components/admin/classes/email-status";

describe("emailStatusLine with audiences", () => {
  it("asks the owner to choose who gets the email when email is on and no audience is set", () => {
    expect(emailStatusLine({ email_enabled: true, audience: null }, undefined)).toBe("Choose who gets this email");
  });
  it("keeps the existing wording otherwise", () => {
    expect(emailStatusLine({ email_enabled: true, audience: { mode: "live", modules: "all" } }, undefined)).toBe("Reminder email not sent yet");
    expect(emailStatusLine({ email_enabled: false, audience: null }, undefined)).toBe("Reminder email is switched off");
  });
});
