import { describe, it, expect } from "vitest";
import {
  assignSchema,
  contactsQuerySchema,
  leadSchema,
  noteSchema,
  numberCreateSchema,
  outcomeSchema,
  sanitizeSearch,
  sendRequestSchema,
  settingsUpdateSchema,
} from "@/lib/validations/sales";
import { statusForReason } from "@/lib/api/sales-http";

const uuid = "11111111-1111-4111-8111-111111111111";

describe("outcomeSchema", () => {
  it("accepts the four outcomes and the stop flag", () => {
    expect(outcomeSchema.safeParse({ kind: "replied" }).success).toBe(true);
    expect(outcomeSchema.safeParse({ kind: "not_interested", askedToStop: true }).success).toBe(true);
  });
  it("rejects unknown kinds and a stop flag on other outcomes", () => {
    expect(outcomeSchema.safeParse({ kind: "sent" }).success).toBe(false);
    expect(outcomeSchema.safeParse({ kind: "replied", askedToStop: true }).success).toBe(false);
  });
});

describe("noteSchema", () => {
  it("trims and requires text", () => {
    expect(noteSchema.parse({ body: "  hello  " }).body).toBe("hello");
    expect(noteSchema.safeParse({ body: "   " }).success).toBe(false);
    expect(noteSchema.safeParse({ body: "x".repeat(2001) }).success).toBe(false);
  });
});

describe("sendRequestSchema", () => {
  it("needs a number id and a message", () => {
    expect(sendRequestSchema.safeParse({ numberId: uuid, messageTemplate: "Salam {{first_name}}" }).success).toBe(true);
    expect(sendRequestSchema.safeParse({ numberId: "x", messageTemplate: "hi" }).success).toBe(false);
    expect(sendRequestSchema.safeParse({ numberId: uuid, messageTemplate: " " }).success).toBe(false);
  });
});

describe("leadSchema", () => {
  it("needs a phone; the rest is optional", () => {
    expect(leadSchema.safeParse({ phone: "03001234567" }).success).toBe(true);
    expect(leadSchema.safeParse({ name: "Ayesha" }).success).toBe(false);
    expect(leadSchema.safeParse({ phone: "0300", email: "not-an-email" }).success).toBe(false);
  });
});

describe("contactsQuerySchema", () => {
  it("defaults to the mine tab, page 1", () => {
    expect(contactsQuerySchema.parse({})).toMatchObject({ tab: "mine", page: 1 });
  });
  it("rejects a bad tab and page 0", () => {
    expect(contactsQuerySchema.safeParse({ tab: "everyone" }).success).toBe(false);
    expect(contactsQuerySchema.safeParse({ page: "0" }).success).toBe(false);
  });
  it("coerces the page from a query string", () => {
    expect(contactsQuerySchema.parse({ page: "3" }).page).toBe(3);
  });
});

describe("sanitizeSearch", () => {
  it("removes characters that break PostgREST or() filters", () => {
    expect(sanitizeSearch("a,b(c)%d*e\\f")).toBe("a b c d e f");
  });
  it("strips double quotes", () => {
    expect(sanitizeSearch('a"b')).toBe("a b");
  });
  it("collapses whitespace and trims", () => {
    expect(sanitizeSearch("  Aye   sha ")).toBe("Aye sha");
  });
  it("caps the length", () => {
    expect(sanitizeSearch("x".repeat(200))).toHaveLength(80);
  });
});

describe("number and settings schemas", () => {
  it("creates a number with a label", () => {
    expect(numberCreateSchema.safeParse({ label: "DMC campaign number 2", agentIds: [uuid] }).success).toBe(true);
    expect(numberCreateSchema.safeParse({ label: " ", agentIds: [] }).success).toBe(false);
  });
  it("settings must keep spacing max >= min and warn <= hourly cap", () => {
    expect(settingsUpdateSchema.safeParse({ spacing_min_s: 90, spacing_max_s: 60 }).success).toBe(false);
    expect(settingsUpdateSchema.safeParse({ hourly_cap: 10, hourly_warn_at: 15 }).success).toBe(false);
    expect(settingsUpdateSchema.safeParse({ daily_cap: 60 }).success).toBe(true);
    expect(settingsUpdateSchema.safeParse({ daily_cap: 0 }).success).toBe(false);
  });
  it("rejects an unknown timezone", () => {
    expect(settingsUpdateSchema.safeParse({ timezone: "Mars/Olympus" }).success).toBe(false);
    expect(settingsUpdateSchema.safeParse({ timezone: "Asia/Karachi" }).success).toBe(true);
  });
});

describe("assignSchema", () => {
  it("allows releasing (agentId null) and assigning, 1-500 contacts", () => {
    expect(assignSchema.safeParse({ contactIds: [uuid], agentId: null }).success).toBe(true);
    expect(assignSchema.safeParse({ contactIds: [uuid], agentId: uuid }).success).toBe(true);
    expect(assignSchema.safeParse({ contactIds: [], agentId: uuid }).success).toBe(false);
  });
});

describe("statusForReason", () => {
  it("maps reasons to HTTP statuses", () => {
    expect(statusForReason("not-found")).toBe(404);
    expect(statusForReason("not-owner")).toBe(403);
    expect(statusForReason("not-allowed")).toBe(403);
    expect(statusForReason("number-not-assigned")).toBe(403);
    expect(statusForReason("already-claimed")).toBe(409);
    expect(statusForReason("do-not-contact")).toBe(409);
    expect(statusForReason("daily_cap")).toBe(429);
    expect(statusForReason("spacing")).toBe(429);
    expect(statusForReason("quiet_hours")).toBe(429);
    expect(statusForReason("db-error")).toBe(500);
    expect(statusForReason("something-new")).toBe(400);
  });
});
