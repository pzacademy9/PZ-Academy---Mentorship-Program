import { describe, it, expect } from "vitest";
import { registerPayloadSchema } from "@/lib/landing/registration/submit-schema";

const valid = (over: Record<string, unknown> = {}) => ({
  regionKey: "PK", mode: "live", optionKeys: ["full"], tierKey: "individual", groupSize: 1,
  lead: {
    name: "  Ayesha Khan ", email: "  Ayesha.Khan@Example.COM ", whatsapp: "+92 370 0199429", profession: "Pharmacist",
    city: "Lahore", discovery: "WhatsApp", consent: true,
  },
  members: [],
  paymentMethod: "faysal",
  promoCode: " ppc10 ",
  honeypot: "",
  attribution: { refCode: "ayesha-7k2", utm: { utm_source: "facebook", utm_campaign: "ppc-b4" }, fbp: "fb.1.1700000000.123", fbc: "", eventId: "evt-1", sessionId: "sess-1" },
  testMode: false,
  ...over,
});
const member = (n: number) => ({ name: `Member ${n}`, email: `member${n}@example.com`, whatsapp: "03001234567", profession: "Nurse" });
const parse = (v: unknown) => registerPayloadSchema.safeParse(v);
const firstPath = (v: unknown) => {
  const r = parse(v);
  return r.success ? null : r.error.issues[0].path.join(".");
};

describe("registerPayloadSchema: accepts and cleans", () => {
  it("trims names, lower-cases emails, upper-cases the promo code", () => {
    const r = parse(valid());
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.lead.name).toBe("Ayesha Khan");
    expect(r.data.lead.email).toBe("ayesha.khan@example.com");
    expect(r.data.promoCode).toBe("PPC10");
    expect(r.data.testMode).toBe(false);
  });
  it("accepts a group of 3 with two members", () => {
    expect(parse(valid({ tierKey: "group3", groupSize: 3, members: [member(1), member(2)] })).success).toBe(true);
  });
  it("defaults the optional lead fields and strips a client total", () => {
    const v = valid({ total: 1 }) as Record<string, unknown> & { lead: Record<string, unknown> };
    delete v.lead.city;
    delete v.lead.discovery;
    const r = parse(v);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.lead.city).toBe("");
    expect(r.data).not.toHaveProperty("total");
  });
});

describe("registerPayloadSchema: rejects", () => {
  it("a one-letter name", () => expect(firstPath(valid({ lead: { ...valid().lead, name: "A" } }))).toBe("lead.name"));
  it("a bad email", () => expect(firstPath(valid({ lead: { ...valid().lead, email: "ayesha@" } }))).toBe("lead.email"));
  it("a WhatsApp number under 10 digits or with letters", () => {
    expect(firstPath(valid({ lead: { ...valid().lead, whatsapp: "0300 12345" } }))).toBe("lead.whatsapp");
    expect(firstPath(valid({ lead: { ...valid().lead, whatsapp: "call me 03001234567" } }))).toBe("lead.whatsapp");
  });
  it("no profession", () => expect(firstPath(valid({ lead: { ...valid().lead, profession: " " } }))).toBe("lead.profession"));
  it("consent not given", () => {
    const r = parse(valid({ lead: { ...valid().lead, consent: false } }));
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.issues[0].path.join(".")).toBe("lead.consent");
    expect(r.error.issues[0].message).toMatch(/accept the registration terms/);
  });
  it("a filled honeypot", () => expect(firstPath(valid({ honeypot: "http://spam" }))).toBe("honeypot"));
  it("a member count that does not match the group size", () => {
    expect(firstPath(valid({ tierKey: "group3", groupSize: 3, members: [member(1)] }))).toBe("members");
    expect(firstPath(valid({ members: [member(1)] }))).toBe("members");
  });
  it("two people with the same email", () => {
    const r = parse(valid({ tierKey: "group3", groupSize: 3, members: [member(1), { ...member(2), email: "AYESHA.KHAN@example.com" }] }));
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.issues.some((i) => i.path.join(".") === "members" && /own email/.test(i.message))).toBe(true);
  });
  it("an unknown mode and out-of-range group sizes", () => {
    expect(firstPath(valid({ mode: "hybrid" }))).toBe("mode");
    expect(firstPath(valid({ groupSize: 0 }))).toBe("groupSize");
    expect(firstPath(valid({ groupSize: 51 }))).toBe("groupSize");
  });
  it("an empty option list", () => expect(firstPath(valid({ optionKeys: [] }))).toBe("optionKeys"));
});

describe("registerPayloadSchema: attribution never blocks a registration", () => {
  it("drops over-long or malformed tracking values instead of failing", () => {
    const r = parse(valid({
      attribution: { refCode: "<script>", utm: { utm_campaign: "x".repeat(201) }, fbp: "p".repeat(201), fbc: "c".repeat(501), eventId: "e".repeat(101), sessionId: 5 },
    }));
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.attribution).toEqual({ refCode: "", utm: {}, fbp: "", fbc: "", eventId: "", sessionId: "" });
  });
  it("keeps at most 10 UTM keys, otherwise drops them all", () => {
    const utm = Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`k${i}`, "v"]));
    const r = parse(valid({ attribution: { ...valid().attribution, utm } }));
    expect(r.success && r.data.attribution.utm).toEqual({});
  });
  it("fills an empty attribution when it is missing", () => {
    const v = valid() as Record<string, unknown>;
    delete v.attribution;
    const r = parse(v);
    expect(r.success && r.data.attribution).toEqual({ refCode: "", utm: {}, fbp: "", fbc: "", eventId: "", sessionId: "" });
  });
});
