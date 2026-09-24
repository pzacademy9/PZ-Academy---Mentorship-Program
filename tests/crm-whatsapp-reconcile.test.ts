import { describe, it, expect } from "vitest";
import { reconcileWhatsAppSegment } from "@/lib/crm/whatsapp-batch-reconcile";

describe("reconcileWhatsAppSegment", () => {
  it("inserts a newly-matching contact that isn't already a recipient", () => {
    const result = reconcileWhatsAppSegment(
      [{ id: "c1", fullName: "Ayesha Khan", phoneE164: "+923001234567" }],
      [],
    );
    expect(result.toInsert).toEqual([{ contactId: "c1", fullName: "Ayesha Khan", phoneE164: "+923001234567" }]);
    expect(result.toDeleteIds).toEqual([]);
  });

  it("does not re-insert a contact that is already a recipient, matching or not", () => {
    const result = reconcileWhatsAppSegment(
      [{ id: "c1", fullName: "Ayesha Khan", phoneE164: "+923001234567" }],
      [{ id: "r1", contactId: "c1", status: "pending" }],
    );
    expect(result.toInsert).toEqual([]);
  });

  it("deletes a pending recipient whose contact no longer matches the segment", () => {
    const result = reconcileWhatsAppSegment(
      [],
      [{ id: "r1", contactId: "c1", status: "pending" }],
    );
    expect(result.toDeleteIds).toEqual(["r1"]);
  });

  it("never deletes a sent recipient, even if their contact no longer matches", () => {
    const result = reconcileWhatsAppSegment(
      [],
      [{ id: "r1", contactId: "c1", status: "sent" }],
    );
    expect(result.toDeleteIds).toEqual([]);
  });

  it("never deletes a recipient with no contact_id, regardless of status", () => {
    const result = reconcileWhatsAppSegment(
      [],
      [{ id: "r1", contactId: null, status: "pending" }],
    );
    expect(result.toDeleteIds).toEqual([]);
  });

  it("leaves a still-matching pending recipient untouched", () => {
    const result = reconcileWhatsAppSegment(
      [{ id: "c1", fullName: "Ayesha Khan", phoneE164: "+923001234567" }],
      [{ id: "r1", contactId: "c1", status: "pending" }],
    );
    expect(result.toInsert).toEqual([]);
    expect(result.toDeleteIds).toEqual([]);
  });
});
