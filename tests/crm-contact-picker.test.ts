import { describe, it, expect } from "vitest";
import { mergeContactIds, contactSendFlag, MAX_PICKED_CONTACTS, type PickerContact } from "@/lib/crm/contact-picker";
import { SEGMENT_FIELDS } from "@/lib/crm/segment";

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
    expect(MAX_PICKED_CONTACTS).toBe(500);
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
