import { describe, it, expect } from "vitest";
import { planRecipients, summarize } from "@/lib/landing/participants/recipients";
import type { Candidate } from "@/lib/landing/participants/types";

const c = (o: Partial<Candidate>): Candidate => ({
  registrationId: "r", leadId: "l", isMember: false, name: "A", email: "a@x.com", phone: "+921", refId: "R", status: "paid", ...o,
});

describe("planRecipients", () => {
  it("merges same email case-insensitively, keeping first", () => {
    const p = planRecipients([c({ registrationId: "1", email: "A@x.com" }), c({ registrationId: "2", email: " a@X.com " })], "email", new Set());
    expect(p.send.map((x) => x.registrationId)).toEqual(["1"]);
    expect(p.skipped).toEqual([{ candidate: expect.objectContaining({ registrationId: "2" }), reason: "merged" }]);
  });
  it("empty email: no_email for email, kept for whatsapp", () => {
    const x = c({ email: "" });
    expect(planRecipients([x], "email", new Set()).skipped[0].reason).toBe("no_email");
    expect(planRecipients([x], "whatsapp", new Set()).send).toHaveLength(1);
  });
  it("empty phone: no_phone for whatsapp only", () => {
    const x = c({ phone: " " });
    expect(planRecipients([x], "whatsapp", new Set()).skipped[0].reason).toBe("no_phone");
    expect(planRecipients([x], "email", new Set()).send).toHaveLength(1);
  });
  it("unsubscribed skipped for email only", () => {
    const x = c({});
    const u = new Set(["a@x.com"]);
    expect(planRecipients([x], "email", u).skipped[0].reason).toBe("unsubscribed");
    expect(planRecipients([x], "whatsapp", u).send).toHaveLength(1);
  });
});

describe("summarize", () => {
  it("counts statuses, notPaid, members, skipped", () => {
    const list = [
      c({ registrationId: "1", email: "1@x.com", status: "paid" }),
      c({ registrationId: "2", email: "2@x.com", status: "pending", isMember: true }),
      c({ registrationId: "3", email: "3@x.com", status: "reserved" }),
      c({ registrationId: "4", email: "4@x.com", status: "underpaid" }),
      c({ registrationId: "5", email: "5@x.com", status: "free" }),
      c({ registrationId: "6", email: "" }),
    ];
    const s = summarize(planRecipients(list, "email", new Set()), "email");
    expect(s.total).toBe(5);
    expect(s.byStatus).toEqual({ pending: 1, reserved: 1, underpaid: 1, paid: 1, free: 1 });
    expect(s.notPaid).toBe(4);
    expect(s.members).toBe(1);
    expect(s.skipped.no_email).toBe(1);
    expect(s.skipped.merged).toBe(0);
  });
});
