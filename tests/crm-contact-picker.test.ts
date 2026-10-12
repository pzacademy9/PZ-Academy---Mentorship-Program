import { describe, it, expect } from "vitest";
import { mergeContactIds, contactSendFlag, MAX_PICKED_CONTACTS, type PickerContact } from "@/lib/crm/contact-picker";
import { SEGMENT_FIELDS, buildSegmentFilters } from "@/lib/crm/segment";
import { segmentFilterSchema, segmentPreviewSchema } from "@/lib/validations/crm";

const c = (over: Partial<PickerContact> = {}): PickerContact => ({
  id: "c1", fullName: "A", email: "a@x.com", phoneE164: "+92300", unsubscribed: false, ...over,
});

describe("mergeContactIds", () => {
  it("appends and dedupes preserving order", () => {
    expect(mergeContactIds(["a", "b"], ["b", "c", "c"])).toEqual(["a", "b", "c"]);
  });
  it("stops at the cap", () => {
    expect(mergeContactIds(["a", "b"], ["c", "d"], 3)).toEqual(["a", "b", "c"]);
  });
  it("cap matches the validation schema", () => {
    const f = (n: number) => ({ field: "contact_id", op: "in", values: Array.from({ length: n }, () => "11111111-1111-4111-8111-111111111111") });
    expect(segmentFilterSchema.safeParse(f(MAX_PICKED_CONTACTS)).success).toBe(true);
    expect(segmentFilterSchema.safeParse(f(MAX_PICKED_CONTACTS + 1)).success).toBe(false);
  });
  it("server rejects an empty contact_id filter instead of matching everyone", () => {
    expect(segmentFilterSchema.safeParse({ field: "contact_id", op: "in", values: [] }).success).toBe(false);
    expect(segmentPreviewSchema.safeParse({ segment: [{ field: "contact_id", op: "in", values: [] }] }).success).toBe(false);
  });
});

describe("contactSendFlag", () => {
  it("flags missing email, unsubscribed", () => {
    expect(contactSendFlag(c({ email: null }), "email")).toBe("no email");
    expect(contactSendFlag(c({ unsubscribed: true }), "email")).toBe("unsubscribed");
    expect(contactSendFlag(c(), "email")).toBeNull();
  });
  it("whatsapp only flags a missing phone, ignoring email unsubscribe", () => {
    expect(contactSendFlag(c({ phoneE164: null }), "whatsapp")).toBe("no phone");
    expect(contactSendFlag(c({ email: null, unsubscribed: true }), "whatsapp")).toBeNull();
  });
});

describe("SEGMENT_FIELDS", () => {
  it("offers Specific contacts in the dropdown", () => {
    expect(SEGMENT_FIELDS.find((f) => f.field === "contact_id")?.label).toBe("Specific contacts");
  });
});

describe("buildSegmentFilters", () => {
  it("refuses an empty contact_id filter rather than matching everyone", () => {
    expect(() => buildSegmentFilters([{ field: "contact_id", op: "in", values: [] }])).toThrow();
  });
});
