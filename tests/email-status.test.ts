import { describe, it, expect } from "vitest";
import { emailStatusLine, reminderSendIso } from "@/components/admin/classes/email-status";

// Class starts 2026-11-21 14:45 UTC (7:45 pm PKT); lead 60 min, so the reminder goes out at 13:45 UTC (6:45 pm PKT).
const STARTS = "2026-11-21T14:45:00.000Z";
const aud = { mode: "live", modules: "all" } as const;
const base = { email_enabled: true, audience: aud, starts_at: STARTS, email_lead_minutes: 60 };
const before = new Date("2026-11-21T10:00:00.000Z");
const due = new Date("2026-11-21T14:00:00.000Z");
const started = new Date("2026-11-21T15:00:00.000Z");

describe("emailStatusLine", () => {
  it("asks the owner to choose who gets the email when email is on and no audience is set", () => {
    expect(emailStatusLine({ ...base, audience: null }, undefined, before)).toBe("Choose who gets this email");
  });
  it("says the reminder is switched off", () => {
    expect(emailStatusLine({ ...base, email_enabled: false, audience: null }, undefined, before)).toBe("Reminder email is switched off");
  });
  it("says Reminder set with the PKT send time while the send time is ahead", () => {
    expect(emailStatusLine(base, undefined, before)).toBe("Reminder set. Goes out Sat 21 Nov, 6:45 pm PKT");
  });
  it("says the reminder is due once the send time passed and the class has not started", () => {
    expect(emailStatusLine(base, undefined, due)).toBe("Reminder is due and goes out within a few minutes");
  });
  it("keeps 'not sent yet' once the class has started, never Reminder set", () => {
    expect(emailStatusLine(base, undefined, started)).toBe("Reminder email not sent yet");
  });
  it("sent lines still win over Reminder set", () => {
    expect(emailStatusLine(base, { reminderAt: "2026-11-21T13:46:00.000Z" } as never, before)).toMatch(/^Reminder email sent /);
    expect(emailStatusLine(base, { updateAt: "2026-11-21T13:46:00.000Z" } as never, before)).toMatch(/^Class details email sent /);
  });
});

describe("reminderSendIso", () => {
  it("is start minus the lead minutes, only while ahead", () => {
    expect(reminderSendIso(base, before)).toBe("2026-11-21T13:45:00.000Z");
    expect(reminderSendIso(base, due)).toBeNull();
    expect(reminderSendIso({ ...base, email_enabled: false }, before)).toBeNull();
    expect(reminderSendIso({ ...base, audience: null }, before)).toBeNull();
  });
});
