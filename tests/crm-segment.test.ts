import { describe, it, expect } from "vitest";
import { buildSegmentFilters, EMAIL_SENDABLE_GUARD, WHATSAPP_REACHABLE_GUARD, type SegmentFilter } from "@/lib/crm/segment";

describe("buildSegmentFilters", () => {
  it("always appends the email guard by default, even for an empty segment", () => {
    // The single most important behaviour here. An admin must not be able to
    // construct a segment that includes unsubscribed or bounced addresses.
    expect(buildSegmentFilters([])).toEqual(EMAIL_SENDABLE_GUARD);
  });

  it("keeps the guard when other filters are present", () => {
    const ops = buildSegmentFilters([{ field: "country", op: "in", values: ["PK"] }]);
    for (const guardOp of EMAIL_SENDABLE_GUARD) expect(ops).toContainEqual(guardOp);
  });

  it("maps row_type to an array containment check", () => {
    // row_types is an aggregated array on the view, so "is a group leader"
    // is containment, not equality.
    expect(buildSegmentFilters([{ field: "row_type", op: "eq", value: "group_leader" }])).toEqual([
      { kind: "contains", column: "row_types", values: ["group_leader"] },
      ...EMAIL_SENDABLE_GUARD,
    ]);
  });

  it("maps contact_id to a scalar id membership check", () => {
    // Unlike the other list filters (import_batch_id, course_id), contact_id
    // targets the row's own id column directly, not an aggregated array.
    expect(buildSegmentFilters([{ field: "contact_id", op: "in", values: ["c1", "c2"] }])).toEqual([
      { kind: "in", column: "id", values: ["c1", "c2"] },
      ...EMAIL_SENDABLE_GUARD,
    ]);
  });

  it("maps import_batch_id to an array overlap check", () => {
    expect(buildSegmentFilters([{ field: "import_batch_id", op: "in", values: ["b1", "b2"] }])).toEqual([
      { kind: "overlaps", column: "import_batch_ids", values: ["b1", "b2"] },
      ...EMAIL_SENDABLE_GUARD,
    ]);
  });

  it("maps course_id to an array overlap check", () => {
    expect(buildSegmentFilters([{ field: "course_id", op: "in", values: ["c1", "c2"] }])).toEqual([
      { kind: "overlaps", column: "course_ids", values: ["c1", "c2"] },
      ...EMAIL_SENDABLE_GUARD,
    ]);
  });

  it("maps product_label to a case-insensitive substring match", () => {
    expect(buildSegmentFilters([{ field: "product_label", op: "contains", value: "Early Bird" }])).toEqual([
      { kind: "ilike", column: "product_labels_text", pattern: "%Early Bird%" },
      ...EMAIL_SENDABLE_GUARD,
    ]);
  });

  it("maps scalar contact fields directly", () => {
    expect(buildSegmentFilters([{ field: "discovery_source", op: "in", values: ["instagram", "facebook"] }])).toEqual([
      { kind: "in", column: "discovery_source", values: ["instagram", "facebook"] },
      ...EMAIL_SENDABLE_GUARD,
    ]);
    expect(buildSegmentFilters([{ field: "has_platform_account", op: "eq", value: false }])).toEqual([
      { kind: "eq", column: "has_platform_account", value: false },
      ...EMAIL_SENDABLE_GUARD,
    ]);
  });

  it("maps purchase_count comparisons", () => {
    expect(buildSegmentFilters([{ field: "purchase_count", op: "gte", value: 2 }])).toEqual([
      { kind: "gte", column: "purchase_count", value: 2 },
      ...EMAIL_SENDABLE_GUARD,
    ]);
  });

  it("maps last_purchase_at before/after to lt/gt", () => {
    expect(buildSegmentFilters([{ field: "last_purchase_at", op: "before", value: "2026-03-01" }])).toEqual([
      { kind: "lt", column: "last_purchase_at", value: "2026-03-01" },
      ...EMAIL_SENDABLE_GUARD,
    ]);
    expect(buildSegmentFilters([{ field: "last_purchase_at", op: "after", value: "2026-03-01" }])).toEqual([
      { kind: "gt", column: "last_purchase_at", value: "2026-03-01" },
      ...EMAIL_SENDABLE_GUARD,
    ]);
  });

  it("combines several filters and still guards once", () => {
    const filters: SegmentFilter[] = [
      { field: "row_type", op: "eq", value: "group_leader" },
      { field: "purchase_count", op: "gte", value: 2 },
      { field: "country", op: "in", values: ["PK"] },
    ];
    const ops = buildSegmentFilters(filters);
    expect(ops).toHaveLength(3 + EMAIL_SENDABLE_GUARD.length);
    expect(ops.filter((o) => o.column === "is_sendable")).toHaveLength(1);
  });

  it("drops an empty values list rather than producing a match-nothing query", () => {
    // An unfinished filter in the builder UI must not silently empty the
    // whole segment.
    expect(buildSegmentFilters([{ field: "country", op: "in", values: [] }])).toEqual(EMAIL_SENDABLE_GUARD);
  });

  it("appends the WhatsApp guard instead when given one explicitly", () => {
    expect(buildSegmentFilters([], WHATSAPP_REACHABLE_GUARD)).toEqual(WHATSAPP_REACHABLE_GUARD);
    expect(WHATSAPP_REACHABLE_GUARD).toEqual([
      { kind: "not-null", column: "phone_e164" },
      { kind: "is-null", column: "whatsapp_unsubscribed_at" },
      { kind: "is-null", column: "do_not_contact_at" },
    ]);
  });

  it("combines filters with the WhatsApp guard the same way it does the email guard", () => {
    const ops = buildSegmentFilters([{ field: "country", op: "in", values: ["PK"] }], WHATSAPP_REACHABLE_GUARD);
    expect(ops).toEqual([
      { kind: "in", column: "country", values: ["PK"] },
      { kind: "not-null", column: "phone_e164" },
      { kind: "is-null", column: "whatsapp_unsubscribed_at" },
      { kind: "is-null", column: "do_not_contact_at" },
    ]);
  });
});
