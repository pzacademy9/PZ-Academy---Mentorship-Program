import { describe, it, expect } from "vitest";
import {
  importPreviewSchema,
  importCommitSchema,
  mergeResolveSchema,
  segmentFilterSchema,
  segmentPreviewSchema,
  campaignCreateSchema,
  whatsappBatchCreateSchema,
  whatsappBatchUpdateSchema,
  whatsappRecipientStatusSchema,
  templateCreateSchema,
} from "@/lib/validations/crm";

const MAPPING = { name: 0, email: 1, phone: 2, profession: 3, discovery: 4, product: 5, rowType: 7, promoCode: 8, purchasedAt: null };

describe("importPreviewSchema", () => {
  it("accepts a sheet id, tab name, and mapping", () => {
    const parsed = importPreviewSchema.safeParse({ sheetId: "1c6P6fNlXkLlmJif1a", tabName: "Form Responses 1", mapping: MAPPING });
    expect(parsed.success).toBe(true);
  });

  it("rejects a mapping with no email and no phone column", () => {
    // Without at least one identity column every row would be rejected as
    // no-identity, so this is caught at the boundary rather than after a
    // full sheet read.
    const parsed = importPreviewSchema.safeParse({
      sheetId: "abc", tabName: "S",
      mapping: { ...MAPPING, email: null, phone: null },
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a blank tab name", () => {
    expect(importPreviewSchema.safeParse({ sheetId: "abc", tabName: "", mapping: MAPPING }).success).toBe(false);
  });

  it("rejects a negative column index", () => {
    expect(importPreviewSchema.safeParse({ sheetId: "abc", tabName: "S", mapping: { ...MAPPING, name: -1 } }).success).toBe(false);
  });
});

describe("importCommitSchema", () => {
  it("accepts an optional courseId", () => {
    const parsed = importCommitSchema.safeParse({
      sheetId: "abc", tabName: "S", mapping: MAPPING,
      sheetName: "MDC3 Master Sheet",
      courseId: "3f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts a commit with no courseId, since most cohorts have no course row", () => {
    const parsed = importCommitSchema.safeParse({ sheetId: "abc", tabName: "S", mapping: MAPPING, sheetName: "X" });
    expect(parsed.success).toBe(true);
  });

  it("rejects a non-uuid courseId", () => {
    expect(importCommitSchema.safeParse({ sheetId: "a", tabName: "S", mapping: MAPPING, sheetName: "X", courseId: "nope" }).success).toBe(false);
  });
});

describe("mergeResolveSchema", () => {
  it("accepts merge and reject decisions", () => {
    expect(mergeResolveSchema.safeParse({ decision: "merge" }).success).toBe(true);
    expect(mergeResolveSchema.safeParse({ decision: "reject" }).success).toBe(true);
  });

  it("rejects any other decision", () => {
    expect(mergeResolveSchema.safeParse({ decision: "delete" }).success).toBe(false);
  });
});

describe("segmentFilterSchema", () => {
  it("accepts a row_type filter", () => {
    expect(segmentFilterSchema.safeParse({ field: "row_type", op: "eq", value: "group_leader" }).success).toBe(true);
  });

  it("accepts a purchase_count comparison", () => {
    expect(segmentFilterSchema.safeParse({ field: "purchase_count", op: "gte", value: 2 }).success).toBe(true);
  });

  it("rejects an unknown field", () => {
    expect(segmentFilterSchema.safeParse({ field: "salary", op: "gte", value: 2 }).success).toBe(false);
  });

  it("rejects an operator that does not belong to the field", () => {
    expect(segmentFilterSchema.safeParse({ field: "purchase_count", op: "contains", value: 2 }).success).toBe(false);
  });

  it("rejects an in-filter with an empty value list", () => {
    // An empty list would drop the predicate entirely and silently widen the
    // segment to every contact.
    expect(segmentFilterSchema.safeParse({ field: "country", op: "in", values: [] }).success).toBe(false);
    expect(segmentFilterSchema.safeParse({ field: "discovery_source", op: "in", values: [] }).success).toBe(false);
  });

  it("rejects a contains-filter with a blank value", () => {
    expect(segmentFilterSchema.safeParse({ field: "product_label", op: "contains", value: "  " }).success).toBe(false);
  });
});

describe("campaignCreateSchema", () => {
  it("accepts a complete draft", () => {
    const parsed = campaignCreateSchema.safeParse({
      name: "Win-back March",
      subject: "Hi {{first_name}}, your next step",
      bodyHtml: "<p>Hello</p>",
      segment: [{ field: "purchase_count", op: "gte", value: 2 }],
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts an empty segment, which means every sendable contact", () => {
    const parsed = campaignCreateSchema.safeParse({ name: "All", subject: "S", bodyHtml: "<p>x</p>", segment: [] });
    expect(parsed.success).toBe(true);
  });

  it("rejects a blank name, subject, or body", () => {
    expect(campaignCreateSchema.safeParse({ name: "", subject: "S", bodyHtml: "<p>x</p>", segment: [] }).success).toBe(false);
    expect(campaignCreateSchema.safeParse({ name: "N", subject: "", bodyHtml: "<p>x</p>", segment: [] }).success).toBe(false);
    expect(campaignCreateSchema.safeParse({ name: "N", subject: "S", bodyHtml: "", segment: [] }).success).toBe(false);
  });
});

describe("segmentPreviewSchema", () => {
  it("defaults channel to email when omitted", () => {
    const parsed = segmentPreviewSchema.safeParse({ segment: [] });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.channel).toBe("email");
  });

  it("accepts an explicit whatsapp channel", () => {
    const parsed = segmentPreviewSchema.safeParse({ segment: [], channel: "whatsapp" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.channel).toBe("whatsapp");
  });

  it("rejects an unknown channel", () => {
    expect(segmentPreviewSchema.safeParse({ segment: [], channel: "sms" }).success).toBe(false);
  });
});

describe("whatsappBatchCreateSchema", () => {
  it("accepts a complete batch", () => {
    const parsed = whatsappBatchCreateSchema.safeParse({
      name: "W20 WhatsApp follow-up",
      messageTemplate: "Hi {{first_name}}, ...",
      segment: [{ field: "country", op: "in", values: ["PK"] }],
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts an empty segment, which means everyone phone-reachable", () => {
    const parsed = whatsappBatchCreateSchema.safeParse({ name: "All", messageTemplate: "Hi", segment: [] });
    expect(parsed.success).toBe(true);
  });

  it("rejects a blank name or message", () => {
    expect(whatsappBatchCreateSchema.safeParse({ name: "", messageTemplate: "Hi", segment: [] }).success).toBe(false);
    expect(whatsappBatchCreateSchema.safeParse({ name: "N", messageTemplate: "", segment: [] }).success).toBe(false);
  });
});

describe("whatsappBatchUpdateSchema", () => {
  it("accepts a new message template", () => {
    const parsed = whatsappBatchUpdateSchema.safeParse({ messageTemplate: "Hi {{first_name}}, updated." });
    expect(parsed.success).toBe(true);
  });

  it("rejects a blank message", () => {
    expect(whatsappBatchUpdateSchema.safeParse({ messageTemplate: "" }).success).toBe(false);
  });

  it("rejects a message over 4096 characters, matching the create schema's limit", () => {
    expect(whatsappBatchUpdateSchema.safeParse({ messageTemplate: "a".repeat(4097) }).success).toBe(false);
  });
});

describe("whatsappRecipientStatusSchema", () => {
  it("accepts pending and sent", () => {
    expect(whatsappRecipientStatusSchema.safeParse({ status: "pending" }).success).toBe(true);
    expect(whatsappRecipientStatusSchema.safeParse({ status: "sent" }).success).toBe(true);
  });

  it("rejects any other status", () => {
    expect(whatsappRecipientStatusSchema.safeParse({ status: "delivered" }).success).toBe(false);
  });
});

describe("templateCreateSchema", () => {
  it("accepts a whatsapp template with no subject", () => {
    const parsed = templateCreateSchema.safeParse({
      channel: "whatsapp",
      name: "Follow-up",
      body: "Hi {{first_name}}, ...",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts an email template with a subject", () => {
    const parsed = templateCreateSchema.safeParse({
      channel: "email",
      name: "Welcome",
      subject: "Welcome to PZ Academy",
      body: "<p>Hi {{first_name}}</p>",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an email template with no subject", () => {
    expect(
      templateCreateSchema.safeParse({ channel: "email", name: "Welcome", body: "<p>Hi</p>" }).success,
    ).toBe(false);
  });

  it("rejects an email template with a blank subject", () => {
    expect(
      templateCreateSchema.safeParse({ channel: "email", name: "Welcome", subject: "  ", body: "<p>Hi</p>" })
        .success,
    ).toBe(false);
  });

  it("rejects a blank name or body", () => {
    expect(templateCreateSchema.safeParse({ channel: "whatsapp", name: "", body: "Hi" }).success).toBe(false);
    expect(templateCreateSchema.safeParse({ channel: "whatsapp", name: "N", body: "" }).success).toBe(false);
  });

  it("rejects an unknown channel", () => {
    expect(templateCreateSchema.safeParse({ channel: "sms", name: "N", body: "Hi" }).success).toBe(false);
  });
});
