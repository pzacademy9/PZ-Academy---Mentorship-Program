import { describe, it, expect } from "vitest";
import { carryOverFields, type CarryOverSource } from "@/lib/crm/merge-carryover";

const blank: CarryOverSource = { do_not_contact_at: null, whatsapp_unsubscribed_at: null, owner_id: null, claimed_at: null };

describe("carryOverFields", () => {
  it("returns an empty patch when neither side has anything", () => {
    expect(carryOverFields(blank, blank)).toEqual({});
  });

  it("carries the merged contact's opt-outs when the kept contact has none", () => {
    expect(
      carryOverFields(blank, { ...blank, do_not_contact_at: "2026-03-01T00:00:00Z", whatsapp_unsubscribed_at: "2026-04-01T00:00:00Z" }),
    ).toEqual({ do_not_contact_at: "2026-03-01T00:00:00Z", whatsapp_unsubscribed_at: "2026-04-01T00:00:00Z" });
  });

  it("earliest wins when both have a timestamp", () => {
    const early = "2026-01-01T00:00:00Z";
    const late = "2026-05-01T00:00:00Z";
    expect(carryOverFields({ ...blank, do_not_contact_at: late }, { ...blank, do_not_contact_at: early })).toEqual({
      do_not_contact_at: early,
    });
    expect(carryOverFields({ ...blank, do_not_contact_at: early }, { ...blank, do_not_contact_at: late })).toEqual({});
  });

  it("keeps the kept contact's value when the merged one is null", () => {
    expect(carryOverFields({ ...blank, whatsapp_unsubscribed_at: "2026-02-01T00:00:00Z" }, blank)).toEqual({});
  });

  it("copies owner and claimed_at only when the kept contact has no owner", () => {
    const merged = { ...blank, owner_id: "agent-2", claimed_at: "2026-06-01T00:00:00Z" };
    expect(carryOverFields(blank, merged)).toEqual({ owner_id: "agent-2", claimed_at: "2026-06-01T00:00:00Z" });
    expect(carryOverFields({ ...blank, owner_id: "agent-1", claimed_at: "2026-07-01T00:00:00Z" }, merged)).toEqual({});
  });

  it("does not invent an owner when the merged contact has none", () => {
    expect(carryOverFields(blank, { ...blank, claimed_at: "2026-06-01T00:00:00Z" })).toEqual({});
  });
});
